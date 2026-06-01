'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { computeDashboardStats, type DashboardStats } from '@/lib/dashboard-stats';
import { findCourse, type HistoryResponse, type HistoryEntry } from '@composed-prompts/shared';

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const relTime = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { apiGet } = useApi();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<HistoryResponse>('/api/me/history?limit=50')
      .then((res) => {
        setEntries(res.entries);
        setStats(computeDashboardStats(res.entries, res.total, new Date()));
      })
      .catch(() => { setEntries([]); setStats({ promptsMade: 0, dayStreak: 0, nextAssessment: null }); });
  }, [isLoaded, isSignedIn, apiGet]);

  if (isLoaded && !isSignedIn) {
    return (
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">Welcome to Composed</h1>
        <p className="mt-2 text-muted-foreground">Sign in to see your dashboard.</p>
        <Button asChild className="mt-6 rounded-full"><Link href="/wizard">+ New prompt</Link></Button>
      </div>
    );
  }

  const statCards: { label: string; value: string }[] = [
    { label: 'Prompts made', value: String(stats?.promptsMade ?? '—') },
    { label: 'Day streak', value: String(stats?.dayStreak ?? '—') },
    { label: 'Next assessment', value: stats?.nextAssessment ? fmtDate(stats.nextAssessment) : '—' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <Button asChild className="rounded-full"><Link href="/wizard">+ New prompt</Link></Button>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="font-serif text-2xl text-foreground">{s.value}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      <p className="mt-8 mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent prompts</p>
      {entries === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {entries?.length === 0 && <p className="text-sm text-muted-foreground">No prompts yet — make your first one.</p>}
      <div className="space-y-2">
        {entries?.slice(0, 5).map((e) => {
          const course = e.courseId ? findCourse(e.courseId)?.name ?? e.courseId : 'Free-text class';
          return (
            <Link key={e.id} href={`/history`} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 hover:bg-muted">
              <div>
                <div className="text-sm font-medium text-foreground">{course}{e.assessmentType ? ` · ${e.assessmentType}` : ''}</div>
                <div className="text-xs text-muted-foreground">{relTime(e.createdAt)}</div>
              </div>
              <span className="text-muted-foreground">›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
