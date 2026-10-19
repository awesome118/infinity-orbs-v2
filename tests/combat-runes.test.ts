import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRuneBonuses, combatRuneSalvageValue, combatRuneSlotsUnlocked, combatRuneValueFor, type CombatRune } from '../src/shared/combat.js';

const runes:CombatRune[]=[
  {id:'fate-1',name:'Radiant Fate Rune',rarity:'Rare',stat:'luckPct',value:1.4,sourceDepth:20,sourceDungeon:'undercrypt'},
  {id:'hoard-1',name:'Fractured Hoard Rune',rarity:'Common',stat:'coinGainPct',value:1.5,sourceDepth:1,sourceDungeon:'undercrypt'},
  {id:'prism-1',name:'Radiant Prism Rune',rarity:'Rare',stat:'shardChancePct',value:.08,sourceDepth:20,sourceDungeon:'undercrypt'},
  {id:'insight-1',name:'Runed Insight Rune',rarity:'Epic',stat:'xpGainPct',value:4.2,sourceDepth:30,sourceDungeon:'glass-labyrinth'},
];
test('Rune bonuses only count Runes in the equipped loadout',()=>{
  assert.deepEqual(combatRuneBonuses(runes,['fate-1','insight-1']),{luckPct:1.4,coinGainPct:0,shardChancePct:0,xpGainPct:4.2});
});
test('Rune slot milestones are earned through Delver levels and depth',()=>{
  assert.equal(combatRuneSlotsUnlocked(1,1),2);
  assert.equal(combatRuneSlotsUnlocked(10,1),3);
  assert.equal(combatRuneSlotsUnlocked(25,1),4);
  assert.equal(combatRuneSlotsUnlocked(25,50),5);
});
test('Rune value scales with rarity and depth while retaining stat precision',()=>{
  assert.ok(combatRuneValueFor('Cosmic','luckPct',50)>combatRuneValueFor('Common','luckPct',0));
  assert.ok(combatRuneValueFor('Epic','shardChancePct',30)>0);
});
test('Rune salvage rewards increase with rarity',()=>{
  assert.ok(combatRuneSalvageValue('Cosmic')>combatRuneSalvageValue('Mythic'));
  assert.ok(combatRuneSalvageValue('Mythic')>combatRuneSalvageValue('Common'));
});
