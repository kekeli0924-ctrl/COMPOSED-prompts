import { describe, it, expect } from 'vitest';
import {
  parseRecapText,
  buildSelfCheckSection,
  RECAP_START_MARKER,
  RECAP_WEAK_SPOTS_MARKER,
  RECAP_FOLLOW_UP_MARKER,
  RECAP_END_MARKER,
  MAX_WEAK_SPOTS,
  MAX_WEAK_SPOT_CHARS,
  MAX_FOLLOW_UP_CHARS,
} from '@composed-prompts/shared';
import type { WizardInputs } from '@composed-prompts/shared';

const block = (body: string): string =>
  `${RECAP_START_MARKER}\n${body}\n${RECAP_END_MARKER}`;

describe('parseRecapText', () => {
  it('parses a well-formed block', () => {
    const text = block(
      `${RECAP_WEAK_SPOTS_MARKER}\n- Confused mitosis with meiosis\n- Forgot the role of ATP\n${RECAP_FOLLOW_UP_MARKER}\nQuiz me on cell division, focusing on the phases I missed.`,
    );
    const r = parseRecapText(text);
    expect(r).not.toBeNull();
    expect(r!.weakSpots).toEqual(['Confused mitosis with meiosis', 'Forgot the role of ATP']);
    expect(r!.followUpPrompt).toBe('Quiz me on cell division, focusing on the phases I missed.');
  });

  it('tolerates odd casing on every marker', () => {
    const text = [
      '===composed recap start===',
      'weak spots:',
      '- thing one',
      'Follow-Up Prompt:',
      'do the thing',
      '===Composed Recap End===',
    ].join('\n');
    const r = parseRecapText(text);
    expect(r!.weakSpots).toEqual(['thing one']);
    expect(r!.followUpPrompt).toBe('do the thing');
  });

  it('finds the block when embedded in a longer paste with surrounding prose', () => {
    const text = [
      'Thanks, that was a great session! Here is your recap:',
      '',
      RECAP_START_MARKER,
      RECAP_WEAK_SPOTS_MARKER,
      '- Stoichiometry mole ratios',
      RECAP_END_MARKER,
      '',
      'Good luck on your test!',
    ].join('\n');
    const r = parseRecapText(text);
    expect(r!.weakSpots).toEqual(['Stoichiometry mole ratios']);
    expect(r!.followUpPrompt).toBeNull();
  });

  it('accepts -, *, •, and numbered bullet styles', () => {
    const text = block(
      `${RECAP_WEAK_SPOTS_MARKER}\n- dash item\n* star item\n• bullet item\n1. numbered item\n2) paren item`,
    );
    const r = parseRecapText(text);
    expect(r!.weakSpots).toEqual(['dash item', 'star item', 'bullet item', 'numbered item', 'paren item']);
  });

  it('handles a missing FOLLOW-UP section (follow-up is null)', () => {
    const text = block(`${RECAP_WEAK_SPOTS_MARKER}\n- only weak spots here`);
    const r = parseRecapText(text);
    expect(r!.weakSpots).toEqual(['only weak spots here']);
    expect(r!.followUpPrompt).toBeNull();
  });

  it('handles a missing END marker (section runs to end of input)', () => {
    const text = [
      RECAP_START_MARKER,
      RECAP_WEAK_SPOTS_MARKER,
      '- weak spot a',
      RECAP_FOLLOW_UP_MARKER,
      'follow up text with no end marker',
    ].join('\n');
    const r = parseRecapText(text);
    expect(r!.weakSpots).toEqual(['weak spot a']);
    expect(r!.followUpPrompt).toBe('follow up text with no end marker');
  });

  it('reads follow-up content that begins on the marker line itself', () => {
    const text = block(`${RECAP_WEAK_SPOTS_MARKER}\n- x\n${RECAP_FOLLOW_UP_MARKER} inline follow-up`);
    const r = parseRecapText(text);
    expect(r!.followUpPrompt).toBe('inline follow-up');
  });

  it('returns null when the start marker is absent', () => {
    expect(parseRecapText('just some random text\nWEAK SPOTS:\n- a')).toBeNull();
  });

  it('returns null on garbage input', () => {
    expect(parseRecapText('')).toBeNull();
    expect(parseRecapText('lorem ipsum dolor sit amet')).toBeNull();
  });

  it('returns null when the block has a start marker but no extractable weak spots', () => {
    expect(parseRecapText(block(`${RECAP_WEAK_SPOTS_MARKER}\n(none this time)`))).toBeNull(); // no bullets
    expect(parseRecapText(block('no weak-spots marker at all'))).toBeNull();
  });

  it('does not let marker text inside a weak-spot bullet terminate the section early', () => {
    // Adversarial: a bullet literally mentions the END/FOLLOW-UP markers. Because markers
    // only match at line START, these stay weak spots and don't truncate/over-capture.
    const text = block(
      `${RECAP_WEAK_SPOTS_MARKER}\n- I wrote ${RECAP_END_MARKER} in my notes by mistake\n- and also ${RECAP_FOLLOW_UP_MARKER} confused me`,
    );
    const r = parseRecapText(text);
    expect(r!.weakSpots).toHaveLength(2);
    expect(r!.weakSpots[0]).toContain('in my notes by mistake');
    expect(r!.followUpPrompt).toBeNull(); // the real follow-up marker never appears at line start
  });

  it('caps weak spots at MAX_WEAK_SPOTS and trims each to MAX_WEAK_SPOT_CHARS', () => {
    const many = Array.from({ length: 30 }, (_, i) => `- item ${i} ${'x'.repeat(400)}`).join('\n');
    const r = parseRecapText(block(`${RECAP_WEAK_SPOTS_MARKER}\n${many}`));
    expect(r!.weakSpots).toHaveLength(MAX_WEAK_SPOTS);
    for (const s of r!.weakSpots) expect(s.length).toBeLessThanOrEqual(MAX_WEAK_SPOT_CHARS);
  });

  it('trims the follow-up prompt to MAX_FOLLOW_UP_CHARS', () => {
    const text = block(`${RECAP_WEAK_SPOTS_MARKER}\n- a\n${RECAP_FOLLOW_UP_MARKER}\n${'y'.repeat(5000)}`);
    const r = parseRecapText(text);
    expect(r!.followUpPrompt!.length).toBe(MAX_FOLLOW_UP_CHARS);
  });
});

describe('parseRecapText — multi-block pastes (last parseable block wins)', () => {
  const REAL = [
    RECAP_START_MARKER,
    RECAP_WEAK_SPOTS_MARKER,
    '- Confused mitosis with meiosis',
    '- Mixed up anaphase and metaphase',
    RECAP_FOLLOW_UP_MARKER,
    'Drill me on cell-division phases with free recall.',
    RECAP_END_MARKER,
  ].join('\n');

  it("whole-conversation paste: the REAL recap wins over the generated prompt's instruction block", () => {
    // The strongest regression: the leading block is the ACTUAL deterministic template's
    // self-check section, which contains a literal, parseable copy of the wire format
    // as instructions. The genuine recap at the end must win.
    const inputs: WizardInputs = {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'arts-acting-and-improv',
      mode: 'cram-review', assessmentType: 'test', assessmentDate: '2026-06-20', hoursAvailable: 2,
    };
    const conversation = [
      buildSelfCheckSection(inputs), // contains the instruction block
      '',
      '...the whole study session transcript...',
      '',
      REAL,
      'Good luck on the test!',
    ].join('\n');
    const r = parseRecapText(conversation);
    expect(r).not.toBeNull();
    expect(r!.weakSpots).toEqual(['Confused mitosis with meiosis', 'Mixed up anaphase and metaphase']);
    expect(r!.followUpPrompt).toBe('Drill me on cell-division phases with free recall.');
    // And never the instruction placeholder:
    expect(JSON.stringify(r)).not.toContain('one bullet per weak spot');
  });

  it('a block missing its END marker does not merge with a later block', () => {
    const text = [
      RECAP_START_MARKER, // first block: no END, no real content
      RECAP_WEAK_SPOTS_MARKER,
      '(nothing here)',
      REAL, // second, complete block
    ].join('\n');
    const r = parseRecapText(text);
    expect(r!.weakSpots).toEqual(['Confused mitosis with meiosis', 'Mixed up anaphase and metaphase']);
    expect(r!.followUpPrompt).toBe('Drill me on cell-division phases with free recall.');
  });

  it('an empty-but-well-formed first block does not mask a valid later block', () => {
    const empty = [RECAP_START_MARKER, RECAP_WEAK_SPOTS_MARKER, RECAP_END_MARKER].join('\n');
    const r = parseRecapText(`${empty}\n\nsome chatter\n\n${REAL}`);
    expect(r).not.toBeNull();
    expect(r!.weakSpots).toHaveLength(2);
  });

  it('END before WEAK SPOTS yields null for that block and never scavenges outside it', () => {
    const aborted = [RECAP_START_MARKER, RECAP_END_MARKER].join('\n');
    const outside = [
      aborted,
      RECAP_WEAK_SPOTS_MARKER, // stray section text OUTSIDE any block — must be ignored
      '- stray bullet that is not a weak spot',
      RECAP_FOLLOW_UP_MARKER,
      'stray follow-up',
    ].join('\n');
    expect(parseRecapText(outside)).toBeNull();
  });

  it('a later malformed block does not erase an earlier valid one', () => {
    const malformed = [RECAP_START_MARKER, '(tutor aborted here)', RECAP_END_MARKER].join('\n');
    const r = parseRecapText(`${REAL}\n\n${malformed}`);
    expect(r).not.toBeNull();
    expect(r!.weakSpots).toHaveLength(2); // the valid earlier block still wins
  });
});
