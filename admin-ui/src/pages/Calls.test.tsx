import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CallsPage } from './Calls';
import { api } from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  api: {
    getCalls: vi.fn(),
    uploadCall: vi.fn()
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

describe('CallsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('should display calls list', async () => {
    const mockCalls = [
      {
        id: '1',
        audio_url: 'call1.wav',
        status: 'ready',
        duration_seconds: 120,
        created_at: '2024-01-01T10:00:00Z'
      },
      {
        id: '2',
        audio_url: 'call2.wav',
        status: 'processing',
        duration_seconds: null,
        created_at: '2024-01-02T10:00:00Z'
      }
    ];

    vi.mocked(api.getCalls).mockResolvedValue(mockCalls);

    render(
      <Wrapper>
        <CallsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/call1.wav/i)).toBeInTheDocument();
      expect(screen.getByText(/call2.wav/i)).toBeInTheDocument();
      expect(screen.getByText(/ready/i)).toBeInTheDocument();
      expect(screen.getByText(/processing/i)).toBeInTheDocument();
    });
  });

  it('should handle file upload', async () => {
    vi.mocked(api.getCalls).mockResolvedValue([]);
    vi.mocked(api.uploadCall).mockResolvedValue({
      id: 'new-call',
      audio_url: 'uploaded.wav',
      status: 'processing'
    });

    render(
      <Wrapper>
        <CallsPage />
      </Wrapper>
    );

    // Find file input
    const fileInput = screen.getByLabelText(/Upload Call Recording/i);
    
    // Create a test file
    const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
    
    // Trigger file upload
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(api.uploadCall).toHaveBeenCalledWith(file);
    });
  });

  it('should show error when upload fails', async () => {
    vi.mocked(api.getCalls).mockResolvedValue([]);
    vi.mocked(api.uploadCall).mockRejectedValue(new Error('Upload failed'));

    render(
      <Wrapper>
        <CallsPage />
      </Wrapper>
    );

    const fileInput = screen.getByLabelText(/Upload Call Recording/i);
    const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
    
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Failed to upload/i)).toBeInTheDocument();
    });
  });

  it('should filter calls by status', async () => {
    const mockCalls = [
      {
        id: '1',
        audio_url: 'call1.wav',
        status: 'ready',
        duration_seconds: 120,
        created_at: '2024-01-01T10:00:00Z'
      }
    ];

    vi.mocked(api.getCalls).mockResolvedValue(mockCalls);

    render(
      <Wrapper>
        <CallsPage />
      </Wrapper>
    );

    // Find and click filter button
    const filterButton = await screen.findByRole('button', { name: /Filter/i });
    fireEvent.click(filterButton);

    // Select status filter
    const statusSelect = screen.getByLabelText(/Status/i);
    fireEvent.change(statusSelect, { target: { value: 'ready' } });

    await waitFor(() => {
      expect(api.getCalls).toHaveBeenCalledWith({ status: 'ready' });
    });
  });

  it('should handle empty state', async () => {
    vi.mocked(api.getCalls).mockResolvedValue([]);

    render(
      <Wrapper>
        <CallsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/No calls found/i)).toBeInTheDocument();
    });
  });
});