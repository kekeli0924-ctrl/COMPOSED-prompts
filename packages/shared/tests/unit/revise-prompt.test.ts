import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revisePromptWithOpus } from '@composed-prompts/shared/src/generation/revise-prompt.js';
import type { WizardInputs } from '@composed-prompts/shared';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
};

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

describe('revisePromptWithOpus', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.SHARPEN_OPUS_EFFORT;
  });

  it('returns the revised prompt and passes the base prompt + critique + adaptive thinking', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'IMPROVED <role>...</role>' }],
      usage: { input_tokens: 600, output_tokens: 900 },
    });
    const result = await revisePromptWithOpus('BASE PROMPT', 'CRITIQUE TEXT', inputs);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.prompt).toContain('IMPROVED');
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toBe('claude-opus-4-8');
    expect(call.thinking).toEqual({ type: 'adaptive' });
    expect(call.output_config).toEqual({ effort: 'medium' });
    expect(call.max_tokens).toBeGreaterThan(8000);
    const userMsg = call.messages[0].content as string;
    expect(userMsg).toContain('BASE PROMPT');
    expect(userMsg).toContain('CRITIQUE TEXT');
  });

  it('honors SHARPEN_OPUS_EFFORT', async () => {
    process.env.SHARPEN_OPUS_EFFORT = 'high';
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    await revisePromptWithOpus('b', 'c', inputs);
    expect(mockCreate.mock.calls[0]![0].output_config).toEqual({ effort: 'high' });
  });

  it('returns ok:false on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    const result = await revisePromptWithOpus('b', 'c', inputs);
    expect(result.ok).toBe(false);
  });
});
