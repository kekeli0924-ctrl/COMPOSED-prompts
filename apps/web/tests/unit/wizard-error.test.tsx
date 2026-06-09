import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WizardError } from '@/components/WizardError';

// Clerk's SignInButton needs a provider; stub it to a passthrough so we can assert the
// sign-in affordance renders without standing up ClerkProvider.
vi.mock('@clerk/nextjs', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('WizardError', () => {
  it('shows a sign-in prompt for the shared-IP (scope=ip) case', () => {
    render(
      <WizardError
        message="This network has hit today's shared limit. Sign in to get your own personal limit."
        showSignIn
      />,
    );
    expect(screen.getByText(/shared limit/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('shows no sign-in prompt for a personal (scope=user) limit message', () => {
    render(<WizardError message="You've hit today's daily limit — try again tomorrow." showSignIn={false} />);
    expect(screen.getByText(/daily limit/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });
});
