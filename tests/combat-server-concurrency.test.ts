import test from 'node:test';
import assert from 'node:assert/strict';

import { context, redis } from '../src/server/devvit-mock.js';
import { getCombatSnapshot, performCombatBeat, rollCombatSkill } from '../src/server/combat.js';
import { createCombatState } from '../src/shared/combat.js';

test('a simultaneous skill pull and combat beat preserve both committed mutations', async () => {
  const originalUserId = context.userId;
  const userId = 'combat-cas-mixed-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const key = 'infinity-orbs:combat:' + userId;
  const initial = createCombatState();
  // Guarantee that a successful beat visibly advances the run regardless of
  // which mutation wins the first WATCH/MULTI/EXEC race.
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
    assert.equal(persisted.state.sequence, initial.sequence + 1, 'the beat should be persisted once');
    assert.equal(persisted.state.totalKills, 1);
    assert.equal(persisted.state.depth, 2);
    assert.equal(persisted.state.skillRolls, 1);
    assert.equal(
      Object.values(persisted.state.skillLevels).reduce((total, rank) => total + Number(rank || 0), 0),
      1,
      'the committed pull must retain exactly one skill rank',
    );
  } finally {
    await redis.del(key);
    context.userId = originalUserId;
  }
});
