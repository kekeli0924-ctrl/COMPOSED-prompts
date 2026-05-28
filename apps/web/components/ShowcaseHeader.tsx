'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/use-auth';

export function ShowcaseHeader() {
  const auth = useAuth();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-serif text-base italic tracking-tight">
          Composed
        </Link>
        <nav className="flex items-center gap-3 text-sm text-slate-600">
          <Link href="/history" className="hover:text-slate-900">History</Link>
          <Link href="/about" className="hover:text-slate-900">How it works</Link>
          {auth.status === 'loading' && <span className="text-xs text-slate-400">…</span>}
          {auth.status === 'anonymous' && (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
          {auth.status === 'authed' && (
            <>
              <Link href="/account">
                <Button variant="ghost" size="sm">{auth.user.email}</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={auth.signOut}>
                Sign out
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
