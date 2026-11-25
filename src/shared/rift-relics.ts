export const RIFT_RELIC_EQUIP_SLOTS = 2;
export const RIFT_RELIC_FORKED_EQUIP_SLOTS = 3;

export type RiftRelicId =
  | 'clock-without-hands'
  | 'temporal-arbitrage'
  | 'unlucky-star'
  | 'observer'
  | 'loaded-die'
  | 'fracture-cascade';

export type RiftRelicLevels = Record<RiftRelicId, number>;

export interface RiftRelicDefinition {
  id: RiftRelicId;
  name: string;
  category: 'tempo' | 'fortune' | 'risk' | 'precision' | 'burst' | 'chain';
  description: string;
  rankEffects: [string, string, string];
  baseScrapCost: number;
  baseRiftPointCost: number;
  costGrowth: number;
  maxLevel: 3;
}

export const RIFT_RELICS: Record<RiftRelicId, RiftRelicDefinition> = {
  'clock-without-hands': {
    id: 'clock-without-hands', name: 'Clock Without Hands', category: 'tempo',
    description: 'Reduces only the extra cooldown penalty caused by Temporal Drag.',
    rankEffects: ['20% less Temporal Drag penalty', '30% less Temporal Drag penalty', '40% less Temporal Drag penalty'],
    baseScrapCost: 120, baseRiftPointCost: 1, costGrowth: 2.2, maxLevel: 3,
  },
  'temporal-arbitrage': {
    id: 'temporal-arbitrage', name: 'Temporal Arbitrage', category: 'fortune',
    description: 'Converts a portion of Temporal Drag above ×1 into Luck.',
    rankEffects: ['5% conversion efficiency', '10% conversion efficiency', '20% conversion efficiency'],
    baseScrapCost: 220, baseRiftPointCost: 2, costGrowth: 2.2, maxLevel: 3,
  },
  'unlucky-star': {
    id: 'unlucky-star', name: 'The Unlucky Star', category: 'risk',
    description: 'Halves bonus Luck, but multiplies Rift completion rewards.',
    rankEffects: ['×2 completion rewards', '×2.5 completion rewards', '×3 completion rewards'],
    baseScrapCost: 320, baseRiftPointCost: 3, costGrowth: 2.25, maxLevel: 3,
  },
  observer: {
    id: 'observer', name: 'The Observer', category: 'precision',
    description: 'Luck rises as your best Orb approaches the Rift goal.',
    rankEffects: ['Up to ×2.33 Luck at 99% progress', 'Up to ×3.67 Luck at 99% progress', '×2 Luck at 90%; ×5 at 99%'],
    baseScrapCost: 420, baseRiftPointCost: 4, costGrowth: 2.25, maxLevel: 3,
  },
  'loaded-die': {
    id: 'loaded-die', name: 'Loaded Die', category: 'burst',
    description: 'The roll activation that crosses a 100-roll milestone receives a major Luck burst.',
    rankEffects: ['×10 milestone Luck', '×20 milestone Luck', '×40 milestone Luck'],
    baseScrapCost: 520, baseRiftPointCost: 5, costGrowth: 2.3, maxLevel: 3,
  },
  'fracture-cascade': {
    id: 'fracture-cascade', name: 'Fracture Cascade', category: 'chain',
    description: 'A new Rift personal best empowers your next roll activation.',
    rankEffects: ['Next roll activation gains ×1.25 Luck', 'Next roll activation gains ×1.5 Luck', 'Next roll activation gains ×1.75 Luck'],
    baseScrapCost: 650, baseRiftPointCost: 6, costGrowth: 2.3, maxLevel: 3,
  },
};

export const RIFT_RELIC_IDS = Object.keys(RIFT_RELICS) as RiftRelicId[];

export function emptyRiftRelicLevels(): RiftRelicLevels {
  return {
    'clock-without-hands': 0,
    'temporal-arbitrage': 0,
    'unlucky-star': 0,
    observer: 0,
    'loaded-die': 0,
    'fracture-cascade': 0,
  };
}

export function normalizeRiftRelicLevels(value: unknown): RiftRelicLevels {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const defaults = emptyRiftRelicLevels();
  return Object.fromEntries(RIFT_RELIC_IDS.map(id => {
    const level = Number(raw[id]);
    return [id, Number.isFinite(level) ? Math.max(0, Math.min(3, Math.floor(level))) : defaults[id]];
  })) as RiftRelicLevels;
}

export function normalizeEquippedRiftRelics(value: unknown, levelsValue?: unknown, maxSlotsValue: unknown = RIFT_RELIC_EQUIP_SLOTS): RiftRelicId[] {
  if (!Array.isArray(value)) return [];
  const levels = levelsValue === undefined ? null : normalizeRiftRelicLevels(levelsValue);
  const maxSlots = Number.isFinite(Number(maxSlotsValue)) ? Math.max(0, Math.min(RIFT_RELIC_FORKED_EQUIP_SLOTS, Math.floor(Number(maxSlotsValue)))) : RIFT_RELIC_EQUIP_SLOTS;
  const result: RiftRelicId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !Object.prototype.hasOwnProperty.call(RIFT_RELICS, entry)) continue;
    const id = entry as RiftRelicId;
    if (result.includes(id) || (levels && levels[id] <= 0)) continue;
    result.push(id);
    if (result.length >= maxSlots) break;
  }
  return result;
}

export function riftRelicCost(id: RiftRelicId, currentLevel: number): { scrap: number; riftPoints: number } {
  const definition = RIFT_RELICS[id];
  const level = Math.max(0, Math.min(definition.maxLevel, Math.floor(Number(currentLevel) || 0)));
  const growth = Math.pow(definition.costGrowth, level);
  return {
    scrap: Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(definition.baseScrapCost * growth)),
    riftPoints: Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(definition.baseRiftPointCost * growth)),
  };
}

export function riftEffectiveTemporalDragMultiplier(temporalDragValue: unknown, penaltyReductionValue: unknown): number {
  const rawDrag = Number(temporalDragValue);
  const drag = Number.isFinite(rawDrag) ? Math.max(1, Math.min(100, rawDrag)) : 1;
  const rawReduction = Number(penaltyReductionValue);
  const reduction = Number.isFinite(rawReduction) ? Math.max(0, Math.min(1, rawReduction)) : 0;
  return 1 + (drag - 1) * (1 - reduction);
}

export function riftTemporalArbitrageMultiplier(temporalDragValue: unknown, efficiencyValue: unknown): number {
  const rawDrag = Number(temporalDragValue);
  const drag = Number.isFinite(rawDrag) ? Math.max(1, Math.min(100, rawDrag)) : 1;
  const rawEfficiency = Number(efficiencyValue);
  const efficiency = Number.isFinite(rawEfficiency) ? Math.max(0, Math.min(1, rawEfficiency)) : 0;
  return 1 + (drag - 1) * efficiency;
}

export interface RiftRelicEffects {
  temporalDragPenaltyReduction: number;
  temporalArbitrageEfficiency: number;
  luckExcessMultiplier: number;
  completionRewardMultiplier: number;
  observerRank: number;
  loadedDieMultiplier: number;
  fractureCascadeMultiplier: number;
  fractureCascadeRank: number;
}

export function getRiftRelicEffects(equippedValue: unknown, levelsValue: unknown, maxSlotsValue: unknown = RIFT_RELIC_EQUIP_SLOTS): RiftRelicEffects {
  const levels = normalizeRiftRelicLevels(levelsValue);
  const equipped = normalizeEquippedRiftRelics(equippedValue, levels, maxSlotsValue);
  const level = (id: RiftRelicId) => equipped.includes(id) ? levels[id] : 0;
  const clock = level('clock-without-hands');
  const arbitrage = level('temporal-arbitrage');
  const unlucky = level('unlucky-star');
  const observer = level('observer');
  const loaded = level('loaded-die');
  const cascade = level('fracture-cascade');
  return {
    temporalDragPenaltyReduction: [0, 0.2, 0.3, 0.4][clock] ?? 0,
    temporalArbitrageEfficiency: [0, 0.05, 0.1, 0.2][arbitrage] ?? 0,
    luckExcessMultiplier: unlucky > 0 ? 0.5 : 1,
    completionRewardMultiplier: [1, 2, 2.5, 3][unlucky] ?? 1,
    observerRank: observer,
    loadedDieMultiplier: [1, 10, 20, 40][loaded] ?? 1,
    fractureCascadeMultiplier: [1, 1.25, 1.5, 1.75][cascade] ?? 1,
    fractureCascadeRank: cascade,
  };
}

/** Progress is logarithmic because Orb rarity and Rift goals are logarithmic. */
export function riftObserverLuckMultiplier(bestRarityValue: unknown, targetRarityValue: unknown, rankValue: unknown): number {
  const rank = Math.max(0, Math.min(3, Math.floor(Number(rankValue) || 0)));
  if (rank <= 0) return 1;
  const best = Math.max(2, Number(bestRarityValue) || 2);
  const target = Math.max(2, Number(targetRarityValue) || 2);
  const progress = Math.max(0, Math.min(1, Math.log10(best) / Math.log10(target)));
  let fullStrength = 1;
  if (progress >= 0.99) fullStrength = 5;
  else if (progress >= 0.9) fullStrength = 2 + ((progress - 0.9) / 0.09) * 3;
  else if (progress > 0.5) fullStrength = 1 + ((progress - 0.5) / 0.4);
  return 1 + (fullStrength - 1) * (rank / 3);
}
