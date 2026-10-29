import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMBAT_BEAT_INTERVAL_MS,
  combatBeatIntervalMsFor,
  combatNextBeatDelayMs,
  createCombatState,
} from '../src/shared/combat.js';

test('Chrono Surge shortens the global combat beat timer', () => {
  const state = createCombatState();
  assert.equal(combatBeatIntervalMsFor(state), COMBAT_BEAT_INTERVAL_MS);

  const id = 'chrono-surge-test';
  state.inventory.push({
    id,
    name: 'Chrono Surge Test Gear',
    slot: 'weapon',
    quality: 100,
    sourceFloor: 0,
    power: 100,
    effect: 'test fixture',
    trait: 'keen',
    damageBonus: 0,
    speedBonus: 0,
    maxHealthBonus: 0,
    armorBonus: 0,
    critChanceBonus: 0,
    majorAbility: {
      id: 'chrono-surge',
      name: 'Chrono Surge',
      trigger: 'passive',
      speedPercent: 0.35,
      description: 'Speeds up combat beats.',
    },
  });
  state.equipment.weapon = id;

  const intervalMs = Math.round(COMBAT_BEAT_INTERVAL_MS / 1.35);
  assert.equal(combatBeatIntervalMsFor(state), intervalMs);
  assert.ok(intervalMs < COMBAT_BEAT_INTERVAL_MS);

  // The client scheduler receives the same derived interval as the server.
  assert.equal(
    combatNextBeatDelayMs(20_000, 10_000, 0, intervalMs),
    Math.max(0, 10_000 + intervalMs - 20_000),
  );
});
