type HeaderReader = { req: { header: (k: string) => string | undefined } };

// Derive the client IP from headers a client cannot spoof. Fly's proxy sets
// Fly-Client-IP at its edge (overwriting any client-supplied value), so it is
// the trusted source in production. We MUST run behind Fly: if Fly-Client-IP is
// absent in production we do NOT trust client-supplied X-Forwarded-For (that
// would reopen the spoof bypass) — we collapse to one shared 'unknown' bucket.
// In dev (no Fly edge) we fall back to the RIGHT-most X-Forwarded-For entry
// (never the left-most, which is attacker-controlled).
export function getIp(c: HeaderReader): string {
  const flyIp = c.req.header('fly-client-ip');
  if (flyIp) return flyIp.trim();
  // No trusted edge header. In production that means the request didn't come
  // through Fly's proxy — refuse to trust client headers (fail safe).
  if (process.env.NODE_ENV === 'production') return 'unknown';
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}
