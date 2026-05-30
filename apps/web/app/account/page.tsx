'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { MeResponse } from '@composed-prompts/shared';

const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;

type MeView = { profileSummary: string | null; gradYear: number | null; grade: string | null };

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { apiGet, apiPatch } = useApi();
  const [me, setMe] = useState<MeView | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<MeResponse>('/api/me')
      .then((d) => {
        if (d.user) setMe({ profileSummary: d.profileSummary, gradYear: d.gradYear, grade: d.grade });
      })
      .catch(() => setMe(null));
  }, [isLoaded, isSignedIn, apiGet]);

  const onGradeChange = async (value: string): Promise<void> => {
    const grade = value === '' ? null : value;
    const res = await apiPatch<{ gradYear: number | null; grade: string | null }>('/api/me/grade', { grade });
    setMe((prev) => (prev ? { ...prev, gradYear: res.gradYear, grade: res.grade } : prev));
  };

  if (!isLoaded) return <main className="mx-auto max-w-md px-6 py-16">Loading…</main>;
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
        <div>
          <dt className="text-slate-500">Grade</dt>
          <dd className="mt-1">
            {me?.grade ? (
              <span className="font-medium">{me.grade} · Class of {me.gradYear}</span>
            ) : (
              <span className="text-slate-500">
                We couldn&apos;t read your grade from your email — pick it below.
              </span>
            )}
            <select
              aria-label="Your grade"
              className="mt-2 block rounded border px-2 py-1"
              value={me?.grade ?? ''}
              onChange={(e) => onGradeChange(e.target.value)}
            >
              <option value="">Not set</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </dd>
        </div>
        {me?.profileSummary && (
          <div>
            <dt className="text-slate-500">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded border bg-white p-3 text-xs leading-relaxed">{me.profileSummary}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-xs text-slate-500">Manage your account from the avatar menu in the top-right.</p>
    </main>
  );
}
