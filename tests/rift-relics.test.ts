import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIFT_RELIC_EQUIP_SLOTS,
  RIFT_RELIC_FORKED_EQUIP_SLOTS,
  emptyRiftRelicLevels,
  getRiftRelicEffects,
  normalizeEquippedRiftRelics,
  normalizeRiftRelicLevels,
  riftObserverLuckMultiplier,
  riftRelicCost,
  riftEffectiveTemporalDragMultiplier,
  riftTemporalArbitrageMultiplier,
  riftStartingMultiballLevel,
  riftRelicProgressCoinMultiplier,
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
    'mirror-array': 0, 'stillness-engine': 0, 'rift-tithe': 0,
  });
});

test('relic rank effects require the relic to be equipped', () => {
  const levels = { ...emptyRiftRelicLevels(), 'clock-without-hands': 3, 'temporal-arbitrage': 3, 'unlucky-star': 2, observer: 3, 'loaded-die': 3, 'fracture-cascade': 3 };
  const inactive = getRiftRelicEffects([], levels);
  assert.equal(inactive.temporalArbitrageEfficiency, 0);
  assert.equal(inactive.completionRewardMultiplier, 1);
  const tempo = getRiftRelicEffects(['clock-without-hands', 'temporal-arbitrage'], levels);
  assert.equal(tempo.temporalDragPenaltyReduction, 0.4);
  assert.equal(tempo.temporalArbitrageEfficiency, 0.2);
  const risk = getRiftRelicEffects(['unlucky-star'], levels);
  assert.equal(risk.luckExcessMultiplier, 0.5);
  assert.equal(risk.completionRewardMultiplier, 2.5);
  const observer = getRiftRelicEffects(['observer'], levels);
  assert.equal(observer.observerRank, 3);
  const loaded = getRiftRelicEffects(['loaded-die'], levels);
  assert.equal(loaded.loadedDieMultiplier, 40);
  const cascade = getRiftRelicEffects(['fracture-cascade'], levels);
  assert.equal(cascade.fractureCascadeMultiplier, 1.75);
  assert.equal(cascade.fractureCascadeRank, 3);
});

test('relic costs require both currencies and increase by rank', () => {
  const first = riftRelicCost('clock-without-hands', 0);
  const second = riftRelicCost('clock-without-hands', 1);
  assert.deepEqual(first, { scrap: 120, riftPoints: 1 });
  assert.ok(second.scrap > first.scrap);
  assert.ok(second.riftPoints > first.riftPoints);
});

test('Observer Luck ramps from neutral to its maximum near the Rift goal', () => {
  const target = 1_000_000;
  assert.equal(riftObserverLuckMultiplier(1_000, target, 3), 1);
  assert.ok(Math.abs(riftObserverLuckMultiplier(1_000_000 ** 0.9, target, 3) - 2) < 1e-10);
  assert.ok(Math.abs(riftObserverLuckMultiplier(1_000_000 ** 0.99, target, 3) - 5) < 1e-10);
  assert.equal(riftObserverLuckMultiplier(1_000_000, target, 1), 1 + 4 / 3);
});

test('Clock Without Hands and Temporal Arbitrage convert the Temporal Drag penalty as designed', () => {
  assert.equal(riftEffectiveTemporalDragMultiplier(6, 0.4), 4);
  assert.equal(riftTemporalArbitrageMultiplier(6, 0.2), 2);
  assert.equal(riftEffectiveTemporalDragMultiplier(1, 0.4), 1);
  assert.equal(riftTemporalArbitrageMultiplier(1, 0.2), 1);
});


test('Timeline Fork permits one additional owned relic without weakening the normal two-slot limit', () => {
  const levels = {
    ...emptyRiftRelicLevels(),
    'clock-without-hands': 1,
    'temporal-arbitrage': 1,
    'unlucky-star': 1,
  };
  const loadout = ['clock-without-hands', 'temporal-arbitrage', 'unlucky-star'];
  assert.deepEqual(normalizeEquippedRiftRelics(loadout, levels), loadout.slice(0, 2));
  assert.deepEqual(normalizeEquippedRiftRelics(loadout, levels, RIFT_RELIC_FORKED_EQUIP_SLOTS), loadout);
  assert.equal(getRiftRelicEffects(loadout, levels).completionRewardMultiplier, 1);
  assert.equal(getRiftRelicEffects(loadout, levels, RIFT_RELIC_FORKED_EQUIP_SLOTS).completionRewardMultiplier, 2);
});


test('the free Rift Ascent Multiball level is gated by Second-best', () => {
  assert.equal(riftStartingMultiballLevel(0, false, 0), 0);
  assert.equal(riftStartingMultiballLevel(0, false, 3), 0);
  assert.equal(riftStartingMultiballLevel(0, true, 0), 1);
  assert.equal(riftStartingMultiballLevel(0, true, 3), 4);
  assert.equal(riftStartingMultiballLevel(2, false, 3), 2);
});

test('Mirror Array, Stillness Engine, and Rift Tithe have distinct equipped effects', () => {
  const levels = { ...emptyRiftRelicLevels(), 'mirror-array': 3, 'stillness-engine': 3, 'rift-tithe': 3 };
  const effects = getRiftRelicEffects(['mirror-array', 'stillness-engine'], levels, 3);
  assert.equal(effects.secondBestMultiballBonus, 3);
  assert.equal(effects.noAutomationCooldownReduction, 0.2);
  assert.equal(effects.progressCoinBonus, 0);
  const tithe = getRiftRelicEffects(['rift-tithe'], levels);
  assert.equal(tithe.progressCoinBonus, 0.75);
  assert.equal(riftRelicProgressCoinMultiplier(2, 1_000_000, 0.75), 1);
  assert.ok(riftRelicProgressCoinMultiplier(1_000, 1_000_000, 0.75) > 1);
  assert.equal(riftRelicProgressCoinMultiplier(1_000_000, 1_000_000, 0.75), 1.75);
});

test('Stillness Engine compounds multiplicatively with Clock Without Hands', () => {
  assert.ok(Math.abs(riftEffectiveTemporalDragMultiplier(6, 0.4, 0.2) - 3.4) < 1e-12);
});
