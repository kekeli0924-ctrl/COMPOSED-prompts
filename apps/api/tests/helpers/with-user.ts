import type { MiddlewareHandler } from 'hono';

export type TestUser = { id: string; email: string; displayName: string | null; gradYear?: number | null } | null;

// Stubs clerkAuthMiddleware in tests: injects a fixed user (or null for anon)
// without needing a real Clerk token.
export const withUser = (user: TestUser): MiddlewareHandler => async (c, next) => {
  c.set('user', user);
  return next();
};
