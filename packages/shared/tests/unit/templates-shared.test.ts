import { describe, it, expect } from 'vitest';
import { buildRoleSection, buildAboutMeSection, buildMaterialSection, buildGoalSection, buildSelfCheckSection } from '@composed-prompts/shared';
import type { WizardInputs } from '@composed-prompts/shared';

const baseInputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 4,
  confidence: 3,
  understanding: 'I get the basics',
  confusion: 'Subtext analysis is tricky',
  material: 'Stanislavski method chapter 3',
};

describe('shared section builders', () => {
  it('Role section mentions the course and a tutor persona', () => {
    const out = buildRoleSection(baseInputs);
    expect(out).toMatch(/tutor/i);
    expect(out).toContain('Acting and Improv');
  });

  it('Role section uses "patient" persona for confidence <= 2', () => {
    const out = buildRoleSection({ ...baseInputs, confidence: 2 });
    expect(out).toMatch(/patient/i);
  });

  it('Role section uses "rigorous" persona for confidence >= 4', () => {
    const out = buildRoleSection({ ...baseInputs, confidence: 4 });
    expect(out).toMatch(/rigorous/i);
  });

  it('Role falls back when courseId is null', () => {
    const out = buildRoleSection({
      ...baseInputs,
      courseId: null,
      courseFreeText: 'Independent reading',
    });
    expect(out).toContain('Independent reading');
  });

  it('About Me includes confidence and confusion notes when present', () => {
    const out = buildAboutMeSection(baseInputs);
    expect(out).toContain('3 of 5');
    expect(out).toContain('Subtext analysis is tricky');
  });

  it('About Me omits empty optional fields', () => {
    const slim = { ...baseInputs, confidence: undefined, understanding: undefined, confusion: undefined };
    const out = buildAboutMeSection(slim);
    expect(out).not.toContain('Confidence:');
    expect(out).not.toContain('What I understand:');
  });

  it('Material section emits a no-material note when material is empty', () => {
    const out = buildMaterialSection({ ...baseInputs, material: undefined });
    expect(out).toMatch(/no specific material/i);
  });

  it('Material section includes the pasted material', () => {
    const out = buildMaterialSection(baseInputs);
    expect(out).toContain('Stanislavski method');
  });

  it('Goal section mentions assessment type, date, and hours', () => {
    const out = buildGoalSection(baseInputs);
    expect(out).toContain('test');
    expect(out).toContain('2026-06-01');
    expect(out).toMatch(/4\s+hours?/);
  });

  it('Self-Check section references the assessment', () => {
    const out = buildSelfCheckSection(baseInputs);
    expect(out).toMatch(/before responding/i);
  });

  it('builds an attach directive when material kinds are set', () => {
    const out = buildMaterialSection({ ...baseInputs, attachedMaterialKinds: ['study-guide'] });
    expect(out).toContain('I will attach my study guide');
    expect(out).toContain('extract the 6');
  });

  it('includes both attached and pasted material', () => {
    const out = buildMaterialSection({
      ...baseInputs,
      attachedMaterialKinds: ['study-guide'],
      material: 'my pasted notes',
    });
    expect(out).toContain('I will attach my study guide');
    expect(out).toContain('my pasted notes');
  });
});
