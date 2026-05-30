export const SENIOR_CLASS_GRAD_YEAR = 2027;

export type Grade = 'Freshman' | 'Sophomore' | 'Junior' | 'Senior';

const GRADE_BY_NUMBER: Record<number, Grade> = {
  9: 'Freshman',
  10: 'Sophomore',
  11: 'Junior',
  12: 'Senior',
};

const NUMBER_BY_GRADE: Record<Grade, number> = {
  Freshman: 9,
  Sophomore: 10,
  Junior: 11,
  Senior: 12,
};

// Parse a Pomfret email's trailing 2-digit grad year. Accepts only currently
// enrolled classes (SENIOR_CLASS_GRAD_YEAR .. +3). Returns 4-digit year or null.
export function detectGradYear(email: string): number | null {
  const m = email.trim().toLowerCase().match(/^([^@]+)@pomfret\.org$/);
  if (!m) return null;
  const digits = m[1]!.match(/(\d+)$/);
  if (!digits || digits[1]!.length !== 2) return null;
  const year = 2000 + parseInt(digits[1]!, 10);
  if (year < SENIOR_CLASS_GRAD_YEAR || year > SENIOR_CLASS_GRAD_YEAR + 3) return null;
  return year;
}

// 2027 -> 'Senior' ... 2030 -> 'Freshman'; outside 9..12 -> null.
export function gradeFromGradYear(gradYear: number | null | undefined): Grade | null {
  if (gradYear == null) return null;
  const num = 12 - (gradYear - SENIOR_CLASS_GRAD_YEAR);
  return GRADE_BY_NUMBER[num] ?? null;
}

// Inverse for the manual override: 'Senior' -> 2027 ... 'Freshman' -> 2030.
export function gradYearFromGrade(grade: Grade): number {
  return SENIOR_CLASS_GRAD_YEAR + (12 - NUMBER_BY_GRADE[grade]);
}
