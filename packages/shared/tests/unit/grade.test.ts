import { describe, it, expect } from 'vitest';
import {
  detectGradYear,
  gradeFromGradYear,
  gradYearFromGrade,
  currentSeniorClassGradYear,
} from '@composed-prompts/shared';

// Fixed reference dates injected so results never depend on the real clock. Mid-month,
// well clear of the June-1 boundary, so local-vs-UTC components are immaterial.
const JUN_2026 = new Date(2026, 5, 15); // firm anchor: senior class = 2027
const MAY_2027 = new Date(2027, 4, 15); // just before the rollover: senior = 2027
const JUN_2027 = new Date(2027, 5, 15); // on/after June 1: senior = 2028
const JUL_2027 = new Date(2027, 6, 15); // summer gap: senior = 2028 (confirmed behavior)
const OCT_2027 = new Date(2027, 9, 15); // after the rollover: senior = 2028

describe('grade — date-relative enrolled-class window', () => {
  it('computes the senior class grad year with a June-1 rollover', () => {
    expect(currentSeniorClassGradYear(JUN_2026)).toBe(2027);
    expect(currentSeniorClassGradYear(MAY_2027)).toBe(2027); // before June 1: not yet rolled
    expect(currentSeniorClassGradYear(JUN_2027)).toBe(2028); // June 1: rolled
    expect(currentSeniorClassGradYear(JUL_2027)).toBe(2028);
    expect(currentSeniorClassGradYear(OCT_2027)).toBe(2028);
  });

  it('FIRM ANCHOR: June 2026 accepts {2027,2028,2029,2030} with 2027 = Senior', () => {
    expect(detectGradYear('jdoe27@pomfret.org', JUN_2026)).toBe(2027);
    expect(detectGradYear('a.b.28@pomfret.org', JUN_2026)).toBe(2028);
    expect(detectGradYear('c29@pomfret.org', JUN_2026)).toBe(2029);
    expect(detectGradYear('JDOE30@Pomfret.org', JUN_2026)).toBe(2030);
    expect(gradeFromGradYear(2027, JUN_2026)).toBe('Senior');
    expect(gradeFromGradYear(2030, JUN_2026)).toBe('Freshman');
  });

  it('rolls forward after a year: Oct 2027 accepts {2028,2029,2030,2031} with 2028 = Senior', () => {
    expect(detectGradYear('s28@pomfret.org', OCT_2027)).toBe(2028);
    expect(detectGradYear('s31@pomfret.org', OCT_2027)).toBe(2031);
    expect(gradeFromGradYear(2028, OCT_2027)).toBe('Senior');
    expect(gradeFromGradYear(2031, OCT_2027)).toBe('Freshman');
    // 2027 has graduated by Oct 2027:
    expect(detectGradYear('s27@pomfret.org', OCT_2027)).toBeNull();
    expect(gradeFromGradYear(2027, OCT_2027)).toBeNull();
  });

  it('flips exactly on June 1: 2027 is Senior in May 2027 but alumni by June 2027', () => {
    expect(detectGradYear('s27@pomfret.org', MAY_2027)).toBe(2027);
    expect(gradeFromGradYear(2027, MAY_2027)).toBe('Senior');
    expect(detectGradYear('s27@pomfret.org', JUN_2027)).toBeNull(); // alumni from June 1
    expect(detectGradYear('s31@pomfret.org', JUN_2027)).toBe(2031); // incoming class now in window
  });

  it('summer gap (July 2027) belongs to the new cohort: {2028,2029,2030,2031}, 2028 = Senior', () => {
    expect(detectGradYear('s28@pomfret.org', JUL_2027)).toBe(2028);
    expect(gradeFromGradYear(2028, JUL_2027)).toBe('Senior');
    expect(detectGradYear('s31@pomfret.org', JUL_2027)).toBe(2031); // incoming freshman accepted
    expect(detectGradYear('s27@pomfret.org', JUL_2027)).toBeNull(); // just-graduated rejected
  });

  it('preserves reject semantics for non-Pomfret, unparseable, and out-of-window emails', () => {
    expect(detectGradYear('jdoe27@gmail.com', JUN_2026)).toBeNull();
    expect(detectGradYear('smith@pomfret.org', JUN_2026)).toBeNull();   // no digits
    expect(detectGradYear('room100@pomfret.org', JUN_2026)).toBeNull(); // 3 digits
    expect(detectGradYear('jdoe26@pomfret.org', JUN_2026)).toBeNull();  // graduated
    expect(detectGradYear('jdoe31@pomfret.org', JUN_2026)).toBeNull();  // not yet enrolled
  });

  it('maps grade labels and inverts them, anchored on the date', () => {
    expect(gradeFromGradYear(2028, JUN_2026)).toBe('Junior');
    expect(gradeFromGradYear(2029, JUN_2026)).toBe('Sophomore');
    expect(gradeFromGradYear(null, JUN_2026)).toBeNull();
    expect(gradYearFromGrade('Senior', JUN_2026)).toBe(2027);
    expect(gradYearFromGrade('Sophomore', JUN_2026)).toBe(2029);
    expect(gradYearFromGrade('Senior', OCT_2027)).toBe(2028); // inverse tracks the rollover too
  });
});
