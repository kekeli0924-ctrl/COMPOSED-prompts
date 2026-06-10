import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PendingOutcomes } from '@/components/PendingOutcomes';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('@/lib/use-api', () => ({
  useApi: () => ({ apiGet: mockApiGet, apiPost: mockApiPost }),
}));

const ITEM = {
  generationId: '00000000-0000-0000-0000-000000000001',
  courseId: 'science-adv-biology',
  assessmentType: 'test',
  assessmentDate: '2026-06-08',
};

describe('PendingOutcomes', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    localStorage.clear();
  });

  it('renders NOTHING when there are no pending outcomes', async () => {
    mockApiGet.mockResolvedValue({ items: [] });
    const { container } = render(<PendingOutcomes />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('renders a card with the five options for a pending item', async () => {
    mockApiGet.mockResolvedValue({ items: [ITEM] });
    render(<PendingOutcomes />);
    expect(await screen.findByText(/How did the test for/)).toBeTruthy();
    for (const label of ['Rough', 'Shaky', 'OK', 'Good', 'Aced']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('submits the tapped outcome and thanks briefly', async () => {
    mockApiGet.mockResolvedValue({ items: [ITEM] });
    mockApiPost.mockResolvedValue({ ok: true });
    render(<PendingOutcomes />);
    fireEvent.click(await screen.findByText('Good'));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/api/outcome', { generationId: ITEM.generationId, outcome: 4 }),
    );
    expect(await screen.findByText(/Thanks/)).toBeTruthy();
  });

  it('dismiss hides the card and persists ONLY to localStorage', async () => {
    mockApiGet.mockResolvedValue({ items: [ITEM] });
    render(<PendingOutcomes />);
    fireEvent.click(await screen.findByLabelText('Dismiss'));
    await waitFor(() => expect(screen.queryByText(/How did the/)).toBeNull());
    expect(JSON.parse(localStorage.getItem('pomfret.dismissedOutcomes')!)).toEqual([ITEM.generationId]);
    expect(mockApiPost).not.toHaveBeenCalled(); // no server state for dismissals
  });

  it('filters out previously dismissed items on load', async () => {
    localStorage.setItem('pomfret.dismissedOutcomes', JSON.stringify([ITEM.generationId]));
    mockApiGet.mockResolvedValue({ items: [ITEM] });
    const { container } = render(<PendingOutcomes />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
