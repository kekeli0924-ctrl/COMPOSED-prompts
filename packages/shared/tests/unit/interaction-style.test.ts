import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateInteractionStyle } from '../../src/generation/interaction-style';
import type { WizardInputs } from '@composed-prompts/shared';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 2,
  material: 'Stanislavski',
};

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

describe('generateInteractionStyle', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the assistant text on success', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Quick-fire questions on fundamentals first.' }],
      usage: { input_tokens: 100, output_tokens: 30 },
    });
    const result = await generateInteractionStyle(inputs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Quick-fire questions');
      expect(result.usage.input_tokens).toBe(100);
    }
  });

  it('returns ok: false on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const result = await generateInteractionStyle(inputs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('api-error');
    }
  });

  it('calls Sonnet with prompt-cached system message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateInteractionStyle(inputs);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toMatch(/sonnet/i);
    expect(Array.isArray(call.system)).toBe(true);
    const cached = call.system.some((b: { cache_control?: { type: string } }) => b.cache_control?.type === 'ephemeral');
    expect(cached).toBe(true);
  });
});
