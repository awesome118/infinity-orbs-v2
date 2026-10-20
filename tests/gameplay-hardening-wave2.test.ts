import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_BEAT_INTERVAL_MS,
  combatActionsDue,
  combatGearQualityFromRoll,
  combatNextBeatDelayMs,
  combatRuneExperienceForLevel,
  combatRuneLevelFromExperience,
  combatRuneLevelMultiplier,
} from '../src/shared/combat.js';
import { todayKey, weekStartMs } from '../src/shared/game.js';

test('combat action scheduling is bounded for invalid and extreme values', () => {
  assert.equal(combatActionsDue(Number.NaN, 20, 0), 0);
  assert.equal(combatActionsDue(-10, 20, 0), 0);
  assert.equal(combatActionsDue(100, Number.MAX_SAFE_INTEGER, 0, 3), 3);
  assert.equal(combatActionsDue(0, 10, 0), 0);
});

test('combat beat delay safely handles invalid timestamps and clamps expired beats', () => {
  assert.equal(combatNextBeatDelayMs(Number.NaN, 10_000), 0);
  assert.equal(combatNextBeatDelayMs(10_000, Number.POSITIVE_INFINITY), 0);
  assert.equal(combatNextBeatDelayMs(50_000, 10_000), 0);
  assert.equal(combatNextBeatDelayMs(10_000, 10_000), COMBAT_BEAT_INTERVAL_MS + 150);
});

test('gear quality rolls never escape the supported range for malformed input', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 0.5, 1, 4]) {
    const quality = combatGearQualityFromRoll(value);
    assert.ok(Number.isFinite(quality));
    assert.ok(quality >= 0 && quality <= 100);
  }
});

test('Rune XP saturation resolves to a finite distinguishable level', () => {
  const level = combatRuneLevelFromExperience(Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(level));
  assert.ok(level > 1);
  assert.ok(level < Number.MAX_SAFE_INTEGER);
  assert.equal(combatRuneExperienceForLevel(level + 1), Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isFinite(combatRuneLevelMultiplier(level)));
  assert.equal(combatRuneLevelFromExperience(Number.NaN), 1);
  assert.equal(combatRuneLevelFromExperience(-10), 1);
});

test('calendar key helpers tolerate invalid timestamps instead of throwing', () => {
  assert.match(todayKey(Number.NaN), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isFinite(weekStartMs(Number.NaN)));
  assert.ok(Number.isFinite(weekStartMs(Number.POSITIVE_INFINITY)));
  assert.ok(Number.isFinite(weekStartMs(Number.MAX_VALUE)));
  assert.match(todayKey(Number.MAX_VALUE), /^\\d{4}-\\d{2}-\\d{2}$/);
});

test('calendar keys remain deterministic for a valid timestamp', () => {
  const timestamp = Date.UTC(2026, 9, 20, 14, 30);
  assert.equal(todayKey(timestamp), '2026-10-20');
  assert.equal(weekStartMs(timestamp), Date.UTC(2026, 9, 18));
});
