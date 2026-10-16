import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_BEAT_INTERVAL_MS, combatForgeQualityCost, combatMajorAbilityChance, combatOrbDamageMultiplier, combatSkillRarityOdds, combatStatsFor, createCombatState, resolveCombatSkillRarity } from '../src/shared/combat.js';
import { luckRarityFactor } from '../src/shared/game.js';

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
  assert.equal(after.speed, before.speed, 'ordinary speed affixes must not increase turn speed');
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


test('Luck makes average orb rarity improve continuously with diminishing returns', () => {
  assert.equal(luckRarityFactor(1), 1);
  assert.ok(luckRarityFactor(10) > luckRarityFactor(1));
  assert.ok(luckRarityFactor(1_000_000) > luckRarityFactor(10));
  assert.ok(luckRarityFactor(1e100) <= 25);
  assert.equal(luckRarityFactor(1e100), 25);
});

test('combat cadence is 30 seconds and Forge quality has an exponential cost', () => {
  assert.equal(COMBAT_BEAT_INTERVAL_MS, 30_000);
  const low = combatForgeQualityCost(0, 20);
  const medium = combatForgeQualityCost(0, 50);
  const high = combatForgeQualityCost(0, 80);
  const nearPerfect = combatForgeQualityCost(0, 99);
  assert.ok(low < medium && medium < high && high < nearPerfect);
  assert.equal(combatForgeQualityCost(0, 100), 5_000_000);
  assert.equal(combatForgeQualityCost(0, 120), 5_000_000);
});

test('Gacha ranks increase non-Common odds and Rank 30 splits the non-Mythic odds evenly', () => {
  const rank1 = combatSkillRarityOdds(1);
  const rank10 = combatSkillRarityOdds(10);
  const rank30 = combatSkillRarityOdds(30);
  assert.equal(rank1.Common, 1);
  assert.equal(rank1.Mythic, 0);
  assert.ok(rank10.Mythic > rank1.Mythic);
  assert.equal(rank30.Mythic, 0.005);
  for (const rarity of ['Common', 'Uncommon', 'Rare', 'Epic'] as const) {
    assert.ok(Math.abs(rank30[rarity] - 0.24875) < 1e-12, rarity + ' should have 24.875% base odds');
  }
  assert.ok(Math.abs(Object.values(rank30).reduce((sum, chance) => sum + chance, 0) - 1) < 1e-12);
  assert.equal(resolveCombatSkillRarity(0.1, 30, 0, 0), 'Common');
  assert.equal(resolveCombatSkillRarity(0.3, 30, 0, 0), 'Uncommon');
  assert.equal(resolveCombatSkillRarity(0.5, 30, 0, 0), 'Rare');
  assert.equal(resolveCombatSkillRarity(0.75, 30, 0, 0), 'Epic');
  assert.equal(resolveCombatSkillRarity(0.999, 30, 0, 0), 'Mythic');
});

test('turn speed is provided by an equipped Chrono Surge Major Ability', () => {
  const state = createCombatState();
  const before = combatStatsFor(state).speed;
  const charm = {
    id: 'test-chrono-surge',
    name: 'Hourglass of the Last Star',
    slot: 'amulet' as const,
    quality: 100,
    sourceFloor: 0,
    power: 80,
    effect: 'Major Ability: faster turns.',
    trait: 'bulwark' as const,
    damageBonus: 0,
    speedBonus: 0,
    maxHealthBonus: 0,
    armorBonus: 0,
    critChanceBonus: 0,
    majorAbility: {
      id: 'chrono-surge' as const,
      name: 'Chrono Surge',
      trigger: 'passive' as const,
      speedPercent: 0.2,
      description: 'Increases turn speed.',
    },
  };
  state.inventory.push(charm);
  state.equipment.amulet = charm.id;
  assert.equal(combatStatsFor(state).speed, Math.round(before * 1.2));
});
