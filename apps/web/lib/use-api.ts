'use client';

import { useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { apiGet, apiPost } from '@/lib/api-client';

// Wraps the API client with the current Clerk session token. When signed out,
// getToken() returns null and calls go through anonymously.
//
// Memoized on getToken (referentially stable from Clerk) so the returned object
// keeps a stable identity across renders — callers can safely list these in
// useEffect dependency arrays without re-firing the effect every render.
export function useApi() {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      apiGet: async <T>(path: string): Promise<T> => apiGet<T>(path, (await getToken()) ?? undefined),
      apiPost: async <T>(path: string, body: unknown): Promise<T> =>
        apiPost<T>(path, body, (await getToken()) ?? undefined),
    }),
    [getToken],
  );
}
