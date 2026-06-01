import type { UpcomingAssessment } from '@composed-prompts/shared';

const CANVAS_BASE = 'https://pomfret.instructure.com';

export class CanvasAuthError extends Error {}
export class CanvasError extends Error {}

type CanvasCourse = { id: number; name?: string };
type CanvasAssignment = { id: number; name: string; due_at?: string | null; html_url?: string };

async function canvasGet(token: string, path: string): Promise<unknown> {
  // The token only ever goes in the Authorization header — never in a thrown message or log.
  const res = await fetch(`${CANVAS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new CanvasAuthError('canvas auth failed');
  if (!res.ok) throw new CanvasError(`canvas ${res.status}`);
  return res.json();
}

export async function validateToken(token: string): Promise<{ ok: boolean; name?: string }> {
  try {
    const me = (await canvasGet(token, '/api/v1/users/self')) as { name?: string };
    return { ok: true, name: me.name };
  } catch {
    return { ok: false };
  }
}

// Canvas's `upcoming_events` only looks ~1 week ahead, so it's usually empty. Instead, list
// active courses and gather each course's `bucket=upcoming` assignments (a wide, reliable window).
export async function fetchUpcoming(token: string): Promise<UpcomingAssessment[]> {
  const courses = (await canvasGet(
    token,
    '/api/v1/users/self/courses?enrollment_state=active&per_page=50',
  )) as CanvasCourse[];
  const now = Date.now();
  const perCourse = await Promise.all(
    courses.slice(0, 20).map(async (course): Promise<UpcomingAssessment[]> => {
      try {
        const assignments = (await canvasGet(
          token,
          `/api/v1/courses/${course.id}/assignments?bucket=upcoming&order_by=due_at&per_page=50`,
        )) as CanvasAssignment[];
        return assignments
          .filter((a): a is CanvasAssignment & { due_at: string } =>
            Boolean(a.due_at) && new Date(a.due_at as string).getTime() > now)
          .map((a) => ({
            id: String(a.id),
            title: a.name,
            course: course.name ?? null,
            dueDate: a.due_at,
            type: 'assignment',
            url: a.html_url ?? null,
          }));
      } catch {
        return []; // a course we can't read (e.g. 403) → skip it, don't fail the whole fetch
      }
    }),
  );
  const items = perCourse.flat().sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 30);
  // Counts only — never the token or assignment content. Aids diagnosing an empty result.
  console.log('[canvas] fetchUpcoming', { courses: courses.length, items: items.length });
  return items;
}
