import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { lucia } from '../lib/auth.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: string; email: string; displayName: string | null } | null;
    sessionId: string | null;
  }
}

export const sessionMiddleware: MiddlewareHandler = async (c, next) => {
  const cookieName = lucia.sessionCookieName;
  const sessionId = getCookie(c, cookieName) ?? null;

  if (!sessionId) {
    c.set('user', null);
    c.set('sessionId', null);
    return next();
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (session && session.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    setCookie(c, cookie.name, cookie.value, cookie.attributes);
  }

  if (!session) {
    const cookie = lucia.createBlankSessionCookie();
    setCookie(c, cookie.name, cookie.value, cookie.attributes);
    c.set('user', null);
    c.set('sessionId', null);
    return next();
  }

  c.set('user', user as { id: string; email: string; displayName: string | null });
  c.set('sessionId', session.id);
  return next();
};
