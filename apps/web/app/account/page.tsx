'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { MeResponse, Grade } from '@composed-prompts/shared';
import { CalendarConnect } from '@/components/CalendarConnect';

const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;

type MeView = { profileSummary: string | null; gradYear: number | null; grade: string | null };

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { apiGet, apiPatch } = useApi();
  const [me, setMe] = useState<MeView | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<MeResponse>('/api/me')
      .then((d) => {
        if (d.user) setMe({ profileSummary: d.profileSummary, gradYear: d.gradYear, grade: d.grade });
      })
      .catch(() => setMe(null));
  }, [isLoaded, isSignedIn, apiGet]);

  const onGradeChange = async (value: Grade | ''): Promise<void> => {
    const grade = value === '' ? null : value;
    setGradeError(null);
    try {
      const res = await apiPatch<{ gradYear: number | null; grade: string | null }>('/api/me/grade', { grade });
      setMe((prev) => (prev ? { ...prev, gradYear: res.gradYear, grade: res.grade } : prev));
    } catch {
      setGradeError("Couldn't save your grade — try again.");
    }
  };

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
                We couldn&apos;t read your grade from your email — pick it below.
              </span>
            )}
            <select
              aria-label="Your grade"
              className="mt-2 block rounded-md border border-border px-2 py-1"
              value={me?.grade ?? ''}
              onChange={(e) => onGradeChange(e.target.value as Grade | '')}
            >
              <option value="">Not set</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {gradeError && <p className="mt-1 text-xs text-red-600">{gradeError}</p>}
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
      <p className="mt-8 text-xs text-muted-foreground">Manage your account from the avatar menu in the top-right.</p>
    </main>
  );
}
