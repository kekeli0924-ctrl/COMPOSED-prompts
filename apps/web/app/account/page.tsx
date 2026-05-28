'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/use-auth';
import { Button } from '@/components/ui/button';

export default function AccountPage() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return <main className="mx-auto max-w-md px-6 py-16">Loading…</main>;
  }
  if (auth.status === 'anonymous') {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <p>You&apos;re not signed in.</p>
        <div className="mt-4 flex gap-2">
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
          <Link href="/signup">
            <Button variant="outline">Sign up</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Your account</h1>
      <dl className="mt-6 grid gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium">{auth.user.email}</dd>
        </div>
        {auth.profileSummary && (
          <div>
            <dt className="text-slate-500">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded border bg-white p-3 text-xs leading-relaxed">
              {auth.profileSummary}
            </dd>
          </div>
        )}
      </dl>
      <Button variant="outline" className="mt-8" onClick={auth.signOut}>
        Sign out
      </Button>
    </main>
  );
}
