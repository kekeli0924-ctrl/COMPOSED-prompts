import { describe, it, expect } from 'vitest';
import { detectGradYear, gradeFromGradYear, gradYearFromGrade } from '@composed-prompts/shared';

describe('grade', () => {
  it('detects grad year from a Pomfret email', () => {
    expect(detectGradYear('jdoe27@pomfret.org')).toBe(2027);
    expect(detectGradYear('a.b.29@pomfret.org')).toBe(2029);
    expect(detectGradYear('JDOE30@Pomfret.org')).toBe(2030);
  });

  it('returns null for non-Pomfret, unparseable, or out-of-window emails', () => {
    expect(detectGradYear('jdoe27@gmail.com')).toBeNull();
    expect(detectGradYear('smith@pomfret.org')).toBeNull();   // no digits
    expect(detectGradYear('room100@pomfret.org')).toBeNull(); // 3 digits
    expect(detectGradYear('jdoe26@pomfret.org')).toBeNull();  // graduated
    expect(detectGradYear('jdoe31@pomfret.org')).toBeNull();  // not yet enrolled
  });

  it('maps grad year to grade label', () => {
    expect(gradeFromGradYear(2027)).toBe('Senior');
    expect(gradeFromGradYear(2028)).toBe('Junior');
    expect(gradeFromGradYear(2029)).toBe('Sophomore');
    expect(gradeFromGradYear(2030)).toBe('Freshman');
    expect(gradeFromGradYear(2026)).toBeNull();
    expect(gradeFromGradYear(null)).toBeNull();
  });

  it('inverts a grade label back to a grad year', () => {
    expect(gradYearFromGrade('Senior')).toBe(2027);
    expect(gradYearFromGrade('Sophomore')).toBe(2029);
  });
});
