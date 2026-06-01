import type { UpcomingAssessment } from '@composed-prompts/shared';

const CANVAS_BASE = 'https://pomfret.instructure.com';

export class CanvasAuthError extends Error {}
export class CanvasError extends Error {}

type UpcomingEvent = {
  type?: string;
  html_url?: string;
  context_name?: string;
  assignment?: { id: number; name: string; due_at?: string | null };
};

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

export async function fetchUpcoming(token: string): Promise<UpcomingAssessment[]> {
  const events = (await canvasGet(token, '/api/v1/users/self/upcoming_events')) as UpcomingEvent[];
  const now = Date.now();
  return events
    .filter((e): e is UpcomingEvent & { assignment: { id: number; name: string; due_at: string } } =>
      Boolean(e.assignment?.due_at) && new Date(e.assignment!.due_at as string).getTime() > now)
    .map((e) => ({
      id: String(e.assignment.id),
      title: e.assignment.name,
      course: e.context_name ?? null,
      dueDate: e.assignment.due_at,
      type: e.type ?? 'assignment',
      url: e.html_url ?? null,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
