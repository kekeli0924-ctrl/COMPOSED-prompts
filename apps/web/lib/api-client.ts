const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiPost<TRes>(path: string, body: unknown): Promise<TRes> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
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
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { credentials: 'include' });
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
