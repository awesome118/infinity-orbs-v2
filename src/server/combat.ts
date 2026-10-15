import { context, redis } from './devvit-mock.js';
import { loadRaw } from './game.js';
import type { CombatAction, CombatArenaProfile, CombatArenaResult, CombatCommand, CombatDungeonId, CombatEnemy, CombatGear, CombatIntent, CombatSkillId, CombatSnapshot, CombatState, CombatTactic, CombatTrait, CombatRarity } from '../shared/combat.js';
import { calculateCombatArenaRatingUpdate, chooseAutoCombatIntent, COMBAT_ABILITY_SLOTS, COMBAT_INVENTORY_CAP, COMBAT_SKILLS, DEFAULT_COMBAT_AUTO_SCRAP_SETTINGS, SKILL_GACHA_RANK_MAX, SKILL_RANK_CAP, COMBAT_UPGRADES, addCombatGearToInventory, applyCombatSkillCopy, combatAbilityType, combatForgeCost, combatMarkMultiplier, combatScrapValue, combatSkillCooldown, combatSkillEnergyCost, combatSkillCopiesForNextRank, combatStatsFor, combatUpgradeCost, combatUpgradeRank, createCombatState, gearQualityEffectiveness, getEnemyForDungeonDepth, normalizeCombatAutoScrapSettings, resetCombatRunGear, resolveCombatSkillRarity, skillGachaRankRequirement, skillPullCost, skillRarityUnlocked, synchronizeCombatStats } from '../shared/combat.js';

const MAX_CAS_ATTEMPTS=8, INVENTORY_CAP=COMBAT_INVENTORY_CAP;
function combatKey():string { const id=String(context.userId??'').trim(); if(!id) throw new Error('REDDIT_LOGIN_REQUIRED'); return 'infinity-orbs:combat:'+id; }
/** Use the platform cryptographic RNG; never fall back to predictable secureRandom(). */
function secureRandom():number {
  const cryptoApi=globalThis.crypto;
  if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')throw new Error('Secure combat randomness is unavailable.');
  const words=new Uint32Array(2);
  cryptoApi.getRandomValues(words);
  // Uniform 53-bit fraction in [0, 1), built from cryptographically random bits.
  return (words[0]!*0x20_0000+(words[1]!>>>11))/0x20_0000_0000_0000;
}
function pick<T>(values:T[]):T { return values[Math.floor(secureRandom()*values.length)]!; }
function finiteInt(value:unknown,fallback:number,min:number,max:number):number { const n=Number(value); return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback; }
function traitText(t:CombatTrait):string {
  if(t==='bleed')return '18% chance to add bonus bleed damage.';
  if(t==='keen')return '+4 percentage points of critical chance.';
  if(t==='first-strike')return 'First attack against each foe deals 50% extra damage.';
  if(t==='bulwark')return 'Reduces incoming damage by 4%.';
  if(t==='regeneration')return 'Recover 2% max HP after elite or boss kills.';
  return 'Gain +20 Speed while below 40% health.';
}
function normalizeGear(value:unknown,fallbackFloor=0):CombatGear|null {
  if(!value||typeof value!=='object')return null;
  const x=value as Record<string,unknown>, slot=x.slot==='weapon'?'weapon':x.slot==='armor'?'armor':null;
  const traits:CombatTrait[]=['bleed','keen','first-strike','bulwark','regeneration','desperation'];
  if(!slot||typeof x.id!=='string'||!x.id||typeof x.name!=='string')return null;
  const trait=traits.includes(x.trait as CombatTrait)?x.trait as CombatTrait:(slot==='weapon'?'keen':'bulwark');
  return {id:x.id.slice(0,160),name:x.name.slice(0,100),slot,quality:Math.max(0,Math.min(100,Number.isFinite(Number(x.quality))?Number(x.quality):0)),sourceFloor:finiteInt(x.sourceFloor,fallbackFloor,0,50000),power:finiteInt(x.power,1,1,1_000_000),effect:typeof x.effect==='string'?x.effect.slice(0,180):traitText(trait),trait,damageBonus:finiteInt(x.damageBonus,0,0,1_000_000),speedBonus:finiteInt(x.speedBonus,0,0,400),maxHealthBonus:finiteInt(x.maxHealthBonus,0,0,1_000_000)};
}
function normalizeState(raw:string|null|undefined):CombatState {
  if(!raw)return createCombatState();
  let p:Partial<CombatState>;
  try { p=JSON.parse(raw) as Partial<CombatState>; if(!p||typeof p!=='object'||Array.isArray(p))return createCombatState(); } catch { return createCombatState(); }
  const storedGachaRank=p.skillGachaRank;
  const savedSkillLevels=(p.skillLevels&&typeof p.skillLevels==='object'?p.skillLevels:{}) as Partial<Record<CombatSkillId,number>>;
  const legacyUnlockedRank=Math.max(1,...COMBAT_SKILLS.filter(skill=>Number(savedSkillLevels[skill.id])>0).map(skill=>({Common:1,Uncommon:2,Rare:3,Epic:4,Mythic:5}[skill.rarity])));
  const s=Object.assign(createCombatState(),p);
  s.version=1;
  s.dungeonId=(['undercrypt','cinder-vault','glass-labyrinth'] as unknown[]).includes(s.dungeonId)?s.dungeonId:'undercrypt';
  s.runId=finiteInt(s.runId,1,1,Number.MAX_SAFE_INTEGER);s.depth=finiteInt(s.depth,1,1,50000);
  s.bestDepth=Math.max(s.depth,finiteInt(s.bestDepth,1,1,50000));
  const savedDungeonBests=(s.dungeonBestDepths&&typeof s.dungeonBestDepths==='object'?s.dungeonBestDepths:{}) as Partial<Record<CombatDungeonId,number>>;
  s.dungeonBestDepths={
    undercrypt:finiteInt(savedDungeonBests.undercrypt,s.dungeonId==='undercrypt'?s.bestDepth:1,1,50000),
    'cinder-vault':finiteInt(savedDungeonBests['cinder-vault'],s.dungeonId==='cinder-vault'?s.bestDepth:1,1,50000),
    'glass-labyrinth':finiteInt(savedDungeonBests['glass-labyrinth'],s.dungeonId==='glass-labyrinth'?s.bestDepth:1,1,50000),
  };
  s.dungeonBestDepths[s.dungeonId]=Math.max(s.dungeonBestDepths[s.dungeonId],s.bestDepth);
  s.bestDepth=Math.max(s.depth,s.dungeonBestDepths[s.dungeonId]);
  s.level=finiteInt(s.level,1,1,60);s.xp=finiteInt(s.xp,0,0,Number.MAX_SAFE_INTEGER);
  s.xpToNext=finiteInt(s.xpToNext,100,1,1_000_000_000);s.coins=finiteInt(s.coins,250,0,Number.MAX_SAFE_INTEGER);s.totalKills=finiteInt(s.totalKills,0,0,Number.MAX_SAFE_INTEGER);
  s.arenaRating=finiteInt(s.arenaRating,1000,100,10000);s.arenaWins=finiteInt(s.arenaWins,0,0,Number.MAX_SAFE_INTEGER);s.arenaLosses=finiteInt(s.arenaLosses,0,0,Number.MAX_SAFE_INTEGER);s.arenaLastChallengeAt=finiteInt(s.arenaLastChallengeAt,0,0,Number.MAX_SAFE_INTEGER);
  s.coreLevel=finiteInt(s.coreLevel,1,1,1_000_000);s.coreHighestRarity=finiteInt(s.coreHighestRarity,2,2,1_000_000_000_000_000_000);
  s.autoTactic=(['balanced','aggressive','defensive','recovery'] as unknown[]).includes(s.autoTactic)?s.autoTactic:'balanced';
  s.scrap=finiteInt(s.scrap,0,0,Number.MAX_SAFE_INTEGER);s.autoScrapUnlocked=s.autoScrapUnlocked===true;s.autoScrapSettings=normalizeCombatAutoScrapSettings(s.autoScrapSettings);s.skillRolls=finiteInt(s.skillRolls,0,0,Number.MAX_SAFE_INTEGER);s.skillGachaRank=finiteInt(storedGachaRank,legacyUnlockedRank,1,SKILL_GACHA_RANK_MAX);s.skillPityEpic=finiteInt(s.skillPityEpic,0,0,9);s.skillPityMythic=finiteInt(s.skillPityMythic,0,0,39);s.combatMarks=finiteInt(s.combatMarks,0,0,Number.MAX_SAFE_INTEGER);s.orbFocusRarity=finiteInt(s.orbFocusRarity,2,2,1_000_000_000_000_000_000);s.orbFocusName=typeof s.orbFocusName==='string'?s.orbFocusName.slice(0,100):'Common Orb';s.combatUpgrades=Object.fromEntries(COMBAT_UPGRADES.map(upgrade=>[upgrade.id,finiteInt(s.combatUpgrades?.[upgrade.id],0,0,upgrade.maxRank)])) as CombatState['combatUpgrades'];s.sequence=finiteInt(s.sequence,0,0,Number.MAX_SAFE_INTEGER);s.lastAcceptedBeatAtMs=finiteInt(s.lastAcceptedBeatAtMs,0,0,Number.MAX_SAFE_INTEGER);s.combatBeats=finiteInt(s.combatBeats,0,0,Number.MAX_SAFE_INTEGER);
  s.playerActionsResolved=finiteInt(s.playerActionsResolved,0,0,Number.MAX_SAFE_INTEGER);s.enemyActionsResolved=finiteInt(s.enemyActionsResolved,0,0,Number.MAX_SAFE_INTEGER);
  s.energy=finiteInt(s.energy,3,0,10);s.maxEnergy=finiteInt(s.maxEnergy,5,1,10);s.guardBeats=finiteInt(s.guardBeats,0,0,10);s.encounterFirstStrikeUsed=s.encounterFirstStrikeUsed===true;
  const defaults=createCombatState();
  const persisted=p as Partial<CombatState>&{
    inventoryByDungeon?:Partial<Record<CombatDungeonId,unknown>>;
    equipmentByDungeon?:Partial<Record<CombatDungeonId,{weapon?:unknown;armor?:unknown}>>;
  };
  const rawRunInventory=Array.isArray(p.inventory)?p.inventory:
    Array.isArray(persisted.inventoryByDungeon?.[s.dungeonId])?persisted.inventoryByDungeon[s.dungeonId] as unknown[]:defaults.inventory;
  s.inventory=rawRunInventory.map(g=>normalizeGear(g,Math.max(0,s.depth-1))).filter((g):g is CombatGear=>Boolean(g));
  while(s.inventory.length>INVENTORY_CAP){
    let removable=0;
    for(let index=1;index<s.inventory.length;index++){
      const candidate=s.inventory[index]!,oldest=s.inventory[removable]!;
      const cf=Math.max(0,Math.floor(Number(candidate.sourceFloor)||0)),of=Math.max(0,Math.floor(Number(oldest.sourceFloor)||0));
      if(cf<of||(cf===of&&candidate.quality<oldest.quality)||(cf===of&&candidate.quality===oldest.quality&&index>removable))removable=index;
    }
    s.inventory.splice(removable,1);
  }
  const savedEquipment=(p.equipment&&typeof p.equipment==='object'&&!Array.isArray(p.equipment)?p.equipment:persisted.equipmentByDungeon?.[s.dungeonId]) as {weapon?:unknown;armor?:unknown}|undefined;
  s.equipment={
    weapon:typeof savedEquipment?.weapon==='string'?savedEquipment.weapon:defaults.equipment.weapon,
    armor:typeof savedEquipment?.armor==='string'?savedEquipment.armor:defaults.equipment.armor,
  };
  for(const slot of ['weapon','armor'] as const){
    const equipped=s.inventory.find(g=>g.id===s.equipment[slot]&&g.slot===slot);
    s.equipment[slot]=equipped?.id??s.inventory.find(g=>g.slot===slot)?.id??null;
  }
  // Drop legacy dungeon-keyed storage after extracting only the previously active run's bag.
  const legacyInventoryMaps=s as CombatState&{inventoryByDungeon?:unknown;equipmentByDungeon?:unknown};
  delete legacyInventoryMaps.inventoryByDungeon;
  delete legacyInventoryMaps.equipmentByDungeon;
  const levels:Partial<Record<CombatSkillId,number>>={}, copyProgress:Partial<Record<CombatSkillId,number>>={}, cooldowns:Partial<Record<CombatSkillId,number>>={};
  for(const skill of COMBAT_SKILLS){
    const rank=finiteInt(s.skillLevels?.[skill.id],0,0,Number.MAX_SAFE_INTEGER);
    if(rank){levels[skill.id]=rank;copyProgress[skill.id]=finiteInt(s.skillCopyProgress?.[skill.id],0,0,Math.max(0,combatSkillCopiesForNextRank(rank)-1));}
    cooldowns[skill.id]=finiteInt(s.abilityCooldowns?.[skill.id],0,0,Number.MAX_SAFE_INTEGER);
  }
  s.skillLevels=levels;s.skillCopyProgress=copyProgress;s.abilityCooldowns=cooldowns;
  const ownedSkillIds=COMBAT_SKILLS.filter(skill=>(levels[skill.id]??0)>0).map(skill=>skill.id);
  const requestedEquipped=Array.isArray(p.equippedAbilities)?p.equippedAbilities.filter((id):id is CombatSkillId=>typeof id==='string'&&COMBAT_SKILLS.some(skill=>skill.id===id)&&ownedSkillIds.includes(id)):ownedSkillIds.slice(0,COMBAT_ABILITY_SLOTS);
  s.equippedAbilities=[...new Set(requestedEquipped)].slice(0,COMBAT_ABILITY_SLOTS);
  synchronizeCombatStats(s);
  const enemy=getEnemyForDungeonDepth(s.dungeonId,s.depth);s.enemyHp=finiteInt(s.enemyHp,enemy.maxHp,1,enemy.maxHp);
  return s;
}
function createGear(sourceFloor:number,requestedSlot?:'weapon'|'armor'):CombatGear {
  const floor=Math.max(0,Math.min(50000,Math.floor(Number(sourceFloor)||0)));
  const scale=floor+1;
  const slot=requestedSlot??(secureRandom()<.5?'weapon':'armor');
  // Fourth-power quality distribution is from Auto-Dungeons; 100% rolls are extremely rare.
  const quality=Math.round(1_000_000*Math.pow(secureRandom(),4))/10_000;
  const prefix=slot==='weapon'?['Ashen','Hollow','Cinder','Riftbound','Starforged','Warden’s','Lost','Quiet','Infinity-Touched']:['Delver’s','Warden’s','Old','Cinder','Riftweave','Ironbound','Boneguard','Hollow','Starweave'];
  const nouns=slot==='weapon'?['Cleaver','Brand','Knife','Axe','Fang','Edge','Spear','Greatblade']:['Hood','Plate','Scale','Mantle','Coat','Shell','Vest','Mail'];
  const weaponTraits:CombatTrait[]=['bleed','keen','first-strike'], armorTraits:CombatTrait[]=['bulwark','regeneration','desperation'];
  const trait=slot==='weapon'?pick(weaponTraits):pick(armorTraits);
  const power=Math.max(3,Math.round(Math.min(1_000_000,scale)*(.65+quality/80)));
  return {id:'gear-'+Date.now().toString(36)+'-'+Math.floor(secureRandom()*0x7fffffff).toString(36),name:pick(prefix)+' '+pick(nouns),slot,quality,sourceFloor:floor,power,trait,effect:traitText(trait),damageBonus:slot==='weapon'?Math.max(1,Math.round(power*.8)):0,speedBonus:slot==='weapon'?Math.min(400,Math.round(power*.25)):0,maxHealthBonus:slot==='armor'?Math.max(5,Math.round(power*4)):0};
}
function enemySnapshot(s:CombatState):CombatEnemy { const e=getEnemyForDungeonDepth(s.dungeonId,s.depth); return {...e,hp:Math.max(0,Math.min(e.maxHp,s.enemyHp||e.maxHp))}; }
function snapshot(s:CombatState):CombatSnapshot { return {state:s,enemy:enemySnapshot(s),stats:synchronizeCombatStats(s)}; }
async function mutate<T>(fn:(s:CombatState)=>T):Promise<T> {
  const key=combatKey();
  for(let i=0;i<MAX_CAS_ATTEMPTS;i++){
    const txn=await redis.watch(key);let closed=false;
    try { const s=normalizeState(await redis.get(key)),result=fn(s);await txn.multi();await txn.set(key,JSON.stringify(s));const commit=await txn.exec();closed=true;if(commit!==null)return result; }
    finally { if(!closed)await txn.unwatch().catch(()=>undefined); }
  }
  throw new Error('Combat state changed repeatedly. Please retry.');
}
export async function getCombatSnapshot():Promise<CombatSnapshot>{
  let coreProgression:{level?:unknown;highestRarity?:unknown;autoScrapLevel?:unknown;autoScrapSettings?:unknown}|null=null;
  try {
    const core=await loadRaw();
    coreProgression={level:core.level,highestRarity:core.highestRarity,autoScrapLevel:core.prestigeUpgrades?.autoScrap,autoScrapSettings:core.combatAutoScrap};
  } catch(error) {
    // Core-game progress is a bonus, not a prerequisite for loading combat.
    console.error('[Combat] Could not refresh core-game attunement; retaining saved values.',error);
  }
  const state=await mutate(s=>{
    if(coreProgression){
      s.coreLevel=finiteInt(coreProgression.level,s.coreLevel,1,1_000_000);
      s.coreHighestRarity=finiteInt(coreProgression.highestRarity,s.coreHighestRarity,2,1_000_000_000_000_000_000);
      s.autoScrapUnlocked=Number(coreProgression.autoScrapLevel)>0;
      s.autoScrapSettings=normalizeCombatAutoScrapSettings(coreProgression.autoScrapSettings);
      if(!s.autoScrapUnlocked)s.autoScrapSettings.enabled=false;
    }
    synchronizeCombatStats(s);
    return s;
  });
  const userId=String(context.userId??'').trim();
  if(userId){
    const profile=createArenaProfile(userId,arenaName(context.username),state,Date.now());
    await redis.hSet(ARENA_PROFILE_KEY,{[userId]:JSON.stringify(profile)}).catch((error: unknown)=>console.error('[Combat Arena] Profile registration failed.',error));
  }
  return snapshot(state);
}
function grantXp(s:CombatState,amount:number,actions:CombatAction[]):void {
  s.xp+=amount;
  while(s.xp>=s.xpToNext&&s.level<60){s.xp-=s.xpToNext;s.level+=1;s.xpToNext=Math.round(s.xpToNext*1.19);synchronizeCombatStats(s);s.health=Math.min(s.maxHealth,s.health+Math.round(s.maxHealth*.08));actions.push({actor:'player',kind:'level',text:'Delver reached Level '+s.level+'.'});}
}
export async function performCombatBeat(sequence:number,intent:CombatCommand,skillIdValue?:unknown):Promise<CombatSnapshot&{actions:CombatAction[];defeated:boolean;died:boolean;item?:CombatGear;abilityCast?:{id:CombatSkillId;rank:number;cooldown:number}}> {
  return mutate(s=>{
    if(sequence!==s.sequence+1)throw new Error('stale combat sequence');
    const activeSkillId=typeof skillIdValue==='string'&&COMBAT_SKILLS.some(skill=>skill.id===skillIdValue)?skillIdValue as CombatSkillId:null;
    const activeSkill=intent==='ability'&&activeSkillId?COMBAT_SKILLS.find(skill=>skill.id===activeSkillId):null;
    if(intent==='ability'&&!activeSkill)throw new Error('Choose a valid equipped ability.');
    if(activeSkill){
      if(!s.equippedAbilities.includes(activeSkill.id)||(s.skillLevels[activeSkill.id]??0)<1)throw new Error('Ability is not equipped.');
      if((s.abilityCooldowns[activeSkill.id]??0)>s.sequence)throw new Error('Ability is on cooldown.');
      if(s.energy+1< combatSkillEnergyCost(activeSkill.rarity))throw new Error('Not enough energy for this ability.');
    }
    const activeSkillRank=activeSkill?Math.max(1,Number(s.skillLevels[activeSkill.id])||1):0;
    const now=Date.now();
    const elapsed=s.lastAcceptedBeatAtMs>0?Math.max(0,now-s.lastAcceptedBeatAtMs):Number.POSITIVE_INFINITY;
    if(elapsed<1000)throw new Error('COMBAT_BEAT_TOO_SOON:'+Math.max(1,1000-elapsed));
    s.lastAcceptedBeatAtMs=now;
    const actions:CombatAction[]=[];synchronizeCombatStats(s);s.sequence+=1;s.combatBeats+=1;s.energy=Math.min(s.maxEnergy,s.energy+1);
    let enemy=getEnemyForDungeonDepth(s.dungeonId,s.depth);const stats=combatStatsFor(s);
    const resolvedIntent:CombatIntent=intent==='auto'?chooseAutoCombatIntent(s):intent==='ability'?'strike':intent;
    const playerActions=Math.min(12,Math.max(0,Math.floor(s.combatBeats*stats.speed/100)-s.playerActionsResolved));
    const enemyActions=Math.min(3,Math.max(0,Math.floor(s.combatBeats*enemy.speed/100)-s.enemyActionsResolved));
    if(activeSkill&&playerActions<1)throw new Error('No player action is ready for this ability.');
    s.playerActionsResolved+=playerActions;s.enemyActionsResolved+=enemyActions;
    let enemyHp=Math.max(1,s.enemyHp||enemy.maxHp),heavy=false,consumed=false,defeated=false,died=false;
    let item:CombatGear|undefined;
    let activeDamageMultiplier=1,activeGuaranteedCrit=false,activeExtraAttacks=0;
    let abilityCast:{id:CombatSkillId;rank:number;cooldown:number}|undefined;
    if(activeSkill){
      const energyCost=combatSkillEnergyCost(activeSkill.rarity);
      s.energy=Math.max(0,s.energy-energyCost);
      const cooldown=combatSkillCooldown(activeSkill.rarity,activeSkillRank);
      s.abilityCooldowns[activeSkill.id]=s.sequence+cooldown;
      abilityCast={id:activeSkill.id,rank:activeSkillRank,cooldown};
      const archetype=combatAbilityType(activeSkill),rankScale=Math.log2(activeSkillRank+1);
      if(archetype==='strike'){
        activeDamageMultiplier=1.2+activeSkill.value*2+rankScale*.15;
        actions.push({actor:'player',kind:'ability',text:activeSkill.name+' empowers the next strike ('+Math.round((activeDamageMultiplier-1)*100)+'% bonus damage).'});
      } else if(archetype==='flurry'){
        activeExtraAttacks=1+Math.floor(rankScale);
        actions.push({actor:'player',kind:'ability',text:activeSkill.name+' releases a '+(activeExtraAttacks+1)+'-hit flurry.'});
      } else if(archetype==='mend'){
        const healRatio=Math.min(.9,.10+activeSkill.value+rankScale*.06),before=s.health;
        s.health=Math.min(s.maxHealth,s.health+Math.max(1,Math.round(s.maxHealth*healRatio)));
        actions.push({actor:'player',kind:'ability',text:activeSkill.name+' restores '+(s.health-before)+' HP.'});
      } else if(archetype==='focus'){
        activeGuaranteedCrit=true;activeDamageMultiplier=1.65+activeSkill.value*2+rankScale*.15;
        actions.push({actor:'player',kind:'ability',text:activeSkill.name+' guarantees a critical strike.'});
      } else {
        const marks=Math.max(1,Math.round((3+rankScale*2)*(1+activeSkill.value*3)));
        const coins=Math.max(1,marks*10);
        s.combatMarks=Math.min(Number.MAX_SAFE_INTEGER,s.combatMarks+marks);
        s.coins=Math.min(Number.MAX_SAFE_INTEGER,s.coins+coins);
        actions.push({actor:'player',kind:'ability',text:activeSkill.name+' grants '+marks+' Combat Marks and '+coins+' Delver Coins.'});
      }
    }
    if(resolvedIntent==='heavy'&&s.energy>=3&&playerActions>0){s.energy-=3;heavy=true;actions.push({actor:'player',kind:'ability',text:'Heavy strike prepared.'});}
    else if(resolvedIntent==='guard'&&s.energy>=2&&playerActions>0){s.energy-=2;s.guardBeats=1;consumed=true;actions.push({actor:'player',kind:'ability',text:'Guard raised. Incoming hits are softened.'});}
    else if(resolvedIntent==='mend'&&s.energy>=4&&playerActions>0&&s.health<s.maxHealth){s.energy-=4;const before=s.health;s.health=Math.min(s.maxHealth,s.health+Math.max(1,Math.round(s.maxHealth*.14)));consumed=true;actions.push({actor:'player',kind:'ability',text:'Mend restored '+(s.health-before)+' HP.'});}
    else if(resolvedIntent!=='strike')actions.push({actor:'player',kind:'ability',text:'Not enough energy or no action ready. Basic attacks continue.'});
    const attacks=Math.min(12,Math.max(0,playerActions-(consumed?1:0))+activeExtraAttacks),weapon=s.inventory.find(g=>g.id===s.equipment.weapon);
    for(let i=0;i<attacks;i++){
      if(enemyHp<=0)break;
      let multiplier=(heavy&&i===0?1.9:1)*(activeSkill&&i===0?activeDamageMultiplier:1);
      if(!s.encounterFirstStrikeUsed){if(weapon?.trait==='first-strike')multiplier*=1+.5*gearQualityEffectiveness(weapon,Math.max(0,s.depth-1));s.encounterFirstStrikeUsed=true;}
      const crit=(activeSkill&&i===0&&activeGuaranteedCrit)||secureRandom()<stats.critChance;let damage=Math.max(1,Math.round(stats.damage*(crit?1.75:1)*multiplier));
      if(weapon?.trait==='bleed'&&secureRandom()<.18*gearQualityEffectiveness(weapon,Math.max(0,s.depth-1))){const bleed=Math.max(1,Math.round(stats.damage*.3*gearQualityEffectiveness(weapon,Math.max(0,s.depth-1))));damage+=bleed;actions.push({actor:'player',kind:'ability',text:'Bleed adds '+bleed+' damage.'});}
      enemyHp-=damage;actions.push({actor:'player',kind:'attack',damage,text:(crit?'Critical hit for ':'Strike for ')+damage+' damage.'});
      if(enemyHp<=0){
        defeated=true;actions.push({actor:'player',kind:'death',text:'The '+enemy.name+' falls.'});s.totalKills=Math.min(Number.MAX_SAFE_INTEGER,s.totalKills+1);
        const coins=Math.max(1,Math.round((12+s.depth*2.4)*stats.coinMultiplier*(s.dungeonId==='cinder-vault'?1.4:1)));s.coins=Math.min(Number.MAX_SAFE_INTEGER,s.coins+coins);actions.push({actor:'player',kind:'loot',text:'Collected '+coins.toLocaleString()+' Delver Coins.'});
        const baseMarks=Math.max(1,2+Math.floor(Math.max(0,s.depth-1)/2)+(enemy.kind==='elite'?2:enemy.boss?8:0));
        const marks=Math.max(1,Math.round(baseMarks*combatMarkMultiplier(s)));s.combatMarks=Math.min(Number.MAX_SAFE_INTEGER,s.combatMarks+marks);actions.push({actor:'player',kind:'loot',text:'Earned '+marks.toLocaleString()+' Combat Marks.'});
        grantXp(s,Math.round((18+s.depth*4.2)*(s.dungeonId==='glass-labyrinth'?1.25:1)),actions);
        if((s.dungeonId==='cinder-vault'?s.depth%2===0:s.depth%3===0)||enemy.kind!=='common'||enemy.boss){
          item=createGear(Math.max(0,s.depth-1));
          if(s.autoScrapUnlocked&&s.autoScrapSettings.enabled&&item.quality<=s.autoScrapSettings.maxQuality){
            const gained=combatScrapValue(item);s.scrap=Math.min(Number.MAX_SAFE_INTEGER,s.scrap+gained);
            actions.push({actor:'player',kind:'loot',text:'Auto-scrapped '+item.name+' ('+item.quality.toFixed(2)+'% quality) for '+gained+' Scrap.'});
          } else {addCombatGearToInventory(s,item);actions.push({actor:'player',kind:'loot',text:'Gear found: '+item.name+' ('+item.quality.toFixed(2)+'% quality).'});}
        }
        const armor=s.inventory.find(g=>g.id===s.equipment.armor);
        if(armor?.trait==='regeneration'&&enemy.kind!=='common'){s.health=Math.min(s.maxHealth,s.health+Math.round(s.maxHealth*.02*gearQualityEffectiveness(armor,Math.max(0,s.depth-1))));actions.push({actor:'player',kind:'ability',text:'Armor regeneration restored 2% max HP.'});}
        s.bestDepth=Math.max(s.bestDepth,s.depth);s.depth+=1;s.bestDepth=Math.max(s.bestDepth,s.depth);s.dungeonBestDepths[s.dungeonId]=Math.max(s.dungeonBestDepths[s.dungeonId],s.bestDepth);s.combatBeats=0;s.playerActionsResolved=0;s.enemyActionsResolved=0;s.energy=Math.min(s.maxEnergy,s.energy+1);s.guardBeats=0;s.encounterFirstStrikeUsed=false;
        enemy=getEnemyForDungeonDepth(s.dungeonId,s.depth);s.enemyHp=enemy.maxHp;actions.push({actor:'player',kind:'advance',text:'Descending to Depth '+s.depth+'.'});break;
      }
    }
    let guardWasUsed=false;
    if(!defeated)for(let i=0;i<enemyActions;i++){
      let incoming=enemy.damage,strike='The '+enemy.name+' hits for ';
      if(enemy.boss&&s.combatBeats%4===0){incoming=Math.round(incoming*1.75);strike='The '+enemy.name+' cleaves for ';}
      else if(enemy.id.endsWith('ember-acolyte')&&s.combatBeats%3===0){incoming+=Math.round(s.maxHealth*.035);strike='The Ember Acolyte burns for ';}
      if(s.guardBeats>0){incoming=Math.round(incoming*.45);guardWasUsed=true;}
      incoming=Math.max(1,Math.round(incoming*(1-stats.damageReduction)));s.health=Math.max(0,s.health-incoming);
      actions.push({actor:'enemy',kind:'attack',damage:incoming,text:strike+incoming+' damage.'});
      if(s.health<=0){died=true;actions.push({actor:'enemy',kind:'death',text:'Run '+s.runId+' ended at Depth '+s.depth+'. Permanent progress retained.'});s.runId+=1;s.depth=1;resetCombatRunGear(s);s.combatBeats=0;s.playerActionsResolved=0;s.enemyActionsResolved=0;s.energy=Math.min(s.maxEnergy,3);s.guardBeats=0;s.encounterFirstStrikeUsed=false;s.enemyHp=getEnemyForDungeonDepth(s.dungeonId,1).maxHp;synchronizeCombatStats(s);s.health=s.maxHealth;actions.push({actor:'player',kind:'advance',text:'A new descent begins automatically at Depth 1.'});break;}
    }
    if(guardWasUsed)s.guardBeats=0;
    synchronizeCombatStats(s);
    return {...snapshot(s),actions,defeated,died,...(item?{item}:{}),...(abilityCast?{abilityCast}:{})};
  });
}
export async function equipCombatItem(itemId:string):Promise<CombatSnapshot>{return mutate(s=>{const item=s.inventory.find(g=>g.id===itemId);if(!item)throw new Error('item not owned');s.equipment[item.slot]=item.id;synchronizeCombatStats(s);return snapshot(s);});}

export async function scrapCombatItem(itemIdValue:unknown):Promise<CombatSnapshot&{scrapResult:{itemName:string;gained:number;total:number}}>{
  if(typeof itemIdValue!=='string'||!itemIdValue.trim()||itemIdValue.length>160)throw new Error('A valid gear item is required.');
  return mutate(state=>{
    const item=state.inventory.find(gear=>gear.id===itemIdValue);
    if(!item)throw new Error('Gear item is not in this dungeon bag.');
    if(state.equipment.weapon===item.id||state.equipment.armor===item.id)throw new Error('Unequip this item before scrapping it.');
    state.inventory=state.inventory.filter(gear=>gear.id!==item.id);
    const gained=combatScrapValue(item);state.scrap=Math.min(Number.MAX_SAFE_INTEGER,state.scrap+gained);
    return {...snapshot(state),scrapResult:{itemName:item.name,gained,total:state.scrap}};
  });
}

export async function forgeCombatGear(slotValue:unknown):Promise<CombatSnapshot&{forgeResult:{item:CombatGear;cost:number;remainingScrap:number}}>{
  if(slotValue!=='weapon'&&slotValue!=='armor')throw new Error('Choose weapon or armor for the Forge.');
  return mutate(state=>{
    const floor=Math.max(0,state.depth-1),cost=combatForgeCost(floor);
    if(state.scrap<cost)throw new Error('Not enough Scrap to forge this item.');
    state.scrap-=cost;
    const item=createGear(floor,slotValue);
    addCombatGearToInventory(state,item);
    return {...snapshot(state),forgeResult:{item,cost,remainingScrap:state.scrap}};
  });
}
export async function rollCombatSkill():Promise<CombatSnapshot&{skillRoll:{id:CombatSkillId;name:string;rarity:CombatRarity;rank:number;duplicate:boolean;convertedCoins:number;pityEpic:number;pityMythic:number;progress:number;copiesNeeded:number;rankedUp:boolean};cost:number}> {
  return mutate(s=>{
    const cost=skillPullCost(s.skillRolls);if(s.coins<cost)throw new Error('Not enough Delver Coins.');
    s.coins-=cost;s.skillRolls+=1;
    const rarity=resolveCombatSkillRarity(secureRandom(),s.skillGachaRank,s.skillPityEpic,s.skillPityMythic);
    s.skillPityEpic=(s.skillGachaRank>=4&&(rarity==='Epic'||rarity==='Mythic'))?0:s.skillGachaRank>=4?Math.min(9,s.skillPityEpic+1):0;
    s.skillPityMythic=(s.skillGachaRank>=5&&rarity==='Mythic')?0:s.skillGachaRank>=5?Math.min(39,s.skillPityMythic+1):0;
    const pool=COMBAT_SKILLS.filter(skill=>skill.rarity===rarity&&skillRarityUnlocked(skill.rarity,s.skillGachaRank)),skill=pick(pool);if(!skill)throw new Error('Skill pool is unavailable.');
    const applied=applyCombatSkillCopy(s,skill.id,cost);
    return {...snapshot(s),skillRoll:{id:skill.id,name:skill.name,rarity,rank:applied.rank,duplicate:applied.duplicate,convertedCoins:applied.coinsRefunded,pityEpic:s.skillPityEpic,pityMythic:s.skillPityMythic,progress:applied.progress,copiesNeeded:applied.copiesNeeded,rankedUp:applied.rankedUp},cost};
  });
}

export async function equipCombatSkill(skillIdValue:unknown,equipValue:unknown):Promise<CombatSnapshot>{
  const skillId=typeof skillIdValue==='string'&&COMBAT_SKILLS.some(skill=>skill.id===skillIdValue)?skillIdValue as CombatSkillId:null;
  if(!skillId)throw new Error('Invalid combat ability.');
  const shouldEquip=equipValue===true;
  return mutate(s=>{
    if((s.skillLevels[skillId]??0)<1)throw new Error('Ability not owned.');
    const isEquipped=s.equippedAbilities.includes(skillId);
    if(shouldEquip&&!isEquipped){
      if(s.equippedAbilities.length>=COMBAT_ABILITY_SLOTS)throw new Error('All active ability slots are full.');
      s.equippedAbilities=[...s.equippedAbilities,skillId];
    } else if(!shouldEquip&&isEquipped){s.equippedAbilities=s.equippedAbilities.filter(id=>id!==skillId);}
    return snapshot(s);
  });
}

export async function rankUpCombatSkillGacha():Promise<CombatSnapshot&{gachaRankUp:{rank:number;unlocks:CombatRarity;spentMarks:number}}>{
  return mutate(s=>{
    const requirement=skillGachaRankRequirement(s.skillGachaRank);
    if(!requirement)throw new Error('Skill Gacha is already max rank.');
    if(s.skillRolls<requirement.requiredPulls)throw new Error('Need '+requirement.requiredPulls+' total skill pulls before ranking up.');
    if(s.combatMarks<requirement.requiredMarks)throw new Error('Not enough Combat Marks to rank up the Skill Gacha.');
    s.combatMarks-=requirement.requiredMarks;s.skillGachaRank=requirement.rank;
    if(s.skillGachaRank<4)s.skillPityEpic=0;
    if(s.skillGachaRank<5)s.skillPityMythic=0;
    return {...snapshot(s),gachaRankUp:{rank:s.skillGachaRank,unlocks:requirement.unlocks,spentMarks:requirement.requiredMarks}};
  });
}


const ARENA_PROFILE_KEY = 'infinity-orbs:combat:arena:profiles';
const ARENA_PROFILE_TTL_MS = 24 * 60 * 60_000;
const ARENA_CHALLENGE_COOLDOWN_MS = 90_000;

function combatKeyFor(userId: string): string {
  const id = String(userId ?? '').trim();
  if (!id) throw new Error('REDDIT_LOGIN_REQUIRED');
  return 'infinity-orbs:combat:' + id;
}
function arenaName(value: unknown): string {
  return String(value ?? 'Delver').trim().replace(/^u\//i, '').slice(0, 40) || 'Delver';
}
function arenaBuild(rawState: CombatState): { state: CombatState; stats: ReturnType<typeof combatStatsFor> } {
  const state: CombatState = {
    ...rawState,
    dungeonId: 'undercrypt',
    inventory: rawState.inventory.map(item => ({ ...item })),
    equipment: { ...rawState.equipment },
    skillLevels: { ...rawState.skillLevels },
  };
  synchronizeCombatStats(state);
  state.health = state.maxHealth;
  const stats = combatStatsFor(state);
  return { state, stats };
}
function createArenaProfile(userId: string, username: string, state: CombatState, updatedAt: number): CombatArenaProfile {
  const build = arenaBuild(state);
  const weapon = build.state.inventory.find(item => item.id === build.state.equipment.weapon && item.slot === 'weapon');
  const armor = build.state.inventory.find(item => item.id === build.state.equipment.armor && item.slot === 'armor');
  return {
    userId,
    username: arenaName(username),
    level: state.level,
    bestDepth: state.bestDepth,
    rating: state.arenaRating,
    wins: state.arenaWins,
    losses: state.arenaLosses,
    updatedAt,
    damage: build.stats.damage,
    speed: build.stats.speed,
    maxHealth: build.stats.maxHealth,
    critChance: build.stats.critChance,
    weaponName: weapon?.name ?? 'Unarmed',
    armorName: armor?.name ?? 'No armor',
    skillRanks: Object.values(state.skillLevels).reduce((sum, rank) => sum + Math.max(0, Number(rank) || 0), 0),
  };
}
function parseArenaProfile(userId: string, raw: unknown): CombatArenaProfile | null {
  if (typeof raw !== 'string') return null;
  try {
    const p = JSON.parse(raw) as Partial<CombatArenaProfile>;
    if (!p || p.userId !== userId || typeof p.username !== 'string') return null;
    const updatedAt = Number(p.updatedAt), rating = Number(p.rating);
    if (!Number.isFinite(updatedAt) || !Number.isFinite(rating)) return null;
    return {
      userId,
      username: arenaName(p.username),
      level: finiteInt(p.level, 1, 1, 60),
      bestDepth: finiteInt(p.bestDepth, 1, 1, 50000),
      rating: finiteInt(rating, 1000, 100, 10000),
      wins: finiteInt(p.wins, 0, 0, Number.MAX_SAFE_INTEGER),
      losses: finiteInt(p.losses, 0, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: finiteInt(updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      damage: finiteInt(p.damage, 1, 1, 1_000_000_000),
      speed: finiteInt(p.speed, 1, 1, 800),
      maxHealth: finiteInt(p.maxHealth, 1, 1, 1_000_000_000),
      critChance: Math.max(0, Math.min(.75, Number(p.critChance) || 0)),
      weaponName: String(p.weaponName ?? 'Unarmed').slice(0, 100),
      armorName: String(p.armorName ?? 'No armor').slice(0, 100),
      skillRanks: finiteInt(p.skillRanks, 0, 0, 125),
    };
  } catch {
    return null;
  }
}
function resolveArenaDuel(challengerState: CombatState, opponentState: CombatState): {
  winner: 'challenger' | 'opponent'; rounds: number; log: string[];
} {
  const challenger = arenaBuild(challengerState);
  const opponent = arenaBuild(opponentState);
  let challengerHp = challenger.stats.maxHealth;
  let opponentHp = opponent.stats.maxHealth;
  let challengerFirst = true;
  let opponentFirst = true;
  const log: string[] = [];
  const append = (message: string) => { log.push(message); if (log.length > 10) log.shift(); };

  const attack = (side: 'challenger' | 'opponent') => {
    const isChallenger = side === 'challenger';
    const attacker = isChallenger ? challenger : opponent;
    const defender = isChallenger ? opponent : challenger;
    const weapon = attacker.state.inventory.find(item => item.id === attacker.state.equipment.weapon);
    let multiplier = 1;
    const isFirst = isChallenger ? challengerFirst : opponentFirst;
    if (isFirst && weapon?.trait === 'first-strike') multiplier *= 1.5;
    if (isChallenger) challengerFirst = false; else opponentFirst = false;
    const critical = secureRandom() < attacker.stats.critChance;
    let damage = Math.max(1, Math.round(attacker.stats.damage * multiplier * (critical ? 1.75 : 1)));
    if (weapon?.trait === 'bleed' && secureRandom() < .18) damage += Math.max(1, Math.round(attacker.stats.damage * .3));
    damage = Math.max(1, Math.round(damage * (1 - defender.stats.damageReduction)));
    if (isChallenger) opponentHp = Math.max(0, opponentHp - damage);
    else challengerHp = Math.max(0, challengerHp - damage);
    const who = isChallenger ? 'You' : 'Opponent';
    append(`${who} ${critical ? 'critically hit' : 'hit'} for ${damage.toLocaleString()} damage.`);
  };

  let rounds = 0;
  for (rounds = 1; rounds <= 100; rounds += 1) {
    const first = challenger.stats.speed >= opponent.stats.speed ? 'challenger' : 'opponent';
    const second = first === 'challenger' ? 'opponent' : 'challenger';
    for (const side of [first, second] as const) {
      const isChallenger = side === 'challenger';
      const actor = isChallenger ? challenger : opponent;
      const actorHp = () => isChallenger ? challengerHp : opponentHp;
      const foeHp = () => isChallenger ? opponentHp : challengerHp;
      const ownArmor = actor.state.inventory.find(item => item.id === actor.state.equipment.armor);
      const speed = Math.min(800, actor.stats.speed + (ownArmor?.trait === 'desperation' && actorHp() <= actor.stats.maxHealth * .4 ? 20 : 0));
      const actionCount = Math.min(8, Math.max(1, Math.floor(speed / 100)));
      for (let action = 0; action < actionCount && foeHp() > 0; action += 1) attack(side);
      if (challengerHp <= 0 || opponentHp <= 0) break;
    }
    if (challengerHp <= 0 || opponentHp <= 0) break;
  }
  // Extremely defensive equal builds still resolve deterministically after the
  // round cap; remaining health ratio is the tie-breaker.
  const challengerHealthRatio=challengerHp/challenger.stats.maxHealth;
  const opponentHealthRatio=opponentHp/opponent.stats.maxHealth;
  const winner=challengerHealthRatio===opponentHealthRatio
    ? (secureRandom()<0.5?'challenger':'opponent')
    : challengerHealthRatio>opponentHealthRatio?'challenger':'opponent';
  append(winner === 'challenger' ? 'Victory. Arena rating updated.' : 'Defeat. Arena rating updated.');
  return { winner, rounds: Math.min(rounds, 100), log };
}

/** Register the current server-owned build and return recently active opponents. */
export async function getCombatArenaOpponents(): Promise<{
  self: CombatArenaProfile;
  opponents: CombatArenaProfile[];
  cooldownRemainingMs: number;
}> {
  const userId = String(context.userId ?? '').trim();
  if (!userId) throw new Error('REDDIT_LOGIN_REQUIRED');
  // Persist the starter state too, so new players can be challenged after they
  // have opened Combat, even if they haven't killed the first enemy yet.
  const state = await mutate(s => s);
  const now = Date.now();
  const rawProfiles = await redis.hGetAll(ARENA_PROFILE_KEY);
  const self = createArenaProfile(userId, arenaName(context.username), state, now);
  await redis.hSet(ARENA_PROFILE_KEY, { [userId]: JSON.stringify(self) });
  const opponents: CombatArenaProfile[] = [];
  const staleProfileIds: string[] = [];
  for (const [id, raw] of Object.entries(rawProfiles ?? {})) {
    const profile = parseArenaProfile(id, raw);
    if (!profile || profile.updatedAt < now - ARENA_PROFILE_TTL_MS) {
      if (id !== userId) staleProfileIds.push(id);
      continue;
    }
    if (profile.userId !== userId) opponents.push(profile);
  }
  // Keep the profile hash bounded over time. Delete a small batch per request
  // rather than turning one Arena open into thousands of serial Redis writes.
  await Promise.all(staleProfileIds.slice(0, 100).map(id =>
    redis.hDel(ARENA_PROFILE_KEY, id).catch((error: unknown) => {
      console.error('[Combat Arena] Could not prune stale profile.', error);
      return 0;
    }),
  ));
  opponents.sort((a, b) => b.rating - a.rating || b.bestDepth - a.bestDepth);
  opponents.splice(20);
  return {
    self,
    opponents,
    cooldownRemainingMs: Math.max(0, ARENA_CHALLENGE_COOLDOWN_MS - (now - state.arenaLastChallengeAt)),
  };
}

/** Challenge a recently active player's saved build. Both rating changes commit atomically. */
export async function challengeCombatArena(opponentIdValue: string): Promise<CombatSnapshot & { arenaResult: CombatArenaResult }> {
  const userId = String(context.userId ?? '').trim();
  const opponentId = String(opponentIdValue ?? '').trim();
  if (!userId) throw new Error('REDDIT_LOGIN_REQUIRED');
  if (!opponentId) throw new Error('ARENA_OPPONENT_UNAVAILABLE');
  if (userId === opponentId) throw new Error('ARENA_SELF_CHALLENGE');

  const rawProfiles = await redis.hGetAll(ARENA_PROFILE_KEY);
  const opponentProfile = parseArenaProfile(opponentId, rawProfiles?.[opponentId]);
  if (!opponentProfile || opponentProfile.updatedAt < Date.now() - ARENA_PROFILE_TTL_MS) {
    throw new Error('ARENA_OPPONENT_UNAVAILABLE');
  }
  const ownKey = combatKeyFor(userId);
  const opponentKey = combatKeyFor(opponentId);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const txn = await redis.watch(ownKey, opponentKey);
    let closed = false;
    try {
      const [ownRaw, opponentRaw] = await Promise.all([redis.get(ownKey), redis.get(opponentKey)]);
      if (!opponentRaw) {
        await txn.unwatch(); closed = true;
        throw new Error('ARENA_OPPONENT_UNAVAILABLE');
      }
      const ownState = normalizeState(ownRaw);
      const opponentState = normalizeState(opponentRaw);
      const now = Date.now();
      const remaining = ARENA_CHALLENGE_COOLDOWN_MS - (now - ownState.arenaLastChallengeAt);
      if (remaining > 0) {
        await txn.unwatch(); closed = true;
        throw new Error('ARENA_COOLDOWN:' + remaining);
      }

      const duel = resolveArenaDuel(ownState, opponentState);
      const ratingUpdate = calculateCombatArenaRatingUpdate(
        ownState.arenaRating,
        opponentState.arenaRating,
        duel.winner === 'challenger',
      );
      const ownAfter = ratingUpdate.playerRating;
      const opponentAfter = ratingUpdate.opponentRating;
      const ownChange = ratingUpdate.playerChange;
      const opponentChange = ratingUpdate.opponentChange;

      ownState.arenaRating = ownAfter;
      opponentState.arenaRating = opponentAfter;
      if (duel.winner === 'challenger') {
        ownState.arenaWins += 1;
        opponentState.arenaLosses += 1;
      } else {
        ownState.arenaLosses += 1;
        opponentState.arenaWins += 1;
      }
      ownState.arenaLastChallengeAt = now;

      await txn.multi();
      await txn.set(ownKey, JSON.stringify(ownState));
      await txn.set(opponentKey, JSON.stringify(opponentState));
      const committed = await txn.exec();
      closed = true;
      if (committed === null) continue;

      const ownProfile = createArenaProfile(userId, arenaName(context.username), ownState, now);
      const nextOpponentProfile = createArenaProfile(
        opponentId, opponentProfile.username, opponentState, opponentProfile.updatedAt,
      );
      await redis.hSet(ARENA_PROFILE_KEY, {
        [userId]: JSON.stringify(ownProfile),
        [opponentId]: JSON.stringify(nextOpponentProfile),
      }).catch((error: unknown) => console.error('[Combat Arena] Profile refresh failed after result commit.', error));

      const arenaResult: CombatArenaResult = {
        opponent: nextOpponentProfile,
        winner: duel.winner === 'challenger' ? 'you' : 'opponent',
        rounds: duel.rounds,
        log: duel.log,
        ratingChange: ownChange,
        opponentRatingChange: opponentChange,
        ratingAfter: ownAfter,
        opponentRatingAfter: opponentAfter,
      };
      return { ...snapshot(ownState), arenaResult };
    } finally {
      if (!closed) await txn.unwatch().catch(() => undefined);
    }
  }
  throw new Error('Combat state changed repeatedly. Please retry.');
}


export async function setCombatAutoTactic(tacticValue: unknown): Promise<CombatSnapshot> {
  const validTactics: CombatTactic[] = ['balanced', 'aggressive', 'defensive', 'recovery'];
  if (typeof tacticValue !== 'string' || !validTactics.includes(tacticValue as CombatTactic)) {
    throw new Error('Invalid combat tactic.');
  }
  return mutate(state => {
    state.autoTactic = tacticValue as CombatTactic;
    return snapshot(state);
  });
}


export async function buyCombatUpgrade(upgradeValue: unknown): Promise<CombatSnapshot & { upgradePurchase: { id: string; name: string; rank: number; cost: number } }> {
  const upgrade = typeof upgradeValue === 'string' ? COMBAT_UPGRADES.find(entry => entry.id === upgradeValue) : undefined;
  if (!upgrade) throw new Error('Invalid combat upgrade.');
  return mutate(state => {
    const rank = combatUpgradeRank(state, upgrade.id);
    if (rank >= upgrade.maxRank) throw new Error('Combat upgrade is already max rank.');
    const cost = combatUpgradeCost(state, upgrade.id);
    if (state.combatMarks < cost) throw new Error('Not enough Combat Marks.');
    state.combatMarks -= cost;
    state.combatUpgrades[upgrade.id] = rank + 1;
    synchronizeCombatStats(state);
    return { ...snapshot(state), upgradePurchase: { id: upgrade.id, name: upgrade.name, rank: rank + 1, cost } };
  });
}

/** Most recent main-game orb roll becomes the character's active combat focus. */
export async function setCombatOrbFocus(rarityValue: unknown, nameValue: unknown): Promise<CombatSnapshot> {
  const raw = Number(rarityValue);
  const rarity = Number.isFinite(raw) ? Math.max(2, Math.min(1_000_000_000_000_000_000, Math.floor(raw))) : 2;
  const name = String(nameValue ?? 'Common Orb').trim().slice(0, 100) || 'Common Orb';
  return mutate(state => {
    state.orbFocusRarity = rarity;
    state.orbFocusName = name;
    synchronizeCombatStats(state);
    return snapshot(state);
  });
}

export async function setCombatDungeon(dungeonValue: unknown): Promise<CombatSnapshot> {
  const validDungeons: CombatDungeonId[] = ['undercrypt', 'cinder-vault', 'glass-labyrinth'];
  if (typeof dungeonValue !== 'string' || !validDungeons.includes(dungeonValue as CombatDungeonId)) {
    throw new Error('Invalid combat dungeon.');
  }
  return mutate(state => {
    const nextDungeon = dungeonValue as CombatDungeonId;
    if (state.dungeonId === nextDungeon) return snapshot(state);
    state.dungeonId = nextDungeon;
    state.depth = 1;
    state.bestDepth = state.dungeonBestDepths[nextDungeon];
    state.runId += 1;
    resetCombatRunGear(state);
    state.combatBeats = 0;
    state.playerActionsResolved = 0;
    state.enemyActionsResolved = 0;
    state.guardBeats = 0;
    state.encounterFirstStrikeUsed = false;
    state.energy = Math.min(state.maxEnergy, 3);
    state.enemyHp = getEnemyForDungeonDepth(nextDungeon, 1).maxHp;
    synchronizeCombatStats(state);
    state.health = state.maxHealth;
    return snapshot(state);
  });
}
