import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { lucia } from '../lib/auth.js';
import { db, schema } from '../lib/db.js';

export const auth = new Hono();

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
});

const LoginSchema = SignupSchema;

auth.post('/api/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid input',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      400,
    );
  }
  const { email, password } = parsed.data;
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    return c.json({ error: 'email already registered' }, 409);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [newUser] = await db
    .insert(schema.users)
    .values({ email, passwordHash, displayName: null })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
    });
  const session = await lucia.createSession(newUser!.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
  return c.json(
    { user: { id: newUser!.id, email: newUser!.email, displayName: newUser!.displayName } },
    200,
  );
});

auth.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input' }, 400);
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    return c.json({ error: 'invalid email or password' }, 401);
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'invalid email or password' }, 401);
  }
  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
  return c.json(
    { user: { id: user.id, email: user.email, displayName: user.displayName } },
    200,
  );
});

auth.post('/api/auth/logout', async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }
  const blank = lucia.createBlankSessionCookie();
  setCookie(c, blank.name, blank.value, blank.attributes);
  return c.json({ ok: true }, 200);
});
