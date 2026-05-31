type HeaderReader = { req: { header: (k: string) => string | undefined } };

// Derive the client IP from headers a client cannot spoof. Fly's proxy sets
// Fly-Client-IP at its edge (overwriting any client-supplied value); the
// RIGHT-most X-Forwarded-For entry is the hop closest to that trusted edge.
// Never trust the left-most X-Forwarded-For value — it is attacker-controlled.
export function getIp(c: HeaderReader): string {
  const flyIp = c.req.header('fly-client-ip');
  if (flyIp) return flyIp.trim();
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',');
    return parts[parts.length - 1]!.trim();
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}
