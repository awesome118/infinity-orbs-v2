import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDevvitRuntime } from '../src/server/devvit-mock.js';
import { challengeCombatArena } from '../src/server/combat.js';
import { createCombatState } from '../src/shared/combat.js';

const ARENA_PROFILES = 'infinity-orbs:combat:arena:profiles';
const values = new Map<string, string>();
const hashes = new Map<string, Record<string, string>>();
const revisions = new Map<string, number>();

function bump(key: string): void {
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
}
function reset(): void {
  values.clear();
  hashes.clear();
  revisions.clear();
}
const redisMock = {
  get: async (key: string) => values.get(key) ?? null,
  set: async (key: string, value: string) => {
    values.set(key, value);
    bump(key);
    return 'OK';
  },
  hGetAll: async (key: string) => ({ ...(hashes.get(key) ?? {}) }),
  hSet: async (key: string, fields: Record<string, string>) => {
    const current = hashes.get(key) ?? {};
    hashes.set(key, { ...current, ...fields });
    return Object.keys(fields).length;
  },
  watch: async (...keys: string[]) => {
    const observed = new Map(keys.map(key => [key, revisions.get(key) ?? 0]));
    const writes: Array<{ key: string; value: string }> = [];
    return {
      multi: async () => undefined,
      set: async (key: string, value: string) => { writes.push({ key, value }); return 'QUEUED'; },
      exec: async () => {
        if (keys.some(key => (revisions.get(key) ?? 0) !== observed.get(key))) return null;
        for (const write of writes) {
          values.set(write.key, write.value);
          bump(write.key);
        }
        return [];
      },
      unwatch: async () => undefined,
    };
  },
};

function useUser(userId: string): void {
  configureDevvitRuntime({
    redis: redisMock,
    context: { userId, username: userId },
    reddit: {},
  });
}
function savePlayer(userId: string): void {
  values.set('infinity-orbs:combat:' + userId, JSON.stringify(createCombatState()));
}

test('Arena results protect both participants from being challenged again for 90 seconds', async () => {
  reset();
  const now = Date.now();
  const profile = {
    userId: 'arena-target',
    username: 'arena-target',
    level: 1,
    bestDepth: 1,
    rating: 1000,
    wins: 0,
    losses: 0,
    updatedAt: now,
    challengeBlockedUntil: 0,
    damage: 54,
    speed: 310,
    maxHealth: 1040,
    critChance: 0.12,
    weaponName: 'Delver Knife',
    armorName: 'Worn Leathers',
    skillRanks: 0,
  };
  hashes.set(ARENA_PROFILES, { 'arena-target': JSON.stringify(profile) });
  savePlayer('arena-challenger');
  savePlayer('arena-target');

  useUser('arena-challenger');
  const result = await challengeCombatArena('arena-target');
  assert.ok(result.arenaResult);
  const targetAfter = JSON.parse(values.get('infinity-orbs:combat:arena-target') ?? '{}');
  const challengerAfter = JSON.parse(values.get('infinity-orbs:combat:arena-challenger') ?? '{}');
  assert.ok(targetAfter.arenaLastMatchAt >= now);
  assert.ok(challengerAfter.arenaLastMatchAt >= now);
  assert.equal(targetAfter.arenaLastChallengeAt, 0, 'being challenged should not consume the target’s outgoing challenge');

  useUser('arena-third-player');
  await assert.rejects(
    challengeCombatArena('arena-target'),
    /ARENA_OPPONENT_COOLDOWN:/,
  );
});
