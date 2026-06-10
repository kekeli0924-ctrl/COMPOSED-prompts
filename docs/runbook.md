# Ops runbook — scheduled jobs (Fly.io)

Composed's background jobs run as **Fly Scheduled Machines** on the API app
(`composed-prompts-api`, region `iad`). They reuse the app's image and its existing
secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, optional `OPS_WEBHOOK_URL`) — no extra
credentials.

## The pinned-image caveat (read this before anything else)

Scheduled Machines are **unmanaged**: `fly deploy` does NOT update them. Each one stays
pinned to the image it was created from, forever.

- **Job code changed** (anything under `apps/api/src/jobs/` or the libs it imports) →
  you MUST destroy + recreate the machine after the next deploy, or it keeps running
  the old code.
- **Secret rotated** → no recreate needed. Secrets are injected at boot, so the next
  scheduled run picks up the new value automatically.

Recreate recipe (same for every job):

```bash
fly deploy -a composed-prompts-api          # ship the new code first
fly machine list -a composed-prompts-api    # find the old scheduled machine's id
fly machine destroy <old-machine-id> -a composed-prompts-api --force
fly image show -a composed-prompts-api      # note the CURRENT image ref
# then run the job-specific create command below with that image ref
```

## Job: `purge-recaps` — daily (EXISTS)

Retention + observability: purges expired recaps, prunes `rate_limit_log` rows older
than 48h, emits a counts-only ops digest (POSTs to `OPS_WEBHOOK_URL` if that secret is
set). Exits non-zero if a retention step fails so failures are visible in `fly logs`.

```bash
fly machine run <image-ref> npx tsx src/jobs/purge-recaps.ts \
  --app composed-prompts-api --region iad \
  --schedule daily --vm-size shared-cpu-1x --restart on-failure
```

## Job: `update-profiles` — weekly (FOR THE HUMAN TO CREATE)

Regenerates per-student preference summaries (`user_profiles.summary`) from their rated
generations (≥5 rated generations *created* in the last 30 days; one Opus call per
eligible student).

**Idempotent and safe to re-run**: it upserts each profile (`ON CONFLICT DO UPDATE`),
processes users independently, and a per-user failure is logged and skipped without
aborting the run. Running it twice just recomputes the same summaries.

```bash
fly machine run <image-ref> npx tsx src/jobs/update-profiles.ts \
  --app composed-prompts-api --region iad \
  --schedule weekly --vm-size shared-cpu-1x --restart on-failure
```

## Checking on the jobs

```bash
fly machine list -a composed-prompts-api          # scheduled machines + last state
fly logs -a composed-prompts-api | grep -E '\[purge-recaps\]|\[update-profiles\]|\[ops-digest\]'
```

Expected `purge-recaps` output per run: `deleted N expired recap(s)`, `deleted N old
rate-limit row(s)`, and an `[ops-digest]` JSON line (counts only — never user content).
