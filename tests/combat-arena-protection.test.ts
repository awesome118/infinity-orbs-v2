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

test('Concurrent challengers cannot both bypass the same opponent protection window', async () => {
  reset();
  const now = Date.now();
  const targetProfile = {
    userId: 'arena-shared-target',
    username: 'arena-shared-target',
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
  hashes.set(ARENA_PROFILES, { 'arena-shared-target': JSON.stringify(targetProfile) });
  savePlayer('arena-attacker-a');
  savePlayer('arena-attacker-b');
  savePlayer('arena-shared-target');

  useUser('arena-attacker-a');
  const challengeA = challengeCombatArena('arena-shared-target');
  useUser('arena-attacker-b');
  const challengeB = challengeCombatArena('arena-shared-target');
  const outcomes = await Promise.allSettled([challengeA, challengeB]);

  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(outcome => outcome.status === 'rejected');
  if (!rejected || rejected.status !== 'rejected') {
    assert.fail('Expected the competing challenger to be rejected by the target protection window.');
  }
  assert.match(String(rejected.reason), /ARENA_OPPONENT_COOLDOWN:/);
  const targetAfter = JSON.parse(values.get('infinity-orbs:combat:arena-shared-target') ?? '{}');
  assert.equal(targetAfter.arenaWins + targetAfter.arenaLosses, 1);
});

test('Arena opponent protection expires after the cooldown window', async () => {
  reset();
  const oldMatchAt = Date.now() - 90_001;
  const targetState = createCombatState();
  targetState.arenaLastMatchAt = oldMatchAt;
  values.set('infinity-orbs:combat:arena-expired-target', JSON.stringify(targetState));
  const targetProfile = {
    userId: 'arena-expired-target',
    username: 'arena-expired-target',
    level: 1,
    bestDepth: 1,
    rating: 1000,
    wins: 0,
    losses: 0,
    updatedAt: Date.now(),
    challengeBlockedUntil: oldMatchAt + 90_000,
    damage: 54,
    speed: 310,
    maxHealth: 1040,
    critChance: 0.12,
    weaponName: 'Delver Knife',
    armorName: 'Worn Leathers',
    skillRanks: 0,
  };
  hashes.set(ARENA_PROFILES, { 'arena-expired-target': JSON.stringify(targetProfile) });
  savePlayer('arena-new-attacker');

  useUser('arena-new-attacker');
  const result = await challengeCombatArena('arena-expired-target');
  assert.ok(result.arenaResult);
  assert.equal(result.arenaResult.opponent.userId, 'arena-expired-target');
});
