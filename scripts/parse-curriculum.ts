export type Course = {
  id: string;
  name: string;
  department: string;
  level: 'Advanced' | 'Honors' | 'Standard';
  term: string;
  description: string;
  crossListedWith?: string[];
  prerequisites?: string;
};

const DEPARTMENTS = new Set([
  'Arts',
  'English',
  'History and Social Sciences',
  'Mathematics',
  'Science',
  'Wellbeing',
  'World Languages',
]);

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const detectLevel = (name: string): Course['level'] => {
  if (/^ADV\b/i.test(name)) return 'Advanced';
  if (/^HON\b/i.test(name)) return 'Honors';
  return 'Standard';
};

const COURSE_HEADER_RE = /^\*\*(.+?)\s+\(([^)]+)\)[^*]*\*\*/;
const DEPT_HEADER_RE = /^#\s+\*\*([^*]+?)\*\*/;
const CROSS_LIST_RE = /Cross-listed with ([^.\n*]+)/i;
const PREREQ_RE = /PREREQUISITE:\s*([^\n]+)/i;

export function parseCurriculum(md: string): Course[] {
  const lines = md.split(/\r?\n/);
  const courses: Course[] = [];
  let currentDept: string | null = null;
  let pending: { name: string; term: string; descLines: string[] } | null = null;

  const flush = (): void => {
    if (!pending || !currentDept) {
      pending = null;
      return;
    }
    const description = pending.descLines.join(' ').trim();
    const crossMatch = description.match(CROSS_LIST_RE);
    const crossListedWith = crossMatch
      ? crossMatch[1]!.split(/\s+and\s+|,\s*/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    const prereqMatch = description.match(PREREQ_RE);
    const prerequisites = prereqMatch ? prereqMatch[1]!.trim() : undefined;

    const cleanDescription = description
      .replace(CROSS_LIST_RE, '')
      .replace(PREREQ_RE, '')
      .replace(/\s+/g, ' ')
      .trim();

    const level = detectLevel(pending.name);
    const id = `${slugify(currentDept)}-${slugify(pending.name)}`;

    courses.push({
      id,
      name: pending.name,
      department: currentDept,
      level,
      term: pending.term,
      description: cleanDescription,
      ...(crossListedWith && crossListedWith.length > 0 ? { crossListedWith } : {}),
      ...(prerequisites ? { prerequisites } : {}),
    });
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const deptMatch = line.match(DEPT_HEADER_RE);
    if (deptMatch) {
      flush();
      const dept = deptMatch[1]!.trim();
      currentDept = DEPARTMENTS.has(dept) ? dept : null;
      continue;
    }

    if (!currentDept) continue;

    const courseMatch = line.match(COURSE_HEADER_RE);
    if (courseMatch) {
      flush();
      pending = {
        name: courseMatch[1]!.replace(/\\/g, '').trim(),
        term: courseMatch[2]!.trim(),
        descLines: [],
      };
      continue;
    }

    if (pending && line.length > 0 && !line.startsWith('#')) {
      pending.descLines.push(line);
    } else if (pending && line.length === 0 && pending.descLines.length > 0) {
      // blank line ends description
      flush();
    }
  }
  flush();

  return courses;
}
