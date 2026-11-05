import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidAltarOfferingAmounts } from '../src/shared/game.js';

test('Altar accepts only whole non-negative offering amounts', () => {
  assert.equal(isValidAltarOfferingAmounts(0, 0), true);
  assert.equal(isValidAltarOfferingAmounts(1, 1), true);
  assert.equal(isValidAltarOfferingAmounts(1.5, 1), false);
  assert.equal(isValidAltarOfferingAmounts(1, 1.5), false);
  assert.equal(isValidAltarOfferingAmounts(-1, 0), false);
  assert.equal(isValidAltarOfferingAmounts(0, -1), false);
  assert.equal(isValidAltarOfferingAmounts(Number.NaN, 0), false);
  assert.equal(isValidAltarOfferingAmounts(Number.POSITIVE_INFINITY, 0), false);
});

test('Altar accepts very large whole Coin amounts but keeps Shards in the safe-integer range', () => {
  assert.equal(isValidAltarOfferingAmounts(1e100, 1), true);
  assert.equal(isValidAltarOfferingAmounts(Number.MAX_VALUE, Number.MAX_SAFE_INTEGER), true);
  assert.equal(isValidAltarOfferingAmounts(1, Number.MAX_SAFE_INTEGER + 1), false);
});

test('both the HTTP route and direct server mutation enforce the same Altar validator', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/server/app.ts'), 'utf8');
  const game = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const appRouteStart = app.indexOf("app.post('/api/altar/sacrifice'");
  const appRouteEnd = app.indexOf("app.post('/api/mastery/upgrade'", appRouteStart);
  const handlerStart = game.indexOf('export async function sacrificeToAltar');
  const handlerEnd = game.indexOf('export async function upgradeMasterySkill', handlerStart);

  assert.ok(appRouteStart >= 0 && appRouteEnd > appRouteStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(app.slice(appRouteStart, appRouteEnd), /isValidAltarOfferingAmounts/);
  assert.match(game.slice(handlerStart, handlerEnd), /isValidAltarOfferingAmounts/);
  assert.doesNotMatch(app.slice(appRouteStart, appRouteEnd), /Number\.isInteger\(Math\.floor\(/);
});
test('Altar lifetime Coin and Shard totals saturate instead of overflowing persisted stats', () => {
  const game = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const start = game.indexOf('export async function sacrificeToAltar');
  const end = game.indexOf('export async function upgradeMasterySkill', start);
  assert.ok(start >= 0 && end > start);
  const handler = game.slice(start, end);
  assert.match(handler, /sacrifices\.coinsSacrificed = addCoinAmount\(/);
  assert.match(handler, /sacrifices\.shardsSacrificed = roundShardAmount\(/);
  assert.doesNotMatch(handler, /sacrifices\.coinsSacrificed = \(sacrifices\.coinsSacrificed \?\? 0\) \+ numCoins/);
});
