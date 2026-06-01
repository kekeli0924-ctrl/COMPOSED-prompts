'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { MeResponse } from '@composed-prompts/shared';
import { CalendarConnect } from '@/components/CalendarConnect';

type MeView = { profileSummary: string | null; gradYear: number | null; grade: string | null };

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { apiGet } = useApi();
  const [me, setMe] = useState<MeView | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<MeResponse>('/api/me')
      .then((d) => {
        if (d.user) setMe({ profileSummary: d.profileSummary, gradYear: d.gradYear, grade: d.grade });
      })
      .catch(() => setMe(null));
  }, [isLoaded, isSignedIn, apiGet]);

  if (!isLoaded) return <main className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">Loading…</main>;
  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-muted-foreground">You&apos;re not signed in.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-3xl text-foreground">Your account</h1>
      <dl className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-6 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium text-foreground">{user.primaryEmailAddress?.emailAddress}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Grade</dt>
          <dd className="mt-1">
            {me?.grade ? (
              <span className="font-medium text-foreground">{me.grade} · Class of {me.gradYear}</span>
            ) : (
              <span className="text-muted-foreground">
                We couldn&apos;t determine your grade from your school email.
              </span>
            )}
          </dd>
        </div>
        <CalendarConnect />
        {me?.profileSummary && (
          <div>
            <dt className="text-muted-foreground">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded-2xl border border-border bg-card p-3 text-xs leading-relaxed text-foreground">{me.profileSummary}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-xs text-muted-foreground">
        Your grade is set automatically from your school email&apos;s class year. Manage your account from the avatar menu in the top-right.
      </p>
    </main>
  );
}
