import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIFT_RELIC_EQUIP_SLOTS,
  emptyRiftRelicLevels,
  getRiftRelicEffects,
  normalizeEquippedRiftRelics,
  normalizeRiftRelicLevels,
  riftObserverLuckMultiplier,
  riftRelicCost,
} from '../src/shared/rift-relics.js';

test('Rift relic levels are bounded and equipped loadouts contain only owned relics', () => {
  const levels = normalizeRiftRelicLevels({ 'clock-without-hands': 99, observer: -2, 'loaded-die': 2.8 });
  assert.equal(levels['clock-without-hands'], 3);
  assert.equal(levels.observer, 0);
  assert.equal(levels['loaded-die'], 2);
  assert.deepEqual(
    normalizeEquippedRiftRelics(['observer', 'clock-without-hands', 'clock-without-hands', 'loaded-die'], levels),
    ['clock-without-hands', 'loaded-die'],
  );
  assert.equal(RIFT_RELIC_EQUIP_SLOTS, 2);
  assert.deepEqual(emptyRiftRelicLevels(), {
    'clock-without-hands': 0, 'temporal-arbitrage': 0, 'unlucky-star': 0,
    observer: 0, 'loaded-die': 0, 'fracture-cascade': 0,
  });
});

test('relic rank effects require the relic to be equipped', () => {
  const levels = { ...emptyRiftRelicLevels(), 'clock-without-hands': 3, 'temporal-arbitrage': 3, 'unlucky-star': 2, observer: 3, 'loaded-die': 3, 'fracture-cascade': 3 };
  const inactive = getRiftRelicEffects([], levels);
  assert.equal(inactive.temporalArbitrageEfficiency, 0);
  assert.equal(inactive.completionRewardMultiplier, 1);
  const effects = getRiftRelicEffects(
    ['clock-without-hands', 'temporal-arbitrage', 'unlucky-star', 'observer', 'loaded-die', 'fracture-cascade'],
    levels,
  );
  assert.equal(effects.temporalDragPenaltyReduction, 0.4);
  assert.equal(effects.temporalArbitrageEfficiency, 0.2);
  assert.equal(effects.luckExcessMultiplier, 0.5);
  assert.equal(effects.completionRewardMultiplier, 2.5);
  assert.equal(effects.observerRank, 0); // The two-slot cap is enforced before effects are calculated.
  assert.equal(effects.loadedDieMultiplier, 1);
  assert.equal(effects.fractureCascadeRank, 0);
});

test('relic costs require both currencies and increase by rank', () => {
  const first = riftRelicCost('clock-without-hands', 0);
  const second = riftRelicCost('clock-without-hands', 1);
  assert.deepEqual(first, { scrap: 120, riftPoints: 8 });
  assert.ok(second.scrap > first.scrap);
  assert.ok(second.riftPoints > first.riftPoints);
});

test('Observer Luck ramps from neutral to its maximum near the Rift goal', () => {
  const target = 1_000_000;
  assert.equal(riftObserverLuckMultiplier(1_000, target, 3), 1);
  assert.ok(Math.abs(riftObserverLuckMultiplier(1_000_000 ** 0.9, target, 3) - 2) < 1e-10);
  assert.equal(riftObserverLuckMultiplier(1_000_000 ** 0.99, target, 3), 5);
  assert.equal(riftObserverLuckMultiplier(1_000_000, target, 1), 1 + 4 / 3);
});
