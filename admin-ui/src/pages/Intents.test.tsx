import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { IntentsPage } from './Intents';
import { api } from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  api: {
    getIntents: vi.fn(),
    createIntent: vi.fn(),
    updateIntent: vi.fn()
  }
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </QueryClientProvider>
);

describe('IntentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('should display intents list', async () => {
    const mockIntents = [
      {
        id: '1',
        label: 'objection',
        description: 'Customer objection',
        threshold: 0.8,
        isActive: true,
        createdAt: '2024-01-01'
      },
      {
        id: '2',
        label: 'pricing',
        description: 'Pricing question',
        threshold: 0.85,
        isActive: false,
        createdAt: '2024-01-02'
      }
    ];

    vi.mocked(api.getIntents).mockResolvedValue(mockIntents);

    render(
      <Wrapper>
        <IntentsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('objection')).toBeInTheDocument();
      expect(screen.getByText('pricing')).toBeInTheDocument();
    });
  });

  it('should handle create intent', async () => {
    vi.mocked(api.getIntents).mockResolvedValue([]);
    vi.mocked(api.createIntent).mockResolvedValue({ id: 'new-1', success: true });

    render(
      <Wrapper>
        <IntentsPage />
      </Wrapper>
    );

    // Click create button
    const createButton = await screen.findByText(/Create Intent/i);
    fireEvent.click(createButton);

    // Fill form
    const labelInput = screen.getByLabelText(/Label/i);
    const descriptionInput = screen.getByLabelText(/Description/i);
    const thresholdInput = screen.getByLabelText(/Threshold/i);

    fireEvent.change(labelInput, { target: { value: 'new_intent' } });
    fireEvent.change(descriptionInput, { target: { value: 'New intent description' } });
    fireEvent.change(thresholdInput, { target: { value: '0.75' } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: /Save/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createIntent).toHaveBeenCalledWith({
        label: 'new_intent',
        description: 'New intent description',
        threshold: 0.75
      });
    });
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(api.getIntents).mockRejectedValue(new Error('Network error'));

    render(
      <Wrapper>
        <IntentsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Error loading intents/i)).toBeInTheDocument();
    });
  });

  it('should toggle intent active status', async () => {
    const mockIntents = [
      {
        id: '1',
        label: 'objection',
        description: 'Customer objection',
        threshold: 0.8,
        isActive: true,
        createdAt: '2024-01-01'
      }
    ];

    vi.mocked(api.getIntents).mockResolvedValue(mockIntents);
    vi.mocked(api.updateIntent).mockResolvedValue({ success: true });

    render(
      <Wrapper>
        <IntentsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('objection')).toBeInTheDocument();
    });

    // Find and click toggle button
    const toggleButton = screen.getByRole('switch');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(api.updateIntent).toHaveBeenCalledWith('1', { isActive: false });
    });
  });
});