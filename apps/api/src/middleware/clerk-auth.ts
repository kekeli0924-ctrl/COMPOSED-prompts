import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '@clerk/backend';
import { clerkClient } from '../lib/clerk.js';
import { getOrCreateUser } from '../lib/users.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: string; email: string; displayName: string | null } | null;
  }
}

export const clerkAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authz = c.req.header('authorization');
  const token = authz?.startsWith('Bearer ') ? authz.slice(7) : null;

  if (!token) {
    c.set('user', null);
    return next();
  }

  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const clerkUserId = payload.sub;
    const user = await getOrCreateUser(clerkUserId, async () => {
      const u = await clerkClient.users.getUser(clerkUserId);
      const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
      const email = primary?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@unknown.local`;
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
      return { email, displayName };
    });
    c.set('user', { id: user.id, email: user.email, displayName: user.displayName });
  } catch {
    c.set('user', null);
  }
  return next();
};
