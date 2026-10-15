import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_SKILLS, combatStatsFor, createCombatState, getEnemyForDepth, skillPullCost } from '../src/shared/combat.js';

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
