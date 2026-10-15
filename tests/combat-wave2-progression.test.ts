import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_INVENTORY_CAP, COMBAT_SKILLS, COMBAT_UPGRADES, addCombatGearToInventory,
  combatStatsFor, combatUpgradeCost, createCombatState, floorQualityRequirement,
  gearQualityEffectiveness, resolveCombatSkillRarity, type CombatGear,
} from '../src/shared/combat.js';

function gear(id: string, sourceFloor: number, slot: 'weapon' | 'armor' = 'weapon', quality = 60): CombatGear {
  return { id, name:id, slot, quality, sourceFloor, power:(sourceFloor+1)*2, effect:'test gear',
    trait:slot==='weapon'?'keen':'bulwark', damageBonus:slot==='weapon'?20:0, speedBonus:0,
    maxHealthBonus:slot==='armor'?50:0 };
}
test('quality requirements are 0% at floor 0 and 60% at floor 50',()=>{
  assert.equal(floorQualityRequirement(0),0); assert.equal(floorQualityRequirement(25),30);
  assert.equal(floorQualityRequirement(50),60); assert.equal(floorQualityRequirement(100),100);
});
test('gear effectiveness follows the current floor target',()=>{
  assert.equal(gearQualityEffectiveness(gear('low',50,'weapon',30),50),.5);
  assert.equal(gearQualityEffectiveness(gear('expected',50,'weapon',60),50),1);
  assert.equal(gearQualityEffectiveness(gear('excellent',50,'weapon',80),50),1.25);
  assert.equal(gearQualityEffectiveness(gear('starter',0,'weapon',0),0),1);
});
test('inventory cap discards earliest-floor gear first, even when equipped',()=>{
  const state=createCombatState();
  state.inventory=Array.from({length:COMBAT_INVENTORY_CAP},(_,i)=>gear('old-'+i,i,i===1?'armor':'weapon',80));
  state.equipment={weapon:'old-0',armor:'old-1'};
  addCombatGearToInventory(state,gear('floor-50',50,'weapon',80));
  assert.equal(state.inventory.length,COMBAT_INVENTORY_CAP);
  assert.equal(state.inventory.some(item=>item.id==='old-0'),false);
  assert.equal(state.inventory.some(item=>item.id==='floor-50'),true);
  assert.ok(!state.equipment.weapon||state.inventory.some(item=>item.id===state.equipment.weapon));
  assert.ok(!state.equipment.armor||state.inventory.some(item=>item.id===state.equipment.armor));
});
test('combat upgrade prices increase by rank',()=>{
  const state=createCombatState(),upgrade=COMBAT_UPGRADES[0]!;
  const first=combatUpgradeCost(state,upgrade.id);
  state.combatUpgrades[upgrade.id]=1;
  assert.ok(combatUpgradeCost(state,upgrade.id)>first);
});
test('rolled orb raises combat stats and pity guarantees Epic/Mythic',()=>{
  const state=createCombatState(),baseline=combatStatsFor(state);
  state.orbFocusRarity=1_000_000;state.orbFocusName='Astral Orb';
  const attuned=combatStatsFor(state);
  assert.ok(attuned.damage>baseline.damage);assert.ok(attuned.maxHealth>baseline.maxHealth);
  assert.equal(resolveCombatSkillRarity(.1,9,0),'Epic');
  assert.equal(resolveCombatSkillRarity(.99,9,0),'Mythic');
  assert.equal(resolveCombatSkillRarity(.1,0,39),'Mythic');
  assert.equal(COMBAT_SKILLS.length,35);
});
