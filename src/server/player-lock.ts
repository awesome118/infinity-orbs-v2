import { context, redis } from './devvit-mock.js';

const PLAYER_MUTATION_LOCK_PREFIX = 'io:player-mutation-lock:';
const PLAYER_MUTATION_LOCK_TTL_MS = 45_000;
const PLAYER_MUTATION_LOCK_ATTEMPTS = 120;

function lockUserId(userId?: string): string {
  const id = String(userId ?? context.userId ?? '').trim();
  if (!id) throw new Error('REDDIT_LOGIN_REQUIRED');
  return id;
}

function randomUint32(): number {
  const sample = new Uint32Array(1);
  globalThis.crypto.getRandomValues(sample);
  return sample[0];
}

export async function withPlayerMutationLockFor<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const id = lockUserId(userId);
  const lockKey = PLAYER_MUTATION_LOCK_PREFIX + id;
  const token = `lock-${Date.now().toString(36)}-${randomUint32().toString(36)}`;

  for (let attempt = 0; attempt < PLAYER_MUTATION_LOCK_ATTEMPTS; attempt++) {
    await redis.set(lockKey, token, {
      nx: true,
      expiration: new Date(Date.now() + PLAYER_MUTATION_LOCK_TTL_MS),
    });

    const owner = await redis.get(lockKey);
    if (owner === token) {
      try {
        return await fn();
      } finally {
        const currentOwner = await redis.get(lockKey);
        if (currentOwner === token) {
          await redis.del(lockKey);
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error('Player state is busy. Please retry.');
}

export async function withPlayerMutationLock<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return withPlayerMutationLockFor(lockUserId(), fn);
}
