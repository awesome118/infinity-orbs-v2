import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCombatSkillCopy, COMBAT_SKILLS, combatStatsFor, createCombatState, getEnemyForDepth, skillPullCost } from '../src/shared/combat.js';

test('starter combat build carries the Auto-Dungeons baseline', () => {
  const state=createCombatState();
  const stats=combatStatsFor(state);
  assert.equal(stats.damage,54);
  assert.equal(stats.speed,310);
  assert.equal(stats.maxHealth,1040);
  assert.equal(state.inventory.length,2);
});
test('every combat rarity has exactly five skills', () => {
  for(const rarity of ['Common','Uncommon','Rare','Epic','Mythic']) assert.equal(COMBAT_SKILLS.filter(skill=>skill.rarity===rarity).length,5);
  assert.equal(COMBAT_SKILLS.length,25);
});
test('equipped gear changes derived stats', () => {
  const state=createCombatState(), before=combatStatsFor(state);
  const weapon=state.inventory.find(item=>item.slot==='weapon');
  assert.ok(weapon);
  weapon.damageBonus+=10; weapon.speedBonus+=25;
  const after=combatStatsFor(state);
  assert.equal(after.damage,before.damage+10);
  assert.equal(after.speed,before.speed+25);
});
test('every tenth Undercrypt depth has a boss', () => {
  assert.equal(getEnemyForDepth(9).boss,false);
  assert.equal(getEnemyForDepth(10).boss,true);
  assert.equal(getEnemyForDepth(20).name,'Crypt Warden');
});
test('skill pull pricing does not decrease with repeated pulls', () => {
  let previous=skillPullCost(0);
  for(let pulls=1;pulls<60;pulls++){const current=skillPullCost(pulls);assert.ok(current>=previous);previous=current;}
});

test('duplicate skill copies increase rank and improve the associated stat', () => {
  const state = createCombatState();
  const speedValues: number[] = [];
  for (let expectedRank = 1; expectedRank <= 5; expectedRank += 1) {
    const result = applyCombatSkillCopy(state, 'surefoot', 75);
    assert.equal(result.rank, expectedRank);
    assert.equal(result.duplicate, expectedRank > 1);
    assert.equal(result.maxRank, expectedRank === 5);
    assert.equal(result.coinsRefunded, 0);
    speedValues.push(combatStatsFor(state).speed);
  }
  assert.deepEqual(speedValues, [318, 326, 334, 342, 350]);
  const capped = applyCombatSkillCopy(state, 'surefoot', 75);
  assert.equal(capped.rank, 5);
  assert.equal(capped.duplicate, true);
  assert.equal(capped.maxRank, true);
  assert.equal(state.skillLevels.surefoot, 5);
  assert.equal(combatStatsFor(state).speed, 350);
});

test('duplicate damage skill copies each increase derived damage', () => {
  const state = createCombatState();
  const damageValues: number[] = [];
  for (let expectedRank = 1; expectedRank <= 5; expectedRank += 1) {
    const result = applyCombatSkillCopy(state, 'ember-lung', 75);
    assert.equal(result.rank, expectedRank);
    damageValues.push(combatStatsFor(state).damage);
  }
  assert.deepEqual(damageValues, [55, 57, 58, 59, 61]);
});

test('extra copies at max rank refund coins without secretly increasing rank', () => {
  const state = createCombatState();
  state.skillLevels['infinite-bounty'] = 5;
  state.coins = 50;
  const result = applyCombatSkillCopy(state, 'infinite-bounty', 200);
  assert.equal(result.rank, 5);
  assert.equal(result.duplicate, true);
  assert.equal(result.maxRank, true);
  assert.equal(result.coinsRefunded, 150);
  assert.equal(state.coins, 200);
  assert.equal(state.skillLevels['infinite-bounty'], 5);
});
