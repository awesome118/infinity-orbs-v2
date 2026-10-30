import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addCoinAmount,
  addCollectionValue,
  altarCoinFloor,
  coinsForRarity,
  formatNumber,
  normalizeCoinAmount,
} from '../src/shared/game.js';

test('Coin balances and rewards can grow beyond the JavaScript safe-integer threshold', () => {
  const beyondSafeInteger = 1e30;
  const normalizedLargeBalance = normalizeCoinAmount(beyondSafeInteger);
  assert.equal(normalizedLargeBalance, Math.floor(beyondSafeInteger));
  assert.equal(addCoinAmount(Number.MAX_SAFE_INTEGER, beyondSafeInteger), normalizedLargeBalance);
  const accumulated = addCoinAmount(1e200, 2e200);\n  assert.ok(Number.isFinite(accumulated));\n  assert.ok(accumulated > Number.MAX_SAFE_INTEGER);
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
