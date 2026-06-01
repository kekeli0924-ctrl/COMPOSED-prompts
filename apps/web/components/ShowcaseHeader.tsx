'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

export function ShowcaseHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Composed
        </Link>
        <nav className="flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/history" className="hover:text-foreground">History</Link>
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Sign up</Button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link href="/account" className="hover:text-foreground">Account</Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
