import { deleteExpiredRecaps } from '../lib/recaps.js';

// Runnable script for retention enforcement (cron later): `tsx src/jobs/purge-recaps.ts`.
// Mirrors jobs/update-profiles.ts's entrypoint guard. Not wired to any scheduler yet.
if (import.meta.url === `file://${process.argv[1]}`) {
  await import('dotenv/config');
  const n = await deleteExpiredRecaps();
  console.log(`[purge-recaps] deleted ${n} expired recap(s)`);
  process.exit(0);
}
