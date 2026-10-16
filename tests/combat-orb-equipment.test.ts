import test from 'node:test';
import assert from 'node:assert/strict';
import { combatMajorAbilityChance, combatOrbDamageMultiplier, combatStatsFor, createCombatState } from '../src/shared/combat.js';

test('each orb rarity maps monotonically to a bounded base-damage multiplier', () => {
  assert.equal(combatOrbDamageMultiplier(0), 1);
  assert.equal(combatOrbDamageMultiplier(2), 1);
  assert.ok(combatOrbDamageMultiplier(10) > combatOrbDamageMultiplier(2));
  assert.ok(combatOrbDamageMultiplier(100) > combatOrbDamageMultiplier(10));
  assert.equal(combatOrbDamageMultiplier(200), 3);
  assert.equal(combatOrbDamageMultiplier(1e30), 20);
});

test('gear affixes from multiple equipment slots contribute to the combat build', () => {
  const state = createCombatState();
  const before = combatStatsFor(state);
  const ring = {
    id:'test-ring', name:'Quiet Ember Signet', slot:'ring' as const, quality:94, sourceFloor:0, power:40,
    effect:'Test ring affixes.', trait:'keen' as const, damageBonus:9, speedBonus:4, maxHealthBonus:0,
    armorBonus:0, critChanceBonus:.20,
  };
  const helmet = {
    id:'test-helmet', name:'Ashen Riftbound Visor', slot:'helmet' as const, quality:88, sourceFloor:0, power:35,
    effect:'Test helmet affixes.', trait:'bulwark' as const, damageBonus:0, speedBonus:0, maxHealthBonus:10,
    armorBonus:30, critChanceBonus:.03,
  };
  state.inventory.push(ring, helmet);
  state.equipment.ring = ring.id;
  state.equipment.helmet = helmet.id;
  const after = combatStatsFor(state);

  assert.ok(after.damage > before.damage);
  assert.ok(after.speed > before.speed);
  assert.equal(after.armor, before.armor + helmet.armorBonus);
  assert.ok(after.critChance > before.critChance);
  state.equipment.ring = null;
  assert.ok(combatStatsFor(state).critChance < after.critChance);
});

test('legacy weapon and armor starter equipment remains valid alongside the new slots', () => {
  const state = createCombatState();
  const weapon = state.inventory.find(item => item.id === state.equipment.weapon);
  const armor = state.inventory.find(item => item.id === state.equipment.armor);
  assert.equal(weapon?.slot, 'weapon');
  assert.equal(armor?.slot, 'armor');
  assert.equal(state.equipment.helmet, null);
  assert.equal(state.equipment.gloves, null);
  assert.equal(state.equipment.boots, null);
  assert.equal(state.equipment.ring, null);
  assert.equal(state.equipment.amulet, null);
});

test('major ability odds increase with item rarity but are never guaranteed', () => {
  const common = combatMajorAbilityChance(5);
  const uncommon = combatMajorAbilityChance(20);
  const rare = combatMajorAbilityChance(50);
  const epic = combatMajorAbilityChance(75);
  const mythic = combatMajorAbilityChance(100);
  assert.ok(common > 0);
  assert.ok(common < uncommon && uncommon < rare && rare < epic && epic < mythic);
  assert.ok(mythic < 1);
});
