import test from 'node:test';
import assert from 'node:assert/strict';
import { context, redis } from '../src/server/devvit-mock.js';
import { getCombatSnapshot, performCombatBeat } from '../src/server/combat.js';
import { createCombatState, getEnemyForDepth } from '../src/shared/combat.js';

/**
 * Give each server-level test its own persisted combat key and restore the mock
 * identity after the test so these tests cannot leak combat state into others.
 */
async function withCombatPlayer<T>(userId: string, run: (key: string) => Promise<T>): Promise<T> {
  const previousUserId = context.userId;
  const key = 'infinity-orbs:combat:' + userId;
  context.userId = userId;
  await redis.del(key);
  try {
    return await run(key);
  } finally {
    await redis.del(key);
    context.userId = previousUserId;
  }
}

test('combat beats persist their sequence and reject duplicate/stale requests', async () => {
  await withCombatPlayer('combat-sequence-regression-player', async () => {
    const before = await getCombatSnapshot();
    assert.equal(before.state.sequence, 0);

    // Two tabs can race with the same sequence. The Redis WATCH/MULTI/EXEC
    // compare-and-set must permit only one to commit the beat.
    const racingBeats = await Promise.allSettled([
      performCombatBeat(1, 'strike'),
      performCombatBeat(1, 'strike'),
    ]);
    assert.equal(racingBeats.filter(attempt => attempt.status === 'fulfilled').length, 1);
    assert.equal(racingBeats.filter(attempt => attempt.status === 'rejected').length, 1);
    const rejectedBeat = racingBeats.find(attempt => attempt.status === 'rejected');
    assert.ok(rejectedBeat && rejectedBeat.status === 'rejected');
    assert.match(
      String(rejectedBeat.reason instanceof Error ? rejectedBeat.reason.message : rejectedBeat.reason),
      /stale combat sequence/,
    );

    const persisted = await getCombatSnapshot();
    assert.equal(persisted.state.sequence, 1, 'only one racing request may commit sequence 1');

    await assert.rejects(
      () => performCombatBeat(1, 'strike'),
      /stale combat sequence/,
      'replaying an already accepted sequence must not resolve another beat',
    );

    const afterReplay = await getCombatSnapshot();
    assert.equal(afterReplay.state.sequence, 1, 'a rejected replay must not advance combat state');
  });
});

test('death resets the run while retaining permanent combat progress', async () => {
  await withCombatPlayer('combat-death-persistence-regression-player', async key => {
    const state = createCombatState();
    state.runId = 9;
    state.depth = 10;
    state.bestDepth = 10;
    state.health = 1;
    state.coins = 1_234;
    state.totalKills = 99;
    state.level = 7;
    state.xp = 42;
    state.sequence = 0;
    state.combatBeats = 0;
    // Force the death-reset path to run before a random high-rarity Orb can kill the boss.
    state.playerActionsResolved = 100;
    state.enemyActionsResolved = 0;
    state.playerSpeedCharge = 0;
    state.enemySpeedCharge = 1; // Arrange the enemy's attack now; this test targets persistence after death.
    state.skillLevels = { 'surefoot': 2 };
    state.enemyHp = getEnemyForDepth(10).maxHp;

    await redis.set(key, JSON.stringify(state));

    const result = await performCombatBeat(1, 'strike');

    assert.equal(result.died, true, 'the low-health Delver should be defeated by the boss beat');
    assert.equal(result.state.runId, 10, 'death should start a new run');
    assert.equal(result.state.depth, 1, 'the new run should begin at Depth 1');
    assert.equal(result.state.health, result.state.maxHealth, 'the new run should start at full health');
    assert.equal(result.state.bestDepth, 10, 'best depth is permanent');
    assert.equal(result.state.coins, 0, 'legacy Combat Coins are cleared after wallet consolidation');
    assert.equal(result.state.totalKills, 99, 'lifetime kills are permanent');
    assert.equal(result.state.level, 7, 'combat level is permanent');
    assert.equal(result.state.xp, 42, 'stored combat XP is retained when the run ends');
    assert.equal(result.state.skillLevels.surefoot, 2, 'skill ranks are permanent');
    assert.ok(result.state.inventory.some(item => item.id === 'starter-weapon'), 'collected gear must survive death');
    assert.equal(result.state.sequence, 1, 'the death-causing beat must still be committed');
    assert.equal(result.state.enemyHp, getEnemyForDepth(1).maxHp, 'the new run should load the Depth 1 enemy');
  });
});
