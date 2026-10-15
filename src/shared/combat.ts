export type CombatPage = 'fight' | 'dungeons' | 'gear' | 'skills' | 'arena';
export type CombatIntent = 'strike' | 'heavy' | 'guard' | 'mend';
export type CombatCommand = CombatIntent | 'auto';
export type CombatTactic = 'balanced' | 'aggressive' | 'defensive' | 'recovery';
export type CombatDungeonId = 'undercrypt' | 'cinder-vault' | 'glass-labyrinth';
export type CombatRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Mythic';
export type CombatSkillStat = 'damagePct' | 'speedFlat' | 'healthPct' | 'critChance' | 'coinBonus';
export type CombatUpgradeId = 'edge-training' | 'vitality' | 'tempo' | 'precision' | 'scavenger' | 'orb-resonance';
export type CombatUpgradeStat = 'damagePct' | 'healthPct' | 'speedFlat' | 'critChance' | 'markBonus' | 'orbFocusPct';
export type CombatTrait = 'bleed' | 'keen' | 'first-strike' | 'bulwark' | 'regeneration' | 'desperation';

export interface CombatGear {
  id: string;
  name: string;
  slot: 'weapon' | 'armor';
  quality: number;
  /** Zero-based floor/depth where this piece dropped; old saves are migrated on read. */
  sourceFloor: number;
  power: number;
  effect: string;
  trait: CombatTrait;
  damageBonus: number;
  speedBonus: number;
  maxHealthBonus: number;
}
export type CombatSkillId =
  | 'ember-lung' | 'surefoot' | 'ironbark' | 'lucky-fang' | 'penny-hunter'
  | 'razor-current' | 'quicksilver' | 'deep-vitals' | 'execution-script' | 'bone-collector'
  | 'rift-hammer' | 'afterimage' | 'titan-blood' | 'fracture-math' | 'gilded-kill'
  | 'singularity-edge' | 'time-shear' | 'starforged-core' | 'apex-instinct' | 'royal-tithe'
  | 'infinity-cleaver' | 'chronos-heel' | 'worldheart' | 'annihilator' | 'infinite-bounty'
  | 'steady-hand' | 'coin-sense' | 'sunder-mark' | 'lightstep' | 'warden-slayer'
  | 'crystal-aegis' | 'blackstar-velocity' | 'astral-scavenger' | 'worldbreaker' | 'phoenix-engine';

export interface CombatSkillDefinition {
  id: CombatSkillId;
  name: string;
  rarity: CombatRarity;
  stat: CombatSkillStat;
  value: number;
  effect: string;
}
export const COMBAT_SKILLS: CombatSkillDefinition[] = [
  { id:'ember-lung', name:'Ember Lung', rarity:'Common', stat:'damagePct', value:.025, effect:'+2.5% damage per rank' },
  { id:'surefoot', name:'Surefoot', rarity:'Common', stat:'speedFlat', value:8, effect:'+8 Speed per rank' },
  { id:'ironbark', name:'Ironbark', rarity:'Common', stat:'healthPct', value:.03, effect:'+3% max health per rank' },
  { id:'lucky-fang', name:'Lucky Fang', rarity:'Common', stat:'critChance', value:.01, effect:'+1 percentage point critical chance per rank' },
  { id:'penny-hunter', name:'Penny Hunter', rarity:'Common', stat:'coinBonus', value:.05, effect:'+5% Delver Coins per rank' },
  { id:'razor-current', name:'Razor Current', rarity:'Uncommon', stat:'damagePct', value:.04, effect:'+4% damage per rank' },
  { id:'quicksilver', name:'Quicksilver', rarity:'Uncommon', stat:'speedFlat', value:14, effect:'+14 Speed per rank' },
  { id:'deep-vitals', name:'Deep Vitals', rarity:'Uncommon', stat:'healthPct', value:.05, effect:'+5% max health per rank' },
  { id:'execution-script', name:'Execution Script', rarity:'Uncommon', stat:'critChance', value:.018, effect:'+1.8 percentage points critical chance per rank' },
  { id:'bone-collector', name:'Bone Collector', rarity:'Uncommon', stat:'coinBonus', value:.08, effect:'+8% Delver Coins per rank' },
  { id:'rift-hammer', name:'Rift Hammer', rarity:'Rare', stat:'damagePct', value:.065, effect:'+6.5% damage per rank' },
  { id:'afterimage', name:'Afterimage', rarity:'Rare', stat:'speedFlat', value:22, effect:'+22 Speed per rank' },
  { id:'titan-blood', name:'Titan Blood', rarity:'Rare', stat:'healthPct', value:.075, effect:'+7.5% max health per rank' },
  { id:'fracture-math', name:'Fracture Math', rarity:'Rare', stat:'critChance', value:.025, effect:'+2.5 percentage points critical chance per rank' },
  { id:'gilded-kill', name:'Gilded Kill', rarity:'Rare', stat:'coinBonus', value:.12, effect:'+12% Delver Coins per rank' },
  { id:'singularity-edge', name:'Singularity Edge', rarity:'Epic', stat:'damagePct', value:.09, effect:'+9% damage per rank' },
  { id:'time-shear', name:'Time Shear', rarity:'Epic', stat:'speedFlat', value:32, effect:'+32 Speed per rank' },
  { id:'starforged-core', name:'Starforged Core', rarity:'Epic', stat:'healthPct', value:.10, effect:'+10% max health per rank' },
  { id:'apex-instinct', name:'Apex Instinct', rarity:'Epic', stat:'critChance', value:.035, effect:'+3.5 percentage points critical chance per rank' },
  { id:'royal-tithe', name:'Royal Tithe', rarity:'Epic', stat:'coinBonus', value:.18, effect:'+18% Delver Coins per rank' },
  { id:'infinity-cleaver', name:'Infinity Cleaver', rarity:'Mythic', stat:'damagePct', value:.13, effect:'+13% damage per rank' },
  { id:'chronos-heel', name:'Chronos Heel', rarity:'Mythic', stat:'speedFlat', value:45, effect:'+45 Speed per rank' },
  { id:'worldheart', name:'Worldheart', rarity:'Mythic', stat:'healthPct', value:.15, effect:'+15% max health per rank' },
  { id:'annihilator', name:'Annihilator', rarity:'Mythic', stat:'critChance', value:.05, effect:'+5 percentage points critical chance per rank' },
  { id:'infinite-bounty', name:'Infinite Bounty', rarity:'Mythic', stat:'coinBonus', value:.25, effect:'+25% Delver Coins per rank' },
  { id:'steady-hand', name:'Steady Hand', rarity:'Common', stat:'critChance', value:.008, effect:'+0.8 percentage points critical chance per rank' },
  { id:'coin-sense', name:'Coin Sense', rarity:'Common', stat:'coinBonus', value:.03, effect:'+3% Delver Coins per rank' },
  { id:'sunder-mark', name:'Sunder Mark', rarity:'Uncommon', stat:'damagePct', value:.035, effect:'+3.5% damage per rank' },
  { id:'lightstep', name:'Lightstep', rarity:'Uncommon', stat:'speedFlat', value:12, effect:'+12 Speed per rank' },
  { id:'warden-slayer', name:'Warden Slayer', rarity:'Rare', stat:'damagePct', value:.08, effect:'+8% damage per rank' },
  { id:'crystal-aegis', name:'Crystal Aegis', rarity:'Rare', stat:'healthPct', value:.065, effect:'+6.5% max health per rank' },
  { id:'blackstar-velocity', name:'Blackstar Velocity', rarity:'Epic', stat:'speedFlat', value:36, effect:'+36 Speed per rank' },
  { id:'astral-scavenger', name:'Astral Scavenger', rarity:'Epic', stat:'coinBonus', value:.20, effect:'+20% Delver Coins per rank' },
  { id:'worldbreaker', name:'Worldbreaker', rarity:'Mythic', stat:'damagePct', value:.16, effect:'+16% damage per rank' },
  { id:'phoenix-engine', name:'Phoenix Engine', rarity:'Mythic', stat:'healthPct', value:.18, effect:'+18% max health per rank' },
];
export type CombatSkillLevels = Partial<Record<CombatSkillId, number>>;

export interface CombatUpgradeDefinition {
  id: CombatUpgradeId;
  name: string;
  description: string;
  stat: CombatUpgradeStat;
  value: number;
  baseCost: number;
  costMultiplier: number;
  maxRank: number;
}
export const COMBAT_UPGRADE_RANK_CAP = 10;
export const COMBAT_UPGRADES: CombatUpgradeDefinition[] = [
  { id:'edge-training', name:'Edge Training', description:'+4% damage per rank', stat:'damagePct', value:.04, baseCost:18, costMultiplier:1.55, maxRank:10 },
  { id:'vitality', name:'Delver Vitality', description:'+5% maximum HP per rank', stat:'healthPct', value:.05, baseCost:18, costMultiplier:1.55, maxRank:10 },
  { id:'tempo', name:'Tempo Drills', description:'+10 Speed per rank', stat:'speedFlat', value:10, baseCost:22, costMultiplier:1.58, maxRank:10 },
  { id:'precision', name:'Critical Calibration', description:'+1 percentage point critical chance per rank', stat:'critChance', value:.01, baseCost:25, costMultiplier:1.60, maxRank:10 },
  { id:'scavenger', name:'Battle Scavenger', description:'+8% Combat Marks from kills per rank', stat:'markBonus', value:.08, baseCost:28, costMultiplier:1.62, maxRank:10 },
  { id:'orb-resonance', name:'Orb Resonance', description:'+1.5% focused-orb combat power per rank', stat:'orbFocusPct', value:.015, baseCost:32, costMultiplier:1.65, maxRank:10 },
];
export type CombatUpgradeLevels = Partial<Record<CombatUpgradeId, number>>;

/** Floor 0 asks for no minimum quality; the curve reaches 60% at floor 50. */
export function floorQualityRequirement(floorValue: unknown): number {
  const floor = Number.isFinite(Number(floorValue)) ? Math.max(0, Math.min(50_000, Math.floor(Number(floorValue)))) : 0;
  return Math.round(Math.min(100, floor * 1.2) * 100) / 100;
}

/** Relative gear contribution compared with the quality expected at the current floor. */
export function gearQualityEffectiveness(item: Pick<CombatGear, 'quality'> | null | undefined, floorValue: unknown): number {
  if (!item) return 0;
  const requirement = floorQualityRequirement(floorValue);
  if (requirement <= 0) return 1;
  const quality = Number.isFinite(Number(item.quality)) ? Math.max(0, Math.min(100, Number(item.quality))) : 0;
  return Math.max(.15, Math.min(1.25, quality / requirement));
}

export function combatUpgradeRank(state: Pick<CombatState, 'combatUpgrades'>, id: CombatUpgradeId): number {
  return Math.max(0, Math.min(COMBAT_UPGRADE_RANK_CAP, Math.floor(Number(state.combatUpgrades?.[id]) || 0)));
}

export function combatUpgradeCost(state: Pick<CombatState, 'combatUpgrades'>, id: CombatUpgradeId): number {
  const upgrade = COMBAT_UPGRADES.find(entry => entry.id === id);
  if (!upgrade) throw new Error('Unknown combat upgrade.');
  return Math.round(upgrade.baseCost * Math.pow(upgrade.costMultiplier, combatUpgradeRank(state, id)));
}

/** Deterministic rarity helper keeps pity boundaries unit-testable. */
export function resolveCombatSkillRarity(randomValue: number, pityEpic: number, pityMythic: number): CombatRarity {
  const chance = Number.isFinite(randomValue) ? Math.max(0, Math.min(.999999999, randomValue)) : 0;
  if (pityMythic >= 39) return 'Mythic';
  if (pityEpic >= 9) return chance < .8 ? 'Epic' : 'Mythic';
  return chance < .55 ? 'Common' : chance < .80 ? 'Uncommon' : chance < .92 ? 'Rare' : chance < .98 ? 'Epic' : 'Mythic';
}

export interface CombatState {
  version: 1;
  runId: number;
  dungeonId: CombatDungeonId;
  dungeonBestDepths: Record<CombatDungeonId, number>;
  depth: number;
  bestDepth: number;
  level: number;
  xp: number;
  xpToNext: number;
  health: number;
  maxHealth: number;
  speed: number;
  baseDamage: number;
  coins: number;
  /** Separate currency earned from combat, spent only on permanent combat upgrades. */
  combatMarks: number;
  combatUpgrades: CombatUpgradeLevels;
  totalKills: number;
  skillRolls: number;
  /** Pulls since the last Epic-or-better and Mythic skill, respectively. */
  skillPityEpic: number;
  skillPityMythic: number;
  /** Latest orb rolled in Infinity Orbs; it actively attunes combat stats. */
  orbFocusRarity: number;
  orbFocusName: string;
  sequence: number;
  /** Timestamp of the last accepted server combat beat; used to enforce cadence. */
  lastAcceptedBeatAtMs: number;
  combatBeats: number;
  playerActionsResolved: number;
  enemyActionsResolved: number;
  energy: number;
  maxEnergy: number;
  guardBeats: number;
  enemyHp: number;
  encounterFirstStrikeUsed: boolean;
  inventory: CombatGear[];
  equipment: { weapon: string | null; armor: string | null };
  skillLevels: CombatSkillLevels;
  arenaRating: number;
  arenaWins: number;
  arenaLosses: number;
  arenaLastChallengeAt: number;
  coreLevel: number;
  coreHighestRarity: number;
  autoTactic: CombatTactic;
}
export interface CombatStats {
  damage: number;
  speed: number;
  maxHealth: number;
  critChance: number;
  damageReduction: number;
  coinMultiplier: number;
  coreProgressionBonus: number;
  orbFocusBonus: number;
  gearQualityRequirement: number;
}
export interface CombatEnemy {
  id: string; name: string; kind: 'common' | 'elite' | 'boss';
  hp: number; maxHp: number; damage: number; speed: number;
  room: string; emoji: string; boss: boolean;
}
export interface CombatAction {
  actor: 'player' | 'enemy';
  kind: 'attack' | 'ability' | 'death' | 'advance' | 'loot' | 'level';
  damage?: number;
  text: string;
}
export interface CombatSnapshot { state: CombatState; enemy: CombatEnemy; stats: CombatStats; }
export interface CombatArenaProfile {
  userId: string;
  username: string;
  level: number;
  bestDepth: number;
  rating: number;
  wins: number;
  losses: number;
  updatedAt: number;
  damage: number;
  speed: number;
  maxHealth: number;
  critChance: number;
  weaponName: string;
  armorName: string;
  skillRanks: number;
}
export interface CombatArenaResult {
  opponent: CombatArenaProfile;
  winner: 'you' | 'opponent';
  rounds: number;
  log: string[];
  ratingChange: number;
  opponentRatingChange: number;
  ratingAfter: number;
  opponentRatingAfter: number;
}
export const SKILL_RANK_CAP = 5;
export const COMBAT_INVENTORY_CAP = 30;

/** As the bag fills, the lowest/oldest source-floor gear is discarded first. */
export function addCombatGearToInventory(state: CombatState, item: CombatGear, maxItems = COMBAT_INVENTORY_CAP): void {
  const cap = Math.max(2, Math.floor(Number.isFinite(maxItems) ? maxItems : COMBAT_INVENTORY_CAP));
  state.inventory = state.inventory.filter(existing => existing.id !== item.id);
  state.inventory.unshift(item);
  while (state.inventory.length > cap) {
    let removable = 0;
    for (let index = 1; index < state.inventory.length; index += 1) {
      const current = state.inventory[index]!;
      const worst = state.inventory[removable]!;
      const currentFloor = Math.max(0, Math.floor(Number(current.sourceFloor) || 0));
      const worstFloor = Math.max(0, Math.floor(Number(worst.sourceFloor) || 0));
      if (currentFloor < worstFloor || (currentFloor === worstFloor && current.quality < worst.quality) || (currentFloor === worstFloor && current.quality === worst.quality && index > removable)) removable = index;
    }
    state.inventory.splice(removable, 1);
  }
  for (const slot of ['weapon', 'armor'] as const) {
    const activeId = state.equipment[slot];
    if (activeId && state.inventory.some(g => g.id === activeId && g.slot === slot)) continue;
    const candidates = state.inventory.filter(g => g.slot === slot).sort((a,b) => b.power - a.power || b.quality - a.quality);
    state.equipment[slot] = candidates[0]?.id ?? null;
  }
}
export const SKILL_PULL_BASE_COST = 75;
export function skillPullCost(skillRolls: number): number {
  const pulls = Math.max(0, Math.min(40, Math.floor(Number(skillRolls) || 0)));
  return Math.round(SKILL_PULL_BASE_COST * Math.pow(1.09, pulls));
}
export function createCombatState(): CombatState {
  const weapon: CombatGear = { id:'starter-weapon', name:'Delver Knife', slot:'weapon', quality:35, sourceFloor:0, power:8, effect:'Adds +4 damage and +10 Speed. Critical chance +4 percentage points.', trait:'keen', damageBonus:4, speedBonus:10, maxHealthBonus:0 };
  const armor: CombatGear = { id:'starter-armor', name:'Worn Leathers', slot:'armor', quality:28, sourceFloor:0, power:5, effect:'Adds +40 max HP and reduces incoming damage by 4%.', trait:'bulwark', damageBonus:0, speedBonus:0, maxHealthBonus:40 };
  const state: CombatState = {
    version:1, runId:1, dungeonId:'undercrypt', dungeonBestDepths:{undercrypt:1,'cinder-vault':1,'glass-labyrinth':1}, depth:1, bestDepth:1,
    level:1, xp:0, xpToNext:100, health:1040, maxHealth:1040, speed:310,
    baseDamage:54, coins:250, combatMarks:0, combatUpgrades:{}, totalKills:0, skillRolls:0, skillPityEpic:0, skillPityMythic:0, orbFocusRarity:2, orbFocusName:'Common Orb', sequence:0, lastAcceptedBeatAtMs:0,
    combatBeats:0, playerActionsResolved:0, enemyActionsResolved:0,
    energy:3, maxEnergy:5, guardBeats:0, enemyHp:130,
    encounterFirstStrikeUsed:false, inventory:[weapon,armor],
    equipment:{weapon:weapon.id,armor:armor.id}, skillLevels:{},
    arenaRating:1000, arenaWins:0, arenaLosses:0, arenaLastChallengeAt:0,
    coreLevel:1, coreHighestRarity:2, autoTactic:'balanced',
  };
  synchronizeCombatStats(state);
  state.enemyHp = getEnemyForDepth(1).maxHp;
  return state;
}
export function combatStatsFor(state: CombatState): CombatStats {
  const weapon = state.inventory.find(item => item.id === state.equipment.weapon && item.slot === 'weapon');
  const armor = state.inventory.find(item => item.id === state.equipment.armor && item.slot === 'armor');
  let damagePct=0, speedFlat=0, healthPct=0, critChance=.08, coinBonus=0;
  for (const skill of COMBAT_SKILLS) {
    const rank = Math.max(0, Math.min(SKILL_RANK_CAP, Math.floor(Number(state.skillLevels[skill.id]) || 0)));
    if (!rank) continue;
    if (skill.stat==='damagePct') damagePct += skill.value*rank;
    else if (skill.stat==='speedFlat') speedFlat += skill.value*rank;
    else if (skill.stat==='healthPct') healthPct += skill.value*rank;
    else if (skill.stat==='critChance') critChance += skill.value*rank;
    else if (skill.stat==='coinBonus') coinBonus += skill.value*rank;
  }
  for (const upgrade of COMBAT_UPGRADES) {
    const rank = combatUpgradeRank(state, upgrade.id);
    if (!rank) continue;
    if (upgrade.stat === 'damagePct') damagePct += upgrade.value * rank;
    else if (upgrade.stat === 'healthPct') healthPct += upgrade.value * rank;
    else if (upgrade.stat === 'speedFlat') speedFlat += upgrade.value * rank;
    else if (upgrade.stat === 'critChance') critChance += upgrade.value * rank;
  }
  const floor = Math.max(0, state.depth - 1);
  const gearQualityRequirement = floorQualityRequirement(floor);
  const weaponQuality = gearQualityEffectiveness(weapon, floor);
  const armorQuality = gearQualityEffectiveness(armor, floor);
  const orbRarity = Math.max(2, Math.min(1_000_000_000_000_000_000, Math.floor(Number(state.orbFocusRarity) || 2)));
  const orbFocusBonus = Math.min(.35, Math.max(0, Math.log10(orbRarity) * .025 + combatUpgradeRank(state, 'orb-resonance') * .015));
  const coreProgressionBonus = coreProgressionCombatBonus(state.coreLevel, state.coreHighestRarity);
  const dungeonDamageBonus = state.dungeonId === 'cinder-vault' ? 0.10 : 0;
  const dungeonSpeedBonus = state.dungeonId === 'glass-labyrinth' ? 35 : 0;
  const dungeonCritBonus = state.dungeonId === 'glass-labyrinth' ? 0.05 : 0;
  const flatDamage = 50 + (Math.max(1,state.level)-1)*4 + Math.round((weapon?.damageBonus||0)*weaponQuality);
  const flatHealth = 1000 + (Math.max(1,state.level)-1)*30 + Math.round((armor?.maxHealthBonus||0)*armorQuality);
  const maxHealth = Math.max(1,Math.round(flatHealth*(1+healthPct)*(1+coreProgressionBonus)*(1+orbFocusBonus*.65)));
  let speed = 300 + Math.round((weapon?.speedBonus||0)*weaponQuality) + speedFlat + dungeonSpeedBonus;
  if (armor?.trait==='desperation' && state.health>0 && state.health<=maxHealth*.4) speed+=Math.round(20*armorQuality);
  if (weapon?.trait==='keen') critChance+=.04*weaponQuality;
  critChance += dungeonCritBonus;
  return {
    damage:Math.max(1,Math.round(flatDamage*(1+damagePct)*(1+coreProgressionBonus)*(1+dungeonDamageBonus)*(1+orbFocusBonus))),
    speed:Math.min(800,speed), maxHealth,
    critChance:Math.min(.75,Math.max(0,critChance)),
    damageReduction: armor?.trait === 'bulwark' ? 0.04*armorQuality : 0,
    coinMultiplier:1+coinBonus, coreProgressionBonus, orbFocusBonus, gearQualityRequirement,
  };
}
export function synchronizeCombatStats(state: CombatState): CombatStats {
  const stats=combatStatsFor(state);
  state.baseDamage=stats.damage; state.speed=stats.speed;
  const previousMax=Number(state.maxHealth)||stats.maxHealth;
  state.maxHealth=stats.maxHealth;
  if (!Number.isFinite(state.health)) state.health=state.maxHealth;
  state.health=Math.max(0,Math.min(state.maxHealth,state.health));
  if (previousMax<=0) state.health=state.maxHealth;
  state.maxEnergy=Math.max(1,Math.min(10,Math.floor(Number(state.maxEnergy)||5)));
  state.energy=Math.max(0,Math.min(state.maxEnergy,Math.floor(Number(state.energy)||0)));
  return stats;
}

export function combatMarkMultiplier(state: Pick<CombatState, 'combatUpgrades'>): number {
  return 1 + combatUpgradeRank(state, 'scavenger') * .08;
}

export interface CombatSkillCopyResult {
  rank: number;
  duplicate: boolean;
  maxRank: boolean;
  coinsRefunded: number;
}

/** Applies one server-rolled copy. Every duplicate raises the skill rank until Rank 5. */
export function applyCombatSkillCopy(
  state: CombatState,
  skillId: CombatSkillId,
  pullCost: number,
): CombatSkillCopyResult {
  const skill = COMBAT_SKILLS.find(candidate => candidate.id === skillId);
  if (!skill) throw new Error('Unknown combat skill.');
  const oldRank = Math.max(0, Math.min(
    SKILL_RANK_CAP,
    Math.floor(Number(state.skillLevels[skillId]) || 0),
  ));
  const duplicate = oldRank > 0;

  if (oldRank < SKILL_RANK_CAP) {
    const rank = oldRank + 1;
    state.skillLevels[skillId] = rank;
    synchronizeCombatStats(state);
    return { rank, duplicate, maxRank: rank === SKILL_RANK_CAP, coinsRefunded: 0 };
  }

  const safeCost = Number.isFinite(pullCost) ? Math.max(0, Math.floor(pullCost)) : 0;
  const refundRate = skill.rarity === 'Mythic' ? 0.75 : skill.rarity === 'Epic' ? 0.5 : 0.25;
  const coinsRefunded = Math.round(safeCost * refundRate);
  state.coins = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, state.coins) + coinsRefunded);
  synchronizeCombatStats(state);
  return { rank: oldRank, duplicate: true, maxRank: true, coinsRefunded };
}

export function getEnemyForDepth(depthValue: number): CombatEnemy {
  const depth=Math.max(1,Math.min(50000,Math.floor(Number(depthValue)||1)));
  const encounters=[
    {id:'ash-husk',name:'Ash Husk',kind:'common' as const,hp:1,damage:1,speed:100,room:'Stone Gallery',emoji:'💀'},
    {id:'bone-rat',name:'Bone Rat',kind:'common' as const,hp:.72,damage:.72,speed:185,room:'Rat Warrens',emoji:'🐀'},
    {id:'ember-acolyte',name:'Ember Acolyte',kind:'elite' as const,hp:.9,damage:1.12,speed:125,room:'Cinder Chapel',emoji:'🔥'},
    {id:'ironbound',name:'Ironbound',kind:'elite' as const,hp:1.45,damage:.86,speed:80,room:'Ironworks',emoji:'⚙️'},
    {id:'grave-scout',name:'Grave Scout',kind:'common' as const,hp:1.02,damage:1.02,speed:175,room:'Broken Gallery',emoji:'🦴'},
    {id:'mire-witch',name:'Mire Witch',kind:'elite' as const,hp:1.15,damage:1.08,speed:110,room:'Drowned Vault',emoji:'🧙'},
    {id:'crypt-hound',name:'Crypt Hound',kind:'common' as const,hp:.96,damage:1.2,speed:215,room:'Hunt Hall',emoji:'🐺'},
    {id:'bell-knight',name:'Bell Knight',kind:'elite' as const,hp:1.55,damage:.98,speed:90,room:'Bell Nave',emoji:'🛡️'},
    {id:'ash-executioner',name:'Ash Executioner',kind:'elite' as const,hp:1.22,damage:1.3,speed:130,room:'Execution Yard',emoji:'🪓'},
  ];
  const boss=depth%10===0;
  const base=encounters[(depth-1)%encounters.length]!;
  const scaledHp=Math.min(1e12,Math.round(130*Math.pow(1.065,depth-1)*base.hp));
  const maxHp=boss?Math.round(scaledHp*1.15*4.6):scaledHp;
  const damage=Math.min(1e9,Math.max(1,Math.round((20+depth*1.55)*base.damage*(boss?2.2*1.15:1))));
  return {id:boss?'crypt-warden':base.id,name:boss?'Crypt Warden':base.name,kind:boss?'boss':base.kind,hp:maxHp,maxHp,damage,speed:Math.min(450,base.speed+Math.floor(depth/15)*25+(boss?55:0)),room:boss?'Warden Throne':base.room,emoji:boss?'👹':base.emoji,boss};
}


/** Each defeated Crypt Warden grants +1% effective Luck for main-game orb rolls, capped at +25%. */
export const UNDERCRYPT_ORB_LUCK_PER_WARDEN = 0.01;
export const UNDERCRYPT_ORB_LUCK_BONUS_CAP = 0.25;

export function undercryptWardensDefeated(bestDepthValue: unknown): number {
  const rawDepth = Number(bestDepthValue);
  const bestDepth = Number.isFinite(rawDepth) ? Math.max(1, Math.min(50_000, Math.floor(rawDepth))) : 1;
  return Math.min(
    Math.floor(UNDERCRYPT_ORB_LUCK_BONUS_CAP / UNDERCRYPT_ORB_LUCK_PER_WARDEN),
    Math.floor((bestDepth - 1) / 10),
  );
}

export function undercryptOrbLuckMultiplier(bestDepthValue: unknown): number {
  return 1 + undercryptWardensDefeated(bestDepthValue) * UNDERCRYPT_ORB_LUCK_PER_WARDEN;
}


export interface CombatArenaRatingUpdate {
  playerRating: number;
  opponentRating: number;
  playerChange: number;
  opponentChange: number;
}

/** Standard K=24 Elo update, bounded to keep stored ratings valid. */
export function calculateCombatArenaRatingUpdate(
  playerRatingValue: number,
  opponentRatingValue: number,
  playerWon: boolean,
): CombatArenaRatingUpdate {
  const playerBefore = Number.isFinite(playerRatingValue) ? Math.max(100, Math.min(10_000, Math.floor(playerRatingValue))) : 1000;
  const opponentBefore = Number.isFinite(opponentRatingValue) ? Math.max(100, Math.min(10_000, Math.floor(opponentRatingValue))) : 1000;
  const expectedPlayer = 1 / (1 + Math.pow(10, (opponentBefore - playerBefore) / 400));
  const score = playerWon ? 1 : 0;
  const rawChange = Math.round(24 * (score - expectedPlayer));
  // Transfer only rating points the winner can receive and the loser can give.
  // Independent clamps break zero-sum fairness at the 100/10,000 boundaries.
  const minimumTransfer = Math.max(100 - playerBefore, opponentBefore - 10_000);
  const maximumTransfer = Math.min(10_000 - playerBefore, opponentBefore - 100);
  const transfer = Math.max(minimumTransfer, Math.min(maximumTransfer, rawChange));
  const playerRating = playerBefore + transfer;
  const opponentRating = opponentBefore - transfer;
  return {
    playerRating,
    opponentRating,
    playerChange: playerRating - playerBefore,
    opponentChange: opponentRating - opponentBefore,
  };
}

/** Main-game progress boosts combat when the player enters Combat, without mutating the core save. */
export function coreProgressionCombatBonus(coreLevelValue: unknown, highestRarityValue: unknown): number {
  const rawLevel = Number(coreLevelValue);
  const level = Number.isFinite(rawLevel) ? Math.max(1, Math.min(1_000_000, Math.floor(rawLevel))) : 1;
  const rawRarity = Number(highestRarityValue);
  const rarity = Number.isFinite(rawRarity) ? Math.max(2, Math.min(1_000_000_000_000_000_000, rawRarity)) : 2;
  const levelBonus = Math.min(0.20, Math.floor((level - 1) / 10) * 0.02);
  const rarityBonus = Math.min(0.05, Math.max(0, Math.floor(Math.log10(rarity)) * 0.003));
  return Math.round((levelBonus + rarityBonus) * 10_000) / 10_000;
}


/** Choose an action from persisted health, energy, and tactic settings. */
export function chooseAutoCombatIntent(state: CombatState): CombatIntent {
  const maxHealth = Math.max(1, Number(state.maxHealth) || 1);
  const healthRatio = Math.max(0, Math.min(1, (Number(state.health) || 0) / maxHealth));
  const energy = Math.max(0, Math.min(10, Math.floor(Number(state.energy) || 0)));

  switch (state.autoTactic) {
    case 'aggressive':
      return energy >= 3 ? 'heavy' : 'strike';
    case 'defensive':
      if (healthRatio <= 0.70 && energy >= 4) return 'mend';
      if (healthRatio <= 0.45 && energy >= 2) return 'guard';
      return 'strike';
    case 'recovery':
      if (healthRatio <= 0.85 && energy >= 4) return 'mend';
      if (healthRatio <= 0.40 && energy >= 2) return 'guard';
      return energy >= 3 ? 'heavy' : 'strike';
    case 'balanced':
    default:
      if (healthRatio <= 0.35 && energy >= 4) return 'mend';
      if (healthRatio <= 0.18 && energy >= 2) return 'guard';
      return energy >= 3 ? 'heavy' : 'strike';
  }
}


export function getEnemyForDungeonDepth(dungeonValue: unknown, depth: number): CombatEnemy {
  const dungeon: CombatDungeonId =
    dungeonValue === 'cinder-vault' || dungeonValue === 'glass-labyrinth' ? dungeonValue : 'undercrypt';
  const base = getEnemyForDepth(depth);
  if (dungeon === 'undercrypt') return base;
  if (dungeon === 'cinder-vault') {
    const maxHp = Math.max(1, Math.round(base.maxHp * 1.35));
    return {
      ...base,
      id: base.boss ? 'cinder-sovereign' : base.id,
      name: base.boss ? 'Cinder Sovereign' : 'Cinder ' + base.name,
      hp: maxHp,
      maxHp,
      damage: Math.max(1, Math.round(base.damage * 1.25)),
      speed: Math.min(500, Math.round(base.speed * 1.08)),
      room: base.boss ? 'The Furnace Crown' : 'Cinder ' + base.room,
      emoji: base.boss ? '🌋' : base.emoji,
    };
  }
  const maxHp = Math.max(1, Math.round(base.maxHp * 0.78));
  return {
    ...base,
    id: base.boss ? 'prism-regent' : base.id,
    name: base.boss ? 'Prism Regent' : 'Prism ' + base.name,
    hp: maxHp,
    maxHp,
    damage: Math.max(1, Math.round(base.damage * 1.12)),
    speed: Math.min(600, Math.round(base.speed * 1.35)),
    room: base.boss ? 'Hall of Infinite Reflections' : 'Mirror ' + base.room,
    emoji: base.boss ? '🔮' : base.emoji,
  };
}
