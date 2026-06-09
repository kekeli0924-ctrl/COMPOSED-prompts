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

// The enrolled-class window advances on JUNE 1 (month index 5). A US high school has
// exactly four graduating classes enrolled at once (grades 9-12); after spring
// graduation, "the seniors" are the rising senior class, so from June 1 the window is
// the upcoming academic year's four classes. This boundary is fixed by the documented
// anchor — a date in June 2026 maps to the class of 2027 as seniors — which forces the
// flip to be at/before June 1; a later boundary would mis-handle June. Month-granular,
// so timezone is immaterial except within hours of June 1; local components are used,
// matching the rest of the codebase's date math. Browser-safe: no Node/SDK imports.
const ROLLOVER_MONTH = 5; // 0-indexed June

// Grad year of the currently-enrolled SENIOR class as of `now` (default: today).
// e.g. May 2027 -> 2027; June 2027 -> 2028. Replaces the former hardcoded constant so
// the enrolled-class window tracks the calendar instead of needing a yearly manual edit.
export function currentSeniorClassGradYear(now: Date = new Date()): number {
  return now.getMonth() >= ROLLOVER_MONTH ? now.getFullYear() + 1 : now.getFullYear();
}

// Parse a Pomfret email's trailing 2-digit grad year. Accepts only the four currently
// enrolled classes (the senior class .. +3, computed from `now`). Returns the 4-digit
// year, or null for non-Pomfret / unparseable / out-of-window (alumni or not-yet-enrolled).
export function detectGradYear(email: string, now: Date = new Date()): number | null {
  const m = email.trim().toLowerCase().match(/^([^@]+)@pomfret\.org$/);
  if (!m) return null;
  const digits = m[1]!.match(/(\d+)$/);
  if (!digits || digits[1]!.length !== 2) return null;
  const year = 2000 + parseInt(digits[1]!, 10);
  const senior = currentSeniorClassGradYear(now);
  if (year < senior || year > senior + 3) return null;
  return year;
}

// Map a grad year to a grade label relative to the senior class as of `now`.
// e.g. at June 2026: 2027 -> 'Senior' ... 2030 -> 'Freshman'; outside 9..12 -> null.
export function gradeFromGradYear(gradYear: number | null | undefined, now: Date = new Date()): Grade | null {
  if (gradYear == null) return null;
  const num = 12 - (gradYear - currentSeniorClassGradYear(now));
  return GRADE_BY_NUMBER[num] ?? null;
}

// Inverse: a grade label back to its grad year, relative to the senior class as of `now`.
export function gradYearFromGrade(grade: Grade, now: Date = new Date()): number {
  return currentSeniorClassGradYear(now) + (12 - NUMBER_BY_GRADE[grade]);
}
