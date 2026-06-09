// Load .env BEFORE importing db.ts (which reads DATABASE_URL at module-eval time).
// Static imports hoist, so this must precede the db-touching imports. No-op on Fly, where
// DATABASE_URL is already in the environment from the app secret (dotenv won't override it).
import 'dotenv/config';
import { deleteExpiredRecaps } from '../lib/recaps.js';
import { pruneOldRateLimitEntries } from '../lib/rate-limit.js';
import { buildDigest, formatDigest, postDigest } from '../lib/ops-digest.js';

// Daily maintenance job (retention + observability). Standalone scheduled process:
//   1. purge expired recaps (retention),
//   2. prune rate_limit_log rows older than 48h (it grows forever; windows are daily),
//   3. emit a COUNTS-ONLY ops digest (and POST it to OPS_WEBHOOK_URL if set).
// Logs ONLY counts/lengths — never recap text or any user content, including in errors.
// Exits non-zero if a RETENTION step fails (so a failed run is visible in `fly logs`);
// the digest is best-effort and never fails the job. Mirrors jobs/update-profiles.ts.
//
// Scheduled on Fly.io as a daily Scheduled Machine that reuses THIS app's image and its
// existing DATABASE_URL secret (no new credential). To (re)create the schedule:
//
//   fly image show -a composed-prompts-api            # note the current image ref
//   fly machine run <image-ref> npx tsx src/jobs/purge-recaps.ts \
//     --app composed-prompts-api --region iad \
//     --schedule daily --vm-size shared-cpu-1x --restart on-failure
//
// `--schedule daily` runs ~once/day at a Fly-determined time. The Machine pins to the
// image it was created from, so RECREATE it whenever this job's logic changes (it just
// did — Phase 0). OPS_WEBHOOK_URL, if used, must be set as a Fly secret.
if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;

  try {
    const n = await deleteExpiredRecaps();
    console.log(`[purge-recaps] deleted ${n} expired recap(s)`);
  } catch (err) {
    // Count/diagnostics only — the error is a DB/connection error, never row contents.
    console.error('[purge-recaps] recap purge failed', { message: err instanceof Error ? err.message : String(err) });
    failed = true;
  }

  try {
    // 48h retention: comfortably past the 24h rate-limit window, so live counters are unaffected.
    const n = await pruneOldRateLimitEntries(48 * 60 * 60);
    console.log(`[purge-recaps] deleted ${n} old rate-limit row(s)`);
  } catch (err) {
    console.error('[purge-recaps] rate-limit prune failed', { message: err instanceof Error ? err.message : String(err) });
    failed = true;
  }

  // Observability — best-effort, never fails the job.
  try {
    const digest = await buildDigest();
    console.log('[ops-digest]', JSON.stringify(digest));
    await postDigest(formatDigest(digest));
  } catch (err) {
    console.error('[ops-digest] digest failed (non-fatal)', { message: err instanceof Error ? err.message : String(err) });
  }

  process.exit(failed ? 1 : 0);
}
