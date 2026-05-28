'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost } from '@/lib/api-client';
import type { MeResponse } from '@composed-prompts/shared';

export type AuthUser = { id: string; email: string; displayName: string | null };

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authed'; user: AuthUser; profileSummary: string | null };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    apiGet<MeResponse>('/api/me')
      .then((data) => {
        if (data.user) {
          setState({
            status: 'authed',
            user: data.user,
            profileSummary: 'profileSummary' in data ? data.profileSummary : null,
          });
        } else {
          setState({ status: 'anonymous', user: null });
        }
      })
      .catch(() => setState({ status: 'anonymous', user: null }));
  }, []);

  const signOut = useCallback(async () => {
    await apiPost('/api/auth/logout', {});
    // Hard navigation so every component (header + whatever page you're on,
    // e.g. /account) reflects the signed-out state, not just this hook instance.
    window.location.assign('/');
  }, []);

  return { ...state, signOut };
}
