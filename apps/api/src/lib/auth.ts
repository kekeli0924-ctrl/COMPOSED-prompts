import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db, schema } from './db.js';

const adapter = new DrizzlePostgreSQLAdapter(db, schema.sessions, schema.users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: 'composed-prompts-session',
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      // domain undefined = host-only cookie on api.fly.dev
    },
  },
  getUserAttributes: (attrs) => ({
    email: attrs.email,
    displayName: attrs.display_name,
  }),
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: { email: string; display_name: string | null };
  }
}
