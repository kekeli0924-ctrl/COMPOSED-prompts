import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}));

import { critiquePromptWithGpt, CritiqueError } from '@/lib/openai';

const ctx = { courseLabel: 'Biology', mode: 'cram-review', assessmentType: 'test' };

describe('critiquePromptWithGpt', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.SHARPEN_GPT_EFFORT;
    delete process.env.SHARPEN_GPT_MODEL;
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  it('throws CritiqueError when OPENAI_API_KEY is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(critiquePromptWithGpt('b', ctx)).rejects.toBeInstanceOf(CritiqueError);
  });

  it('returns the critique and sends reasoning_effort=low by default', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'WEAKNESS: too vague' } }] });
    const out = await critiquePromptWithGpt('BASE PROMPT', ctx);
    expect(out).toContain('WEAKNESS');
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toBe('gpt-5.5');
    expect(call.reasoning_effort).toBe('low');
    expect(JSON.stringify(call.messages)).toContain('BASE PROMPT');
  });

  it('honors SHARPEN_GPT_EFFORT', async () => {
    process.env.SHARPEN_GPT_EFFORT = 'medium';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'x' } }] });
    await critiquePromptWithGpt('b', ctx);
    expect(mockCreate.mock.calls[0]![0].reasoning_effort).toBe('medium');
  });

  it('throws CritiqueError when the API throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('429'));
    await expect(critiquePromptWithGpt('b', ctx)).rejects.toBeInstanceOf(CritiqueError);
  });

  it('throws CritiqueError when there is no content', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: {} }] });
    await expect(critiquePromptWithGpt('b', ctx)).rejects.toBeInstanceOf(CritiqueError);
  });
});
