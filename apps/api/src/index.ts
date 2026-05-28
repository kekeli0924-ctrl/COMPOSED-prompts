import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import 'dotenv/config';
import { health } from './routes/health.js';
import { generate } from './routes/generate.js';
import { feedback } from './routes/feedback.js';
import { me } from './routes/me.js';
import { corsMiddleware } from './middleware/cors.js';
import { clerkAuthMiddleware } from './middleware/clerk-auth.js';

const app = new Hono();

app.use('*', corsMiddleware);
app.use('*', clerkAuthMiddleware);
app.route('/', health);
app.route('/', generate);
app.route('/', feedback);
app.route('/', me);
app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
