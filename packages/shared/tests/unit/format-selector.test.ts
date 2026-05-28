import { describe, it, expect } from 'vitest';
import { formatSection, formatAssembledPrompt } from '@composed-prompts/shared';

describe('formatSection', () => {
  it('xml wraps with named tag', () => {
    expect(formatSection('xml', 'role', 'You are a tutor.')).toBe(
      '<role>\nYou are a tutor.\n</role>',
    );
  });

  it('markdown emits a heading + body', () => {
    expect(formatSection('markdown', 'role', 'You are a tutor.')).toBe(
      '## ROLE\n\nYou are a tutor.',
    );
  });

  it('numbered-steps prefixes the section with a numbered instruction', () => {
    expect(formatSection('numbered-steps', 'role', 'You are a tutor.', 1)).toBe(
      'Step 1 — ROLE:\nYou are a tutor.',
    );
  });
});

describe('formatAssembledPrompt', () => {
  it('xml joins sections with blank lines', () => {
    const sections = [
      { name: 'role', body: 'You are a tutor.' },
      { name: 'goal', body: 'Help me study.' },
    ];
    const out = formatAssembledPrompt('xml', sections);
    expect(out).toBe('<role>\nYou are a tutor.\n</role>\n\n<goal>\nHelp me study.\n</goal>');
  });

  it('markdown uses ## headings', () => {
    const sections = [
      { name: 'role', body: 'You are a tutor.' },
    ];
    const out = formatAssembledPrompt('markdown', sections);
    expect(out).toContain('## ROLE');
  });

  it('numbered-steps numbers sections starting at 1', () => {
    const sections = [
      { name: 'role', body: 'You are a tutor.' },
      { name: 'goal', body: 'Help me study.' },
    ];
    const out = formatAssembledPrompt('numbered-steps', sections);
    expect(out).toContain('Step 1 — ROLE');
    expect(out).toContain('Step 2 — GOAL');
  });
});
