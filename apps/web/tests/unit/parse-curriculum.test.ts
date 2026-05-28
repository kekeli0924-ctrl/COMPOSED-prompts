import { describe, it, expect } from 'vitest';
import { parseCurriculum } from '@/scripts/parse-curriculum';

const SAMPLE = `
# **Arts**  {#arts}

The requirements for Arts are as follows: blah blah.

**ALL ARTS COURSES ARE GRADED ACCORDING TO COMPETENCY BASED LEARNING**

**Courses listed in alphabetical order:**

**Acting and Improv (Term long-Fall, Winter & Spring)**
Perform with and without a script in this introductory acting course designed for anyone interested in developing their self-confidence.

**ADV Ceramics (Year long)**
This is a year long course for students who have demonstrated dedication. PREREQUISITE: Students must apply for this class.

**HON Astronomy (Year long) \\- opportunity for Advanced level**
Explore the cosmos.

# **English** {#english}

**Eng: Playwriting (Term long-Fall)**
Students will discover the makings of a great play. *Cross-listed with Arts.*
`;

describe('parseCurriculum', () => {
  it('extracts courses grouped by department', () => {
    const result = parseCurriculum(SAMPLE);
    const depts = new Set(result.map((c) => c.department));
    expect(depts).toEqual(new Set(['Arts', 'English']));
  });

  it('captures course name, term, and description', () => {
    const result = parseCurriculum(SAMPLE);
    const acting = result.find((c) => c.name === 'Acting and Improv');
    expect(acting).toBeDefined();
    expect(acting!.term).toBe('Term long-Fall, Winter & Spring');
    expect(acting!.department).toBe('Arts');
    expect(acting!.description).toContain('introductory acting course');
  });

  it('detects ADV level', () => {
    const result = parseCurriculum(SAMPLE);
    const ceramics = result.find((c) => c.name === 'ADV Ceramics');
    expect(ceramics!.level).toBe('Advanced');
  });

  it('detects HON level', () => {
    const result = parseCurriculum(SAMPLE);
    const astro = result.find((c) => c.name === 'HON Astronomy');
    expect(astro!.level).toBe('Honors');
  });

  it('detects prerequisites', () => {
    const result = parseCurriculum(SAMPLE);
    const ceramics = result.find((c) => c.name === 'ADV Ceramics');
    expect(ceramics!.prerequisites).toContain('must apply');
  });

  it('detects cross-listed departments', () => {
    const result = parseCurriculum(SAMPLE);
    const playwriting = result.find((c) => c.name === 'Eng: Playwriting');
    expect(playwriting!.crossListedWith).toEqual(['Arts']);
  });

  it('assigns a kebab-case id', () => {
    const result = parseCurriculum(SAMPLE);
    const acting = result.find((c) => c.name === 'Acting and Improv');
    expect(acting!.id).toBe('arts-acting-and-improv');
  });

  it('strips italic asterisks around cross-listed annotation from cleaned description', () => {
    const result = parseCurriculum(SAMPLE);
    const playwriting = result.find((c) => c.name === 'Eng: Playwriting');
    expect(playwriting!.description).not.toContain('*');
    expect(playwriting!.description).not.toMatch(/Cross-listed/i);
  });
});
