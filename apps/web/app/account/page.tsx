'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { MeResponse } from '@composed-prompts/shared';

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { apiGet } = useApi();
  const [profileSummary, setProfileSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<MeResponse>('/api/me')
      .then((d) => setProfileSummary('profileSummary' in d ? d.profileSummary : null))
      .catch(() => setProfileSummary(null));
  }, [isLoaded, isSignedIn, apiGet]);

  if (!isLoaded) {
    return <main className="mx-auto max-w-md px-6 py-16">Loading…</main>;
  }
  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <p>You&apos;re not signed in.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Your account</h1>
      <dl className="mt-6 grid gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium">{user.primaryEmailAddress?.emailAddress}</dd>
        </div>
        {profileSummary && (
          <div>
            <dt className="text-slate-500">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded border bg-white p-3 text-xs leading-relaxed">{profileSummary}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-xs text-slate-500">Manage your account from the avatar menu in the top-right.</p>
    </main>
  );
}
