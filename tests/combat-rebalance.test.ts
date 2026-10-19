import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_MAX_DEPTH, combatGearQualityFromRoll, combatGearRarityForQuality, combatGearRarityOdds,
  combatGearStatBudgetMultiplier, combatNextBeatDelayMs, combatRuneMajorAbilityChance,
  combatRuneMajorAbilityMultiplier, combatScrapValue, combatStatsFor, createCombatState,
  getEnemyForDungeonDepth, type CombatRune,
} from '../src/shared/combat.js';

test('natural gear odds make high grades much rarer',()=>{
  const odds=combatGearRarityOdds();
  assert.ok(odds.Common>.85);
  assert.ok(odds.Mythic<.01);
  assert.ok(odds.Epic<.03);
  assert.equal(combatGearRarityForQuality(14.99),'Common');
  assert.equal(combatGearRarityForQuality(15),'Uncommon');
  assert.equal(combatGearRarityForQuality(40),'Rare');
  assert.equal(combatGearRarityForQuality(70),'Epic');
  assert.equal(combatGearRarityForQuality(90),'Mythic');
  assert.ok(combatGearQualityFromRoll(.99)<90);
  assert.equal(combatGearQualityFromRoll(1),100);
});

test('higher gear quality purchases a substantially larger stat budget',()=>{
  assert.ok(combatGearStatBudgetMultiplier(40)>combatGearStatBudgetMultiplier(15));
  assert.ok(combatGearStatBudgetMultiplier(90)>combatGearStatBudgetMultiplier(15)*5);
  assert.ok(combatGearStatBudgetMultiplier(100)>=5);
});

test('Scrap is easier to obtain and scales further with depth and power',()=>{
  const starter={power:10,quality:10,sourceFloor:0};
  const previousFormula=Math.round(4+starter.power*.6+starter.quality*.1);
  assert.ok(combatScrapValue(starter)>=previousFormula*3);
  assert.ok(combatScrapValue({power:100,quality:40,sourceFloor:100})>combatScrapValue(starter));
});

test('Rune Major Ability chance and strength rise with rarity',()=>{
  assert.ok(combatRuneMajorAbilityChance('Cosmic')>combatRuneMajorAbilityChance('Common'));
  assert.ok(combatRuneMajorAbilityMultiplier('Cosmic')>combatRuneMajorAbilityMultiplier('Mythic'));
  assert.ok(combatRuneMajorAbilityMultiplier('Mythic')>combatRuneMajorAbilityMultiplier('Common'));
});

test('Auto cadence derives its deadline from the accepted server beat timestamp',()=>{
  assert.equal(combatNextBeatDelayMs(1000,0),0);
  assert.equal(combatNextBeatDelayMs(20000,10000),20150);
  assert.equal(combatNextBeatDelayMs(40000,10000),150);
});

test('equipped Rune Major Abilities contribute to combat stats',()=>{
  const state=createCombatState();
  const rune:CombatRune={
    id:'rune-major-titan-test',name:'Test Titan Rune',rarity:'Mythic',stat:'luckPct',value:4,
    sourceDepth:0,sourceDungeon:'undercrypt',
    majorAbility:{id:'titan-heart',name:"Titan's Heart",trigger:'passive',maxHealthPercent:.65,description:'Increases maximum HP.'},
  };
  state.runes=[rune];state.equippedRunes=[rune.id];
  const baseline=combatStatsFor({...state,runes:[],equippedRunes:[]});
  const equipped=combatStatsFor(state);
  assert.ok(equipped.maxHealth>baseline.maxHealth);
});

test('late-game player stats and enemy progression reach large numbers without overflow',()=>{
  const state=createCombatState();state.level=60;state.depth=COMBAT_MAX_DEPTH;
  const stats=combatStatsFor(state);
  const enemy=getEnemyForDungeonDepth('undercrypt',COMBAT_MAX_DEPTH);
  assert.ok(stats.speed>=1_000_000);
  assert.ok(stats.maxHealth>=1_000_000);
  assert.ok(stats.damage*10>=1_000_000);
  assert.ok(enemy.maxHp>1_000_000&&enemy.maxHp<1e15);
  assert.ok(Number.isFinite(enemy.damage)&&Number.isFinite(enemy.speed));
  assert.ok(enemy.damage>100_000);
});
