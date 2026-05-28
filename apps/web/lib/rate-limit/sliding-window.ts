import { kv } from '@/lib/kv';

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

export async function checkAndRecord(
  ip: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = `rl:${ip}`;
  try {
    const client = await kv();
    const now = Date.now();
    const windowStart = now - opts.windowSeconds * 1000;
    await client.zremrangebyscore(key, 0, windowStart);
    const count = await client.zcard(key);
    if (count >= opts.limit) {
      return { allowed: false, remaining: 0 };
    }
    await client.zadd(key, { score: now, member: `${now}-${Math.random()}` });
    await client.expire(key, opts.windowSeconds);
    return { allowed: true, remaining: opts.limit - count - 1 };
  } catch {
    return { allowed: true, remaining: opts.limit };
  }
}
