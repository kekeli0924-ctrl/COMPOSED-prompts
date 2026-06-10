import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt.js';
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

describe('generateFullPromptWithOpus', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the assistant prompt + usage on success', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '<role>You are a tutor...</role>' }],
      usage: { input_tokens: 500, output_tokens: 800 },
    });
    const result = await generateFullPromptWithOpus(inputs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt).toContain('<role>');
      expect(result.usage.input_tokens).toBe(500);
      expect(result.usage.output_tokens).toBe(800);
    }
  });

  it('returns ok: false on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const result = await generateFullPromptWithOpus(inputs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('api-error');
    }
  });

  it('calls Opus with a prompt-cached system message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateFullPromptWithOpus(inputs);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toBe('claude-opus-4-8');
    expect(Array.isArray(call.system)).toBe(true);
    const cached = call.system.some(
      (b: { cache_control?: { type: string } }) => b.cache_control?.type === 'ephemeral',
    );
    expect(cached).toBe(true);
  });

  it('returns ok: false when no text block in response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const result = await generateFullPromptWithOpus(inputs);
    expect(result.ok).toBe(false);
  });

  it('adds an attach directive to the user message when kinds are set', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateFullPromptWithOpus({ ...inputs, attachedMaterialKinds: ['study-guide'] });
    const call = mockCreate.mock.calls[0]![0];
    const userMsg = call.messages[0].content as string;
    expect(userMsg).toContain('will ATTACH');
    expect(userMsg).toContain('study guide');
  });

  it('includes the grade line in the user message when studentGrade is set', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateFullPromptWithOpus(inputs, '', 'Sophomore');
    const call = mockCreate.mock.calls[0]![0];
    expect(call.messages[0].content as string).toContain("Student's grade: Sophomore");
  });

  it('appends the recap context block to the user message when provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const block = '<last_session_recap untrusted="true">\n- weak spot x\n</last_session_recap>';
    await generateFullPromptWithOpus(inputs, 'RAG CONTEXT', undefined, 'v2', block);
    const userMsg = mockCreate.mock.calls[0]![0].messages[0].content as string;
    expect(userMsg).toContain('RAG CONTEXT');
    expect(userMsg).toContain('<last_session_recap untrusted="true">');
    expect(userMsg.indexOf('RAG CONTEXT')).toBeLessThan(userMsg.indexOf('<last_session_recap')); // recap after RAG
  });

  it('omits the recap block entirely when recapContext is empty', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateFullPromptWithOpus(inputs);
    const userMsg = mockCreate.mock.calls[0]![0].messages[0].content as string;
    expect(userMsg).not.toContain('last_session_recap');
  });
});
