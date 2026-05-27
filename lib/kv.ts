// Thin wrapper around @vercel/kv that falls back to an in-memory map when
// KV_REST_API_URL is missing (local dev + tests).

type KvLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  incrbyfloat(key: string, n: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  zadd(key: string, scoreMember: { score: number; member: string }): Promise<unknown>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zcard(key: string): Promise<number>;
};

let _client: KvLike | null = null;

async function loadClient(): Promise<KvLike> {
  if (_client) return _client;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import('@vercel/kv');
    _client = kv as unknown as KvLike;
    return _client;
  }
  // In-memory fallback
  const store = new Map<string, unknown>();
  const sortedSets = new Map<string, Array<{ score: number; member: string }>>();
  const expirations = new Map<string, number>();

  const purgeExpired = (key: string): void => {
    const t = expirations.get(key);
    if (t !== undefined && t <= Date.now()) {
      store.delete(key);
      sortedSets.delete(key);
      expirations.delete(key);
    }
  };

  _client = {
    async get<T = unknown>(key: string): Promise<T | null> {
      purgeExpired(key);
      return (store.get(key) as T | undefined) ?? null;
    },
    async set(key, value, opts) {
      store.set(key, value);
      if (opts?.ex) expirations.set(key, Date.now() + opts.ex * 1000);
      return 'OK';
    },
    async incr(key) {
      purgeExpired(key);
      const cur = (store.get(key) as number | undefined) ?? 0;
      const next = cur + 1;
      store.set(key, next);
      return next;
    },
    async incrbyfloat(key, n) {
      purgeExpired(key);
      const cur = (store.get(key) as number | undefined) ?? 0;
      const next = cur + n;
      store.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      expirations.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    async zadd(key, sm) {
      const list = sortedSets.get(key) ?? [];
      list.push(sm);
      sortedSets.set(key, list);
      return 1;
    },
    async zremrangebyscore(key, min, max) {
      const list = sortedSets.get(key) ?? [];
      const next = list.filter((x) => x.score < min || x.score > max);
      sortedSets.set(key, next);
      return list.length - next.length;
    },
    async zcard(key) {
      return (sortedSets.get(key) ?? []).length;
    },
  };
  return _client;
}

export async function kv(): Promise<KvLike> {
  return loadClient();
}
