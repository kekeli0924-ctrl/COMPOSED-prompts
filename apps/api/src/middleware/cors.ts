import { cors } from 'hono/cors';

const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3100').split(',').map((s) => s.trim());

export const corsMiddleware = cors({
  origin: (origin) => (allowed.includes(origin) ? origin : null),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Remaining'],
  maxAge: 600,
});
