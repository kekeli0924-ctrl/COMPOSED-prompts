import { describe, it, expect } from 'vitest';
import { getModelProfile, listProviders } from '@composed-prompts/shared';

describe('model-profiles', () => {
  it('lists all providers', () => {
    const provs = listProviders();
    expect(provs.map((p) => p.id)).toEqual(['anthropic', 'openai', 'google', 'other']);
  });

  it('returns the profile for a known (provider, model)', () => {
    const profile = getModelProfile('anthropic', 'claude-opus-4-7');
    expect(profile).toMatchObject({
      displayName: 'Claude Opus 4.7',
      format: 'xml',
      isReasoning: false,
    });
  });

  it('falls back to generic for unknown model', () => {
    const profile = getModelProfile('anthropic', 'fake-model-xyz');
    expect(profile.format).toBe('markdown');
    expect(profile.displayName).toBe('Any major LLM');
  });

  it('marks GPT-5.5 Thinking as a reasoning model', () => {
    const profile = getModelProfile('openai', 'gpt-5-5-thinking');
    expect(profile.isReasoning).toBe(true);
  });
});
