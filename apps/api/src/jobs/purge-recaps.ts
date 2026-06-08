// Load .env BEFORE importing db.ts (which reads DATABASE_URL at module-eval time).
// Static imports hoist, so this must precede the recaps import. No-op on Fly, where
// DATABASE_URL is already in the environment from the app secret (dotenv won't override it).
import 'dotenv/config';
import { deleteExpiredRecaps } from '../lib/recaps.js';

// Retention enforcement for the recap capture loop. Standalone scheduled process:
// connects (via DATABASE_URL), runs deleteExpiredRecaps(), logs ONLY a count (never
// any recap text or row contents), exits 0 on success and non-zero on failure so a
// failed scheduled run is visible in `fly logs`. Mirrors jobs/update-profiles.ts.
//
// Scheduled on Fly.io as a daily Scheduled Machine that reuses THIS app's image and
// its existing DATABASE_URL secret (no new credential). To (re)create the schedule:
//
//   fly image show -a composed-prompts-api            # note the current image ref
//   fly machine run <image-ref> npx tsx src/jobs/purge-recaps.ts \
//     --app composed-prompts-api --region iad \
//     --schedule daily --vm-size shared-cpu-1x --restart on-failure
//
// `--schedule daily` runs ~once/day at a Fly-determined time (interval bucket — Fly
// Scheduled Machines don't support a specific hour). The Machine pins to the image it
// was created from, so recreate it if this job's logic changes.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const n = await deleteExpiredRecaps();
    console.log(`[purge-recaps] deleted ${n} expired recap(s)`);
    process.exit(0);
  } catch (err) {
    // Count/diagnostics only — the error is a DB/connection error, never row contents.
    console.error('[purge-recaps] failed', { message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
