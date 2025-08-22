import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';
import { supabase } from './supabase';

// Mock Supabase client
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    schema: vi.fn(() => ({
      from: vi.fn()
    })),
    from: vi.fn(),
    storage: {
      from: vi.fn(),
      listBuckets: vi.fn(),
      createBucket: vi.fn()
    },
    functions: {
      invoke: vi.fn()
    }
  }
}));

describe('API Module', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockOrg = { org_id: 'org-456', role: 'admin' };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock responses
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockOrg, error: null }))
        }))
      }))
    }));

    vi.mocked(supabase.from).mockImplementation(mockFrom);
    vi.mocked(supabase.schema).mockReturnValue({
      from: mockFrom
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentOrg', () => {
    it('should handle authentication errors gracefully', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      } as any);

      await expect(api.getStats()).rejects.toThrow('Not authenticated');
    });

    it('should fallback to app schema when default schema fails', async () => {
      const mockFromDefault = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Table not found' } }))
          }))
        }))
      }));

      const mockFromApp = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockOrg, error: null }))
          }))
        }))
      }));

      vi.mocked(supabase.from).mockImplementation(mockFromDefault);
      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFromApp
      } as any);

      const result = await api.getStats();
      expect(result).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return stats with zero values when queries fail', async () => {
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ count: null, error: { message: 'Query failed' } }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      const result = await api.getStats();
      
      expect(result).toEqual({
        totalCalls: 0,
        suggestionsShown: 0,
        activeIntents: 0,
        successRate: 85
      });
    });

    it('should return correct stats when queries succeed', async () => {
      const mockFrom = vi.fn((table) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            if (table === 'calls') {
              return Promise.resolve({ count: 10, error: null });
            } else if (table === 'suggestions') {
              return { eq: vi.fn(() => Promise.resolve({ count: 5, error: null })) };
            } else if (table === 'intents') {
              return { eq: vi.fn(() => Promise.resolve({ count: 3, error: null })) };
            }
            return Promise.resolve({ count: 0, error: null });
          })
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      const result = await api.getStats();
      
      expect(result.totalCalls).toBe(10);
      expect(result.suggestionsShown).toBe(5);
      expect(result.activeIntents).toBe(3);
    });
  });

  describe('getCalls', () => {
    it('should return empty array when query fails', async () => {
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Query failed' } }))
          }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      const result = await api.getCalls();
      expect(result).toEqual([]);
    });

    it('should apply filters correctly', async () => {
      const mockQuery = {
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      };

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => mockQuery)
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      await api.getCalls({ status: 'ready', limit: 10 });
      
      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'ready');
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('uploadCall', () => {
    it('should handle storage upload errors', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn(() => Promise.resolve({ 
          data: null, 
          error: { message: 'Storage error' } 
        }))
      } as any);

      await expect(api.uploadCall(new File([''], 'test.wav'))).rejects.toThrow('Failed to upload file');
    });

    it('should continue even if edge function fails', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn(() => Promise.resolve({ 
          data: { path: 'test.wav' }, 
          error: null 
        }))
      } as any);

      const mockFrom = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ 
              data: { id: 'call-123', status: 'processing' }, 
              error: null 
            }))
          }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Function not deployed'));

      const result = await api.uploadCall(new File([''], 'test.wav'));
      
      expect(result).toEqual({ id: 'call-123', status: 'processing' });
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });
  });

  describe('createIntent', () => {
    it('should create intent successfully', async () => {
      const mockFrom = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ 
              data: { id: 'intent-123', label: 'test' }, 
              error: null 
            }))
          }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      const result = await api.createIntent({
        label: 'test',
        description: 'Test intent',
        threshold: 0.8
      });
      
      expect(result).toEqual({ id: 'intent-123', success: true });
    });

    it('should throw error when insert fails', async () => {
      const mockFrom = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ 
              data: null, 
              error: { message: 'Duplicate key' } 
            }))
          }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      await expect(api.createIntent({
        label: 'test',
        description: 'Test intent',
        threshold: 0.8
      })).rejects.toThrow();
    });
  });

  describe('approveReviewItem', () => {
    it('should approve review item and create response', async () => {
      const mockFrom = vi.fn((table) => {
        if (table === 'review_queue') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ 
                  data: { 
                    id: 'review-123',
                    proposed_intent_id: 'intent-456',
                    call_id: 'call-789',
                    turn_id: 'turn-012'
                  }, 
                  error: null 
                }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null }))
            }))
          };
        }
        if (table === 'responses') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ 
                  data: { id: 'response-123' }, 
                  error: null 
                }))
              }))
            }))
          };
        }
        return { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
      });

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Function not deployed'));

      const result = await api.approveReviewItem('review-123', 'Approved response text');
      
      expect(result).toEqual({ success: true });
    });
  });

  describe('getIntents', () => {
    it('should transform intent data correctly', async () => {
      const mockIntents = [
        {
          id: 'intent-1',
          label: 'objection',
          description: 'Customer objection',
          threshold: 0.8,
          is_active: true,
          created_at: '2024-01-01'
        },
        {
          id: 'intent-2',
          label: 'pricing',
          description: 'Pricing question',
          threshold: 0.85,
          is_active: false,
          created_at: '2024-01-02'
        }
      ];

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockIntents, error: null }))
          }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      const result = await api.getIntents();
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'intent-1',
        label: 'objection',
        description: 'Customer objection',
        threshold: 0.8,
        isActive: true,
        createdAt: '2024-01-01'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      vi.mocked(supabase.auth.getUser).mockRejectedValue(new Error('Network error'));

      await expect(api.getStats()).rejects.toThrow();
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Database error' } }))
          }))
        }))
      }));

      vi.mocked(supabase.schema).mockReturnValue({
        from: mockFrom
      } as any);

      await api.getCalls();
      
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching calls:', expect.any(Object));
      
      consoleSpy.mockRestore();
    });
  });
});