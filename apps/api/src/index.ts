import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import 'dotenv/config';
import { health } from './routes/health.js';
import { generate } from './routes/generate.js';
import { sharpen } from './routes/sharpen.js';
import { feedback } from './routes/feedback.js';
import { me } from './routes/me.js';
import { canvas } from './routes/canvas.js';
import { calendar } from './routes/calendar.js';
import { recap } from './routes/recap.js';
import { outcome } from './routes/outcome.js';
import { corsMiddleware } from './middleware/cors.js';
import { clerkAuthMiddleware } from './middleware/clerk-auth.js';

const app = new Hono();

app.use('*', corsMiddleware);
app.use('*', clerkAuthMiddleware);
app.route('/', health);
app.route('/', generate);
app.route('/', sharpen);
app.route('/', feedback);
app.route('/', me);
app.route('/', canvas);
app.route('/', calendar);
app.route('/', recap);
app.route('/', outcome);
app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
