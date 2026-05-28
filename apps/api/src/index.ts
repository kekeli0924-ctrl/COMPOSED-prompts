import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import 'dotenv/config';
import { health } from './routes/health.js';
import { corsMiddleware } from './middleware/cors.js';

const app = new Hono();

app.use('*', corsMiddleware);
app.route('/', health);
app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
