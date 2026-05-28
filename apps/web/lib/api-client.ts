// Requests use same-origin relative paths (e.g. "/api/generate"). next.config.mjs
// rewrites /api/* to the Fly backend, so the browser only ever talks to its own
// origin — keeping the session cookie first-party. No NEXT_PUBLIC_API_BASE_URL.

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiPost<TRes>(path: string, body: unknown): Promise<TRes> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      (errBody as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
      errBody,
    );
  }
  return res.json() as Promise<TRes>;
}

export async function apiGet<TRes>(path: string): Promise<TRes> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      (errBody as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
      errBody,
    );
  }
  return res.json() as Promise<TRes>;
}
