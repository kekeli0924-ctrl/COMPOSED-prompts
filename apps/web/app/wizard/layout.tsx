import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

// Focused-flow header for the wizard + result: just the wordmark (to exit) and
// session controls. History/Account nav live only in the signed-in sidebar.
export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Composed
          </Link>
          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">Sign in</Button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
