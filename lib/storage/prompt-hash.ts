import { createHash } from 'node:crypto';

export function promptHash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
