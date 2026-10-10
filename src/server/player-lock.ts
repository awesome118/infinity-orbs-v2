import { context, redis } from './devvit-mock.js';

const PLAYER_MUTATION_LOCK_PREFIX = 'io:player-mutation-lock:';
const PLAYER_MUTATION_LOCK_TTL_MS = 90_000;
const PLAYER_MUTATION_LOCK_ATTEMPTS = 360;

// Requests handled by the same runtime instance are serialized locally before
// they ever contend for the distributed Redis lock. Redis still protects
// concurrent requests handled by different server runtimes.
const localMutationTails = new Map<string, Promise<void>>();
const activeMutationTokens = new Map<string, string>();


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


export function getActivePlayerMutationLock(
  userId: string,
): { key: string; token: string } | null {
  const id = String(userId ?? '').trim();
  if (!id) return null;
  const token = activeMutationTokens.get(id);
  return token ? { key: PLAYER_MUTATION_LOCK_PREFIX + id, token } : null;
}

async function renewOwnedLock(lockKey: string, token: string): Promise<boolean> {
  const txn = await redis.watch(lockKey);
  const owner = await redis.get(lockKey);
  if (owner !== token) {
    await txn.unwatch();
    return false;
  }

  await txn.multi();
  await txn.set(lockKey, token, {
    expiration: new Date(Date.now() + PLAYER_MUTATION_LOCK_TTL_MS),
  });
  return (await txn.exec()) !== null;
}

async function releaseOwnedLock(lockKey: string, token: string): Promise<void> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const txn = await redis.watch(lockKey);
      const owner = await redis.get(lockKey);
      if (owner !== token) {
        await txn.unwatch();
        return;
      }

      await txn.multi();
      await txn.del(lockKey);
      const committed = await txn.exec();
      if (committed !== null) return;
    }
    // Never fall back to an unguarded DEL. If ownership changes repeatedly,
    // the correct behavior is to leave cleanup to the lease expiry.
    console.error('[Player Lock] Could not safely release the lock; lease will expire.');
  } catch (error) {
    console.error('[Player Lock] Could not safely release the lock; lease will expire:', error);
  }
}

export async function withPlayerMutationLockFor<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const id = lockUserId(userId);

  // Serialize same-player operations in this runtime first. This makes
  // normal click bursts and background mutations deterministic locally.
  const previous = localMutationTails.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  localMutationTails.set(id, tail);

  await previous;

  const lockKey = PLAYER_MUTATION_LOCK_PREFIX + id;
  const token = `lock-${Date.now().toString(36)}-${randomUint32().toString(36)}`;

  try {
    for (let attempt = 0; attempt < PLAYER_MUTATION_LOCK_ATTEMPTS; attempt++) {
      await redis.set(lockKey, token, {
        nx: true,
        expiration: new Date(Date.now() + PLAYER_MUTATION_LOCK_TTL_MS),
      });

      const owner = await redis.get(lockKey);
      if (owner === token) {
        activeMutationTokens.set(id, token);
        // Renew the distributed lease while the callback is running. The
        // renewal only extends this exact token; it never reacquires a lost
        // lease, which would let an old callback impersonate a new owner.
        let renewalInFlight = false;
        const renewalTimer = setInterval(() => {
          if (renewalInFlight) return;
          renewalInFlight = true;
          void renewOwnedLock(lockKey, token)
            .then(renewed => {
              if (!renewed) {
                console.error('[Player Lock] Lease was lost before the callback finished.');
              }
            })
            .catch(error => {
              console.error('[Player Lock] Lease renewal failed; it may expire before the callback finishes:', error);
            })
            .finally(() => {
              renewalInFlight = false;
            });
        }, Math.max(1_000, Math.floor(PLAYER_MUTATION_LOCK_TTL_MS / 3)));

        try {
          return await fn();
        } finally {
          clearInterval(renewalTimer);
          await releaseOwnedLock(lockKey, token);
          if (activeMutationTokens.get(id) === token) {
            activeMutationTokens.delete(id);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 25));
    }

    throw new Error('Player state is busy. Please retry.');
  } finally {
    release();

    // A newer queued mutation may already have replaced this entry.
    if (localMutationTails.get(id) === tail) {
      localMutationTails.delete(id);
    }
  }
}

export async function withPlayerMutationLock<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return withPlayerMutationLockFor(lockUserId(), fn);
}
