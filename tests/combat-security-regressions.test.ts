import test from 'node:test';
import assert from 'node:assert/strict';
import { context, redis } from '../src/server/devvit-mock.js';
import { getCombatSnapshot, performCombatBeat, rollCombatSkill } from '../src/server/combat.js';
import { COMBAT_BEAT_INTERVAL_MS, calculateCombatArenaRatingUpdate, getEnemyForDungeonDepth } from '../src/shared/combat.js';

async function withPlayer<T>(userId: string, run: (key: string) => Promise<T>): Promise<T> {
  const priorUserId = context.userId;
  const priorUsername = context.username;
  const key = 'infinity-orbs:combat:' + userId;
  try {
    context.userId = userId;
    context.username = 'CombatSecurityTest';
    await redis.del(key);
    await redis.hDel('infinity-orbs:combat:arena:profiles', userId);
    return await run(key);
  } finally {
    await redis.del(key);
    await redis.hDel('infinity-orbs:combat:arena:profiles', userId);
    context.userId = priorUserId;
    context.username = priorUsername;
  }
}

test('combat loot, skill gacha, and crit paths work without Math.random', async () => {
  await withPlayer('combat-rng-regression-player', async key => {
    const initial = await getCombatSnapshot();
    const state = initial.state;
    state.dungeonId = 'undercrypt';
    state.depth = 3; // Elite encounter guarantees a gear-drop path.
    state.bestDepth = 3;
    state.dungeonBestDepths.undercrypt = 3;
    state.enemyHp = 1; // Keep this regression deterministic and exercise gear generation.
    state.sequence = 0;
    state.lastAcceptedBeatAtMs = 0;
    await redis.set(key, JSON.stringify(state));

    const originalRandom = Math.random;
    Math.random = () => { throw new Error('Math.random must not be used by combat'); };
    try {
      const skill = await rollCombatSkill();
      assert.ok(skill.skillRoll.rank >= 1);
      const beat = await performCombatBeat(1, 'strike');
      assert.equal(beat.defeated, true);
      assert.ok(beat.item, 'defeating an elite should exercise secure gear generation');
    } finally {
      Math.random = originalRandom;
    }
  });
});

test('server rejects early beats without advancing sequence or overwriting state', async () => {
  await withPlayer('combat-cadence-regression-player', async key => {
    const initial = await getCombatSnapshot();
    const state = initial.state;
    state.lastAcceptedBeatAtMs = 0;
    state.sequence = 0;
    state.depth = 1;
    state.bestDepth = 1;
    state.dungeonBestDepths.undercrypt = 1;
    state.enemyHp = getEnemyForDungeonDepth('undercrypt', 1).maxHp;
    await redis.set(key, JSON.stringify(state));

    await performCombatBeat(1, 'strike');
    const before = JSON.parse((await redis.get(key))!) as { sequence: number; lastAcceptedBeatAtMs: number };
    before.lastAcceptedBeatAtMs = Date.now(); // Make the early-request boundary deterministic under slow CI.
    await redis.set(key, JSON.stringify(before));

    await assert.rejects(
      performCombatBeat(2, 'strike'),
      /COMBAT_BEAT_TOO_SOON:/,
    );
    const persisted = JSON.parse((await redis.get(key))!) as { sequence: number; lastAcceptedBeatAtMs: number };
    assert.equal(persisted.sequence, before.sequence);
    assert.equal(persisted.lastAcceptedBeatAtMs, before.lastAcceptedBeatAtMs);
  });
});

test('Guard remains active through a slow enemy wind-up and mitigates its next attack', async () => {
  await withPlayer('combat-guard-regression-player', async key => {
    const initial = await getCombatSnapshot();
    const state = initial.state;
    state.dungeonId = 'undercrypt';
    state.depth = 4; // Ironbound has 80 Speed and takes two beats to act.
    state.bestDepth = 4;
    state.dungeonBestDepths.undercrypt = 4;
    state.equipment.weapon = null;
    state.enemyHp = getEnemyForDungeonDepth('undercrypt', 4).maxHp;
    state.sequence = 0;
    state.combatBeats = 0;
    state.playerActionsResolved = 0;
    state.enemyActionsResolved = 0;
    state.guardBeats = 0;
    state.lastAcceptedBeatAtMs = 0;
    await redis.set(key, JSON.stringify(state));

    const first = await performCombatBeat(1, 'guard');
    assert.equal(first.actions.some(action => action.actor === 'enemy' && action.kind === 'attack'), false);
    assert.equal(first.state.guardBeats, 1, 'Guard must not expire when the enemy has no action ready');

    const saved = JSON.parse((await redis.get(key))!) as { lastAcceptedBeatAtMs: number; playerActionsResolved: number };
    saved.lastAcceptedBeatAtMs = Date.now() - COMBAT_BEAT_INTERVAL_MS - 1; // Advance the persisted cooldown clock past the full 30-second cadence.
    saved.playerActionsResolved = 6; // Isolate the enemy action in this beat.
    await redis.set(key, JSON.stringify({ ...first.state, ...saved }));

    const second = await performCombatBeat(2, 'strike');
    const incoming = second.actions.find(action => action.actor === 'enemy' && action.kind === 'attack');
    assert.ok(incoming, 'the slow enemy should attack on the second beat');
    assert.ok((incoming.damage ?? Number.POSITIVE_INFINITY) < getEnemyForDungeonDepth('undercrypt', 4).damage);
    assert.equal(second.state.guardBeats, 0, 'Guard is consumed after mitigating a real enemy attack');
  });
});

test('Arena Elo updates conserve points at all rating boundaries', () => {
  const samples = [
    [100, 100, true], [100, 100, false], [10_000, 10_000, true],
    [10_000, 10_000, false], [100, 10_000, true], [100, 10_000, false],
    [10_000, 100, true], [10_000, 100, false], [9999, 100, false],
    [101, 9999, true], [1000, 1000, true], [1000, 1000, false],
  ] as const;
  for (const [player, opponent, won] of samples) {
    const update = calculateCombatArenaRatingUpdate(player, opponent, won);
    assert.ok(update.playerRating >= 100 && update.playerRating <= 10_000);
    assert.ok(update.opponentRating >= 100 && update.opponentRating <= 10_000);
    assert.equal(update.playerRating + update.opponentRating, player + opponent);
    assert.equal(update.playerChange + update.opponentChange, 0);
  }
});
