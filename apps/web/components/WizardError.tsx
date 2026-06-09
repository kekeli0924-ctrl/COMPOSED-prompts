'use client';

import { SignInButton } from '@clerk/nextjs';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Wizard error banner. For the shared-IP rate-limit case (`showSignIn`), it appends a
// sign-in prompt so a student behind the campus NAT can get their own personal limit.
// The modal keeps them on the page so the wizard inputs survive and they can retry.
export function WizardError({ message, showSignIn }: { message: string; showSignIn: boolean }) {
  return (
    <Alert className="mt-4">
      <AlertDescription>
        {message}
        {showSignIn && (
          <>
            {' '}
            <SignInButton mode="modal">
              <button type="button" className="font-medium text-primary underline underline-offset-2">
                Sign in
              </button>
            </SignInButton>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
