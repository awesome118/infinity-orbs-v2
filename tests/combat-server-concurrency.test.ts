import test from 'node:test';
import assert from 'node:assert/strict';

import { context, redis } from '../src/server/devvit-mock.js';
import { getCombatSnapshot, performCombatBeat, rollCombatSkill } from '../src/server/combat.js';
import { createCombatState } from '../src/shared/combat.js';

test('concurrent requests for the same combat sequence apply the beat only once', async () => {
  const originalUserId = context.userId;
  const userId = 'combat-cas-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const key = 'infinity-orbs:combat:' + userId;
  const initial = createCombatState();
  // Make the first beat deterministically defeat the first enemy, so a duplicate
  // application would be visible as a second kill or an extra depth transition.
  initial.enemyHp = 1;

  context.userId = userId;
  try {
    await redis.set(key, JSON.stringify(initial));

    const outcomes = await Promise.allSettled([
      performCombatBeat(initial.sequence + 1, 'strike'),
      performCombatBeat(initial.sequence + 1, 'strike'),
    ]);

    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one request should commit the sequence');
    assert.equal(rejected.length, 1, 'the competing request should be rejected as stale');

    const failure = rejected[0];
    if (!failure || failure.status !== 'rejected') {
      assert.fail('the competing combat beat must reject as stale');
    }
    assert.match(
      String(failure.reason instanceof Error ? failure.reason.message : failure.reason),
      /stale combat sequence/,
    );

    const persisted = await getCombatSnapshot();
    assert.equal(persisted.state.sequence, initial.sequence + 1);
    assert.equal(persisted.state.totalKills, 1, 'the same enemy must not award two kills');
    assert.equal(persisted.state.depth, 2, 'the same beat must not advance two depths');
  } finally {
    await redis.del(key);
    context.userId = originalUserId;
  }
});


test('a simultaneous skill pull and combat beat preserve both committed mutations', async () => {
  const originalUserId = context.userId;
  const userId = 'combat-cas-mixed-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const key = 'infinity-orbs:combat:' + userId;
  const initial = createCombatState();
  initial.enemyHp = 1;

  context.userId = userId;
  try {
    await redis.set(key, JSON.stringify(initial));

    const outcomes = await Promise.allSettled([
      performCombatBeat(initial.sequence + 1, 'strike'),
      rollCombatSkill(),
    ]);
    assert.equal(
      outcomes.filter(outcome => outcome.status === 'fulfilled').length,
      2,
      'both independent operations should finish after CAS retries',
    );

    const persisted = await getCombatSnapshot();
    assert.equal(persisted.state.sequence, initial.sequence + 1);
    assert.equal(persisted.state.totalKills, 1);
    assert.equal(persisted.state.depth, 2);
    assert.equal(persisted.state.skillRolls, 1);
    assert.equal(
      Object.values(persisted.state.skillLevels).reduce((total, rank) => total + Number(rank || 0), 0),
      1,
      'the committed pull must retain its granted skill rank',
    );
  } finally {
    await redis.del(key);
    context.userId = originalUserId;
  }
});
