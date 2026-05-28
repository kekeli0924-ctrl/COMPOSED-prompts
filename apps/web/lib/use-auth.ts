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
    setState({ status: 'anonymous', user: null });
  }, []);

  return { ...state, signOut };
}
