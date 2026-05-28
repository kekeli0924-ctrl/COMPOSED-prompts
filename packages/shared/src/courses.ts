import coursesData from '../data/courses.json' with { type: 'json' };

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

const COURSES = coursesData as Course[];

export function allCourses(): Course[] {
  return COURSES;
}

export function findCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export function searchCourses(query: string, limit = 20): Course[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const scored = COURSES.map((c) => {
    const name = c.name.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 50;
    else if (name.includes(q)) score = 20;
    else if (c.description.toLowerCase().includes(q)) score = 5;
    return { c, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((s) => s.c);
  return scored;
}
