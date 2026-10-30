import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addCoinAmount,
  bulkRollSimulationScale,
  addCollectionValue,
  altarCoinFloor,
  coinsForRarity,
  formatNumber,
  normalizeCoinAmount,
} from '../src/shared/game.js';

test('bulk roll sampling scales dynamically around a 50,000-sample target', () => {
  assert.equal(bulkRollSimulationScale(1), 1);
  assert.equal(bulkRollSimulationScale(50_000), 1);
  assert.equal(bulkRollSimulationScale(50_001), 2);
  assert.equal(bulkRollSimulationScale(150_000), 3);
  assert.equal(bulkRollSimulationScale(500_000), 10);
  assert.equal(bulkRollSimulationScale(500_001), 11);
  assert.equal(bulkRollSimulationScale(5_000_000), 100);
  assert.equal(bulkRollSimulationScale(50_000_000), 100);
});

test('large roll batches retain real-count weighting and square-root Luck compensation', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  assert.match(server, /payoutLuck \* safeSimulationScale \* safeSimulationScale/);
  assert.match(server, /const payoutCopies = Math\.max\(0, rollWeight - 1\)/);
  assert.match(server, /xpGained = Math\.min\(Number\.MAX_SAFE_INTEGER, xpGained \+ sampleXp \* payoutCopies \+ bestXp\)/);
  assert.match(server, /s\.totalRolls \+= rollWeight/);
  assert.match(server, /await onProgress\(Math\.min\(rollCount, processedEquivalentRolls\)\)/);
  assert.match(server, /const maxFrenzyChunk = 50_000 \* batchSimulationScale/);
  assert.match(server, /const leadingUncompressedRolls/);
  assert.match(server, /const groupEffectiveLuck = Math\.min\(Number\.MAX_VALUE, payoutLuck \* groupSimulationScale \* groupSimulationScale\)/);
  assert.match(server, /const onlineCoinBlockSize = Math\.max/);
  assert.match(server, /const appendPayoutSegments =/);
  assert.match(server, /const legacyRuneBonusBudget = source === 'frenzy'/);
  assert.match(server, /const baseRollGroups: Array/);
  assert.match(server, /const remainingInCoinBlock/);
  assert.match(server, /let activeLegacyBlockIndex = -1/);
  assert.match(server, /const legacyBatchCount = source === 'online'/);
});
test('Coin balances and rewards can grow beyond the JavaScript safe-integer threshold', () => {
  const beyondSafeInteger = 1e30;
  const normalizedLargeBalance = normalizeCoinAmount(beyondSafeInteger);
  assert.equal(normalizedLargeBalance, Math.floor(beyondSafeInteger));
  const combinedBalance = addCoinAmount(Number.MAX_SAFE_INTEGER, beyondSafeInteger);
  assert.ok(Number.isFinite(combinedBalance));
  assert.ok(combinedBalance > normalizedLargeBalance);
  const accumulated = addCoinAmount(1e200, 2e200);
  assert.ok(Number.isFinite(accumulated));
  assert.ok(accumulated > Number.MAX_SAFE_INTEGER);
});

test('Coin and collection totals saturate only at the largest finite Number', () => {
  assert.equal(normalizeCoinAmount(Number.POSITIVE_INFINITY), Number.MAX_VALUE);
  assert.equal(addCoinAmount(Number.MAX_VALUE * 0.75, Number.MAX_VALUE), Number.MAX_VALUE);
  assert.equal(addCollectionValue(1e200, 2e200), 3e200);
  assert.equal(addCollectionValue(Number.MAX_VALUE, 1e200), Number.MAX_VALUE);
});

test('Altar Coin requirements can scale beyond the safe-integer threshold', () => {
  assert.ok(altarCoinFloor(100) > Number.MAX_SAFE_INTEGER);
  assert.equal(altarCoinFloor(100_000), Number.MAX_VALUE);
});

test('rarity-derived Coin rewards remain above 64-bit-safe integer scale', () => {
  const coins = coinsForRarity(1e308);
  assert.ok(Number.isFinite(coins));
  assert.ok(coins > Number.MAX_SAFE_INTEGER);
});

test('large finite Coin balances retain scientific-notation display', () => {
  assert.equal(formatNumber(1e100), '1.00e100');
  assert.equal(formatNumber(Number.MAX_VALUE), '1.80e308');
});

test('save, load, and admin grant paths preserve Coin balances above MAX_SAFE_INTEGER', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const debug = readFileSync(resolve(process.cwd(), 'src/server/debug.ts'), 'utf8');
  assert.match(server, /coins:\s*normalizeCoinAmount\(parsed\.coins\)/);
  assert.match(server, /lifetimeCoins:\s*normalizeCoinAmount\(parsed\.lifetimeCoins\s*\?\?\s*parsed\.coins\)/);
  assert.match(server, /s\.coins = normalizeCoinAmount\(s\.coins\)/);
  assert.match(server, /const currentCoins = normalizeCoinAmount\(s\.coins\)/);
  assert.match(debug, /s\.coins = coinDelta >= 0[\s\S]*?addCoinAmount\(s\.coins, coinDelta\)/);
});
