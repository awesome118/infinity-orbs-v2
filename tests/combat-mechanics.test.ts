import test from 'node:test';
import assert from 'node:assert/strict';
import { addCombatGearToInventory, applyCombatSkillCopy, calculateCombatArenaRatingUpdate, chooseAutoCombatIntent, COMBAT_ABILITY_SLOTS, COMBAT_INVENTORY_CAP, COMBAT_MAX_DEPTH, COMBAT_SKILLS, combatAbilityType, combatBountyReward, combatEffectiveFlurryBonusAttacks, combatEnergyAfterRegen, combatFlurryAttackMultiplier, combatForgeCost, combatScrapValue, floorQualityRequirement, combatSkillCopiesForNextRank, combatSkillRankEffectiveness, combatStatsFor, coreProgressionCombatBonus, createCombatState, getEnemyForDepth, getEnemyForDungeonDepth, resolveCombatSkillRarity, skillGachaRankRequirement, skillPullCost, skillRarityUnlocked, undercryptOrbLuckMultiplier, undercryptWardensDefeated, type CombatGear } from '../src/shared/combat.js';

test('starter combat build carries the Auto-Dungeons baseline', () => {
  const state=createCombatState();
  const stats=combatStatsFor(state);
  assert.equal(stats.damage,54);
  assert.equal(stats.speed,310);
  assert.equal(stats.maxHealth,1040);
  assert.equal(state.inventory.length,2);
  assert.equal(state.arenaRating,1000);
  assert.equal(state.arenaWins,0);
  assert.equal(state.arenaLosses,0);
  assert.deepEqual(state.dungeonBestDepths, { undercrypt: 1, 'cinder-vault': 1, 'glass-labyrinth': 1 });
});
test('every combat rarity has seven active abilities', () => {
  for(const rarity of ['Common','Uncommon','Rare','Epic','Mythic']) assert.equal(COMBAT_SKILLS.filter(skill=>skill.rarity===rarity).length,7);
  assert.equal(COMBAT_SKILLS.length,35);
  assert.equal(COMBAT_ABILITY_SLOTS,3);
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
test('skill pull pricing rises and then respects its deliberate soft cap', () => {
  let previous=skillPullCost(0);
  for(let pulls=1;pulls<60;pulls++){const current=skillPullCost(pulls);assert.ok(current>=previous);previous=current;}
  assert.equal(skillPullCost(41),skillPullCost(40));
  assert.equal(skillPullCost(Number.MAX_SAFE_INTEGER),skillPullCost(40),'outsize pull counts clamp to the designed price ceiling');
});

test('quality curve stays anchored to run best after current depth resets',()=>{
  const state=createCombatState();
  state.depth=1;
  state.bestDepth=51;
  assert.equal(floorQualityRequirement(state.bestDepth-1),60);
  assert.equal(floorQualityRequirement(state.depth-1),0);
});

test('ability energy availability respects the post-regeneration maximum',()=>{
  assert.equal(combatEnergyAfterRegen(1,2),2);
  assert.equal(combatEnergyAfterRegen(2,2),2);
  assert.equal(combatEnergyAfterRegen(1,5),2);
  assert.equal(combatEnergyAfterRegen(8,5),5);
});

test('flurry and bounty outputs scale with ability value and rank',()=>{
  assert.equal(combatFlurryAttackMultiplier(8),1.08);
  assert.equal(combatFlurryAttackMultiplier(45),1.45);
  assert.equal(combatFlurryAttackMultiplier(-5),1);
  assert.equal(combatFlurryAttackMultiplier(500),2);
  assert.equal(combatEffectiveFlurryBonusAttacks(11,8),4,'eight base hits leave room for four bonus strikes');
  assert.equal(combatEffectiveFlurryBonusAttacks(2,3),2);
  assert.equal(combatEffectiveFlurryBonusAttacks(11,12),0,'a full 12-hit turn has no spare attack slots');
  const modest=combatBountyReward(.05,1),mythic=combatBountyReward(.25,1),ranked=combatBountyReward(.25,8);
  assert.ok(mythic.marks>modest.marks);
  assert.ok(ranked.marks>mythic.marks);
  assert.equal(mythic.coins,mythic.marks*10);
  assert.equal(COMBAT_MAX_DEPTH,50_000);
});

test('duplicate copies advance uncapped skill ranks with an increasing copy requirement', () => {
  const state = createCombatState();
  const baseStats = combatStatsFor(state);
  const first = applyCombatSkillCopy(state, 'surefoot', 75);
  assert.equal(first.rank, 1);
  assert.equal(first.rankedUp, true);
  assert.equal(first.progress, 0);
  assert.equal(state.skillLevels.surefoot, 1);
  const neededForRankTwo = combatSkillCopiesForNextRank(1);
  assert.equal(neededForRankTwo, 3);
  for(let copy=0;copy<neededForRankTwo-1;copy++){
    const result=applyCombatSkillCopy(state,'surefoot',75);
    assert.equal(result.rank,1);
    assert.equal(result.rankedUp,false);
  }
  const rankTwo=applyCombatSkillCopy(state,'surefoot',75);
  assert.equal(rankTwo.rank,2);
  assert.equal(rankTwo.rankedUp,true);
  assert.equal(combatSkillCopiesForNextRank(2),4);
  assert.ok(combatSkillCopiesForNextRank(20)>combatSkillCopiesForNextRank(10));
  assert.ok(combatSkillRankEffectiveness(20)>combatSkillRankEffectiveness(2));
  assert.deepEqual(combatStatsFor(state),baseStats,'owned but unequipped abilities must not passively stack stats');
});

test('skill copies are active ability types rather than passive stat modifiers',()=>{
  const definition=COMBAT_SKILLS.find(skill=>skill.id==='ember-lung')!;
  const healing=COMBAT_SKILLS.find(skill=>skill.id==='ironbark')!;
  const bounty=COMBAT_SKILLS.find(skill=>skill.id==='penny-hunter')!;
  assert.equal(combatAbilityType(definition),'strike');
  assert.equal(combatAbilityType(healing),'mend');
  assert.equal(combatAbilityType(bounty),'bounty');
});

test('ranked Gacha progressively unlocks each higher rarity and raises minimum investment',()=>{
  assert.equal(skillRarityUnlocked('Common',1),true);
  assert.equal(skillRarityUnlocked('Uncommon',1),false);
  assert.equal(skillRarityUnlocked('Uncommon',2),true);
  assert.equal(skillRarityUnlocked('Mythic',4),false);
  assert.equal(skillRarityUnlocked('Mythic',5),true);
  assert.equal(resolveCombatSkillRarity(.9,1,0,0),'Common');
  assert.equal(resolveCombatSkillRarity(.99,2,0,0),'Uncommon');
  assert.equal(resolveCombatSkillRarity(.99,3,0,0),'Rare');
  assert.equal(resolveCombatSkillRarity(.1,4,9,0),'Epic');
  assert.equal(resolveCombatSkillRarity(.1,5,0,39),'Mythic');
  assert.deepEqual(skillGachaRankRequirement(1),{rank:2,requiredPulls:3,requiredMarks:25,unlocks:'Uncommon'});
  assert.equal(skillGachaRankRequirement(5),null);
});

test('Scrap rewards and Forge costs scale with gear/floor progression',()=>{
  const low={power:5,quality:20,sourceFloor:0};
  const high={power:500,quality:90,sourceFloor:100};
  assert.ok(combatScrapValue(high)>combatScrapValue(low));
  assert.equal(combatForgeCost(0),10);
  assert.ok(combatForgeCost(50)>combatForgeCost(0));
});

test('run-haul overflow never evicts equipped gear acquired during the current run',()=>{
  const state=createCombatState();
  const item:CombatGear={id:'run-equipped-weapon',name:'Run-Worn Blade',slot:'weapon',quality:1,sourceFloor:0,power:1,effect:'test',trait:'keen',damageBonus:1,speedBonus:0,maxHealthBonus:0};
  addCombatGearToInventory(state,item);
  state.equipment.weapon=item.id;
  for(let index=1;index<COMBAT_INVENTORY_CAP;index++)addCombatGearToInventory(state,{...item,id:'run-gear-'+index,name:'Run gear '+index,sourceFloor:index,quality:80});
  addCombatGearToInventory(state,{...item,id:'new-run-best',name:'New run best',sourceFloor:100,quality:99});
  assert.equal(state.runInventoryIds.length,COMBAT_INVENTORY_CAP);
  assert.ok(state.inventory.some(gear=>gear.id===item.id));
  assert.equal(state.equipment.weapon,item.id);
});

test('the newest run pickup survives overflow even when its quality is lower than the old haul',()=>{
  const state=createCombatState();
  for(let index=0;index<COMBAT_INVENTORY_CAP;index++)addCombatGearToInventory(state,{id:'old-quality-'+index,name:'Old quality '+index,slot:index%2===0?'weapon':'armor',quality:90,sourceFloor:index+1,power:10,effect:'test',trait:index%2===0?'keen':'bulwark',damageBonus:0,speedBonus:0,maxHealthBonus:0});
  const newest:CombatGear={id:'fresh-low-quality',name:'Fresh low quality',slot:'weapon',quality:0,sourceFloor:0,power:1,effect:'test',trait:'keen',damageBonus:0,speedBonus:0,maxHealthBonus:0};
  addCombatGearToInventory(state,newest);
  assert.equal(state.runInventoryIds.length,COMBAT_INVENTORY_CAP);
  assert.ok(state.inventory.some(item=>item.id===newest.id));
  assert.ok(!state.inventory.some(item=>item.id==='old-quality-0'));
});

test('duplicate loot grants are idempotent and do not consume haul slots',()=>{
  const state=createCombatState();
  const original=state.inventory[0]!;
  const inventoryLength=state.inventory.length;
  addCombatGearToInventory(state,{...original,name:'duplicate copy'});
  assert.equal(state.inventory.length,inventoryLength);
  assert.equal(state.inventory[0]?.name,original.name);
  assert.equal(state.runInventoryIds.length,0);
});

test('run haul pruning preserves owned equipment and newest loot', () => {
  const state = createCombatState();
  const equippedWeaponId = state.equipment.weapon;
  const equippedArmorId = state.equipment.armor;
  for (let index = 0; index < 30; index += 1) {
    addCombatGearToInventory(state, {
      id: 'old-loot-' + index,
      name: 'Old loot ' + index,
      slot: index % 2 === 0 ? 'weapon' : 'armor',
      quality: 10,
      sourceFloor: 0,
      power: 10,
      effect: 'Test item',
      trait: index % 2 === 0 ? 'keen' : 'bulwark',
      damageBonus: index % 2 === 0 ? 8 : 0,
      speedBonus: index % 2 === 0 ? 3 : 0,
      maxHealthBonus: index % 2 === 0 ? 0 : 20,
    });
  }
  const newest = {
    id: 'newest-loot',
    name: 'Newest loot',
    slot: 'weapon' as const,
    quality: 99.5,
    sourceFloor: 0,
    power: 50,
    effect: 'Test item',
    trait: 'first-strike' as const,
    damageBonus: 40,
    speedBonus: 12,
    maxHealthBonus: 0,
  };

  addCombatGearToInventory(state, newest);

  assert.equal(state.runInventoryIds.length, 30, 'only the current run haul is capped');
  assert.equal(state.inventory.length, 32, 'the permanent stash also keeps the two starting items');
  assert.equal(state.inventory[0]?.id, newest.id);
  assert.ok(state.inventory.some(item => item.id === equippedWeaponId), 'equipped weapon must remain in inventory');
  assert.ok(state.inventory.some(item => item.id === equippedArmorId), 'equipped armor must remain in inventory');
  assert.ok(!state.inventory.some(item => item.id === 'old-loot-0'), 'oldest current-run pickup should be pruned first');
});


test('Crypt Warden clears grant a permanent effective Luck multiplier with a hard cap', () => {
  assert.equal(undercryptWardensDefeated(1), 0);
  assert.equal(undercryptWardensDefeated(10), 0, 'reaching the boss depth does not count as a clear');
  assert.equal(undercryptWardensDefeated(11), 1, 'clearing the Depth 10 boss unlocks one stack');
  assert.equal(undercryptWardensDefeated(101), 10);
  assert.equal(undercryptWardensDefeated(251), 25);
  assert.equal(undercryptWardensDefeated(50000), 25);
  assert.equal(undercryptOrbLuckMultiplier(1), 1);
  assert.equal(undercryptOrbLuckMultiplier(11), 1.01);
  assert.equal(undercryptOrbLuckMultiplier(251), 1.25);
  assert.equal(undercryptOrbLuckMultiplier(50000), 1.25);
  assert.equal(undercryptOrbLuckMultiplier(Number.NaN), 1);
});


test('Arena rating uses bounded Elo-style updates', () => {
  const win = calculateCombatArenaRatingUpdate(1000, 1000, true);
  assert.deepEqual(win, { playerRating: 1012, opponentRating: 988, playerChange: 12, opponentChange: -12 });
  const loss = calculateCombatArenaRatingUpdate(1000, 1000, false);
  assert.deepEqual(loss, { playerRating: 988, opponentRating: 1012, playerChange: -12, opponentChange: 12 });
  const bounded = calculateCombatArenaRatingUpdate(10000, 100, true);
  assert.equal(bounded.playerRating, 10000);
  assert.equal(bounded.opponentRating, 100);
});


test('core-game level and highest-orb rarity improve combat without changing baseline builds', () => {
  const state = createCombatState();
  const baseline = combatStatsFor(state);
  assert.equal(coreProgressionCombatBonus(1, 2), 0);
  assert.equal(baseline.coreProgressionBonus, 0);

  state.coreLevel = 51;
  state.coreHighestRarity = 1_000_000;
  const progressed = combatStatsFor(state);
  assert.equal(coreProgressionCombatBonus(51, 1_000_000), 0.118);
  assert.ok(progressed.damage > baseline.damage);
  assert.ok(progressed.maxHealth > baseline.maxHealth);
  assert.equal(coreProgressionCombatBonus(1_000_000, 1_000_000_000_000_000_000), 0.25);
});


test('auto combat tactics choose safe, valid intents from health and energy', () => {
  const state = createCombatState();
  state.energy = 4;
  state.health = state.maxHealth * 0.30;
  state.autoTactic = 'balanced';
  assert.equal(chooseAutoCombatIntent(state), 'mend');

  state.energy = 2;
  state.health = state.maxHealth * 0.15;
  assert.equal(chooseAutoCombatIntent(state), 'guard');

  state.autoTactic = 'aggressive';
  state.health = state.maxHealth;
  state.energy = 3;
  assert.equal(chooseAutoCombatIntent(state), 'heavy');
  state.energy = 2;
  assert.equal(chooseAutoCombatIntent(state), 'strike');

  state.autoTactic = 'defensive';
  state.health = state.maxHealth * 0.60;
  state.energy = 4;
  assert.equal(chooseAutoCombatIntent(state), 'mend');
  state.energy = 2;
  state.health = state.maxHealth * 0.40;
  assert.equal(chooseAutoCombatIntent(state), 'guard');

  state.autoTactic = 'recovery';
  state.health = state.maxHealth * 0.80;
  state.energy = 4;
  assert.equal(chooseAutoCombatIntent(state), 'mend');
});


test('dungeon choices have separate enemy modifiers and distinct combat builds', () => {
  const undercrypt = getEnemyForDungeonDepth('undercrypt', 10);
  const cinder = getEnemyForDungeonDepth('cinder-vault', 10);
  const glass = getEnemyForDungeonDepth('glass-labyrinth', 10);
  assert.equal(cinder.name, 'Cinder Sovereign');
  assert.equal(glass.name, 'Prism Regent');
  assert.ok(cinder.maxHp > undercrypt.maxHp);
  assert.ok(cinder.damage > undercrypt.damage);
  assert.ok(glass.maxHp < undercrypt.maxHp);
  assert.ok(glass.speed > undercrypt.speed);

  const baseline = createCombatState();
  const cinderBuild = { ...baseline, dungeonId: 'cinder-vault' as const };
  const glassBuild = { ...baseline, dungeonId: 'glass-labyrinth' as const };
  assert.ok(combatStatsFor(cinderBuild).damage > combatStatsFor(baseline).damage);
  assert.ok(combatStatsFor(glassBuild).speed > combatStatsFor(baseline).speed);
  assert.ok(combatStatsFor(glassBuild).critChance > combatStatsFor(baseline).critChance);
});
