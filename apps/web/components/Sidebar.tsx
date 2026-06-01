'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignedIn, SignedOut, SignInButton, SignOutButton, useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

const icons = {
  dashboard: <path d="M3 11l9-8 9 8M5 10v9h14v-9" />,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plan: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></>,
} as const;

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/plan', label: 'Study plan', icon: 'plan' },
  { href: '/account', label: 'Account', icon: 'account' },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
              active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {icons[item.icon]}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Panel({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useUser();
  return (
    <div className="flex h-full flex-col p-4">
      <Link href="/dashboard" onClick={onNavigate} className="px-2 pb-4 font-serif text-xl font-semibold tracking-tight text-foreground">
        Composed
      </Link>
      <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Menu</p>
      <NavLinks onNavigate={onNavigate} />
      <Button asChild className="mt-4 rounded-full">
        <Link href="/wizard" onClick={onNavigate}>+ New prompt</Link>
      </Button>
      <div className="mt-auto pt-4">
        <SignedIn>
          <div className="flex items-center justify-between gap-2 px-2 text-sm">
            <span className="truncate text-foreground">{user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? 'You'}</span>
            <SignOutButton><button type="button" className="text-xs text-muted-foreground hover:text-foreground">Sign out</button></SignOutButton>
          </div>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal"><Button variant="outline" size="sm" className="w-full rounded-full">Sign in</Button></SignInButton>
        </SignedOut>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Link href="/dashboard" className="font-serif text-lg font-semibold text-foreground">Composed</Link>
        <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="text-foreground">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-64 bg-card shadow-soft"><Panel onNavigate={() => setOpen(false)} /></div>
        </div>
      )}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block">
        <Panel />
      </aside>
    </>
  );
}
