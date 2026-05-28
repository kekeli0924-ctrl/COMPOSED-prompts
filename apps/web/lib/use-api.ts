'use client';

import { useAuth } from '@clerk/nextjs';
import { apiGet, apiPost } from '@/lib/api-client';

// Wraps the API client with the current Clerk session token. When signed out,
// getToken() returns null and calls go through anonymously.
export function useApi() {
  const { getToken } = useAuth();
  return {
    apiGet: async <T>(path: string): Promise<T> => apiGet<T>(path, (await getToken()) ?? undefined),
    apiPost: async <T>(path: string, body: unknown): Promise<T> =>
      apiPost<T>(path, body, (await getToken()) ?? undefined),
  };
}
