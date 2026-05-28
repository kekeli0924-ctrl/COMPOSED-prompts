'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiPost, ApiError } from '@/lib/api-client';
import type { AuthResponse } from '@composed-prompts/shared';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      await apiPost<AuthResponse>(path, { email, password });
      router.push('/account');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  const title = mode === 'login' ? 'Sign in' : 'Create account';
  const cta = mode === 'login' ? 'Sign in' : 'Sign up';
  const altText = mode === 'login' ? "Don't have an account?" : 'Already have an account?';
  const altLink = mode === 'login' ? '/signup' : '/login';
  const altLinkText = mode === 'login' ? 'Sign up' : 'Sign in';

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="password">Password (min 10 chars)</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
          />
        </div>
        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? '...' : cta}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        {altText}{' '}
        <Link href={altLink} className="underline">
          {altLinkText}
        </Link>
      </p>
    </main>
  );
}
