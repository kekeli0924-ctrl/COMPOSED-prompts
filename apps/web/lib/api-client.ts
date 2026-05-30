// Requests use same-origin relative paths (e.g. "/api/generate"). next.config.mjs
// rewrites /api/* to the Fly backend, so the browser only ever talks to its own
// origin — keeping the session cookie first-party. No NEXT_PUBLIC_API_BASE_URL.

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiPost<TRes>(path: string, body: unknown, token?: string): Promise<TRes> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
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

export async function apiGet<TRes>(path: string, token?: string): Promise<TRes> {
  const res = await fetch(path, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

export async function apiPatch<TRes>(path: string, body: unknown, token?: string): Promise<TRes> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
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
