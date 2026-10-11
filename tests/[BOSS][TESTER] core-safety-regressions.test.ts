import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { masterySkillCost } from '../src/shared/game.js';

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('ticket API does not expose deterministic seeds or client-side reward prediction', () => {
  const server = source('src/server/game.ts');
  const client = source('src/client/main.tsx');
  const start = server.indexOf('export async function getRollTicket');
  const end = server.indexOf('async function loadRollTicketForUse', start);
  assert.ok(start >= 0 && end > start);
  const api = server.slice(start, end);
  assert.doesNotMatch(api, /seed\s*:\s*(?:current|ticket)\.seed/);
  assert.doesNotMatch(api, /seed:\s*number/);
  assert.doesNotMatch(client, /predictRollActivation|rollTicketSeed|ticket\.seed/);
  assert.doesNotMatch(server, /createSeededRandom\(rollTicketSeed/);
  assert.match(server, /await applyRolls\(s, 1, undefined, 'online'\)/);
});

test('a mutation invalidated by an account wipe reports failure instead of success', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('if (stateGeneration !== generation)');
  const end = server.indexOf('const latest = latestRaw', start);
  assert.ok(start >= 0 && end > start);
  const block = server.slice(start, end);
  assert.match(block, /invalidated by an admin wipe/);
  assert.doesNotMatch(block, /Object\.assign\(s, fresh\)|return;/);
});

test('mastery costs reject prototype keys and invalid levels', () => {
  assert.throws(() => masterySkillCost('constructor' as never, 0), /Unknown mastery skill/);
  assert.throws(() => masterySkillCost('__proto__' as never, 0), /Unknown mastery skill/);
  assert.throws(() => masterySkillCost('toString' as never, 0), /Unknown mastery skill/);
  assert.throws(() => masterySkillCost('continuumLuck', Number.NaN), /Mastery skill level is invalid/);
  assert.throws(() => masterySkillCost('continuumLuck', -1), /Mastery skill level is invalid/);
});

test('mastery endpoint validates the skill ID with an own-property check', () => {
  const app = source('src/server/app.ts');
  assert.match(app, /hasOwnProperty\.call\(MASTERY_SKILLS, skillId\)/);
});

test('game ban middleware fails closed if it cannot verify ban state', () => {
  const app = source('src/server/app.ts');
  const catchAt = app.indexOf("console.error('Game ban check failed:'");
  const end = app.indexOf("// Reddit's payment callback", catchAt);
  assert.ok(catchAt >= 0 && end > catchAt);
  assert.match(app.slice(catchAt, end), /return res\.status\(503\)\.json/);
});

test('prestige preserves the Shard balance', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('export async function prestige(');
  const end = server.indexOf('export async function buyPrestigeUpgrade', start);
  assert.ok(start >= 0 && end > start);
  const prestige = server.slice(start, end);
  assert.match(prestige, /const keptShards = Math\.max\(0, Math\.floor\(Number\(s\.shards \?\? 0\) \|\| 0\)\)/);
  assert.match(prestige, /s\.shards = keptShards/);
});

test('game viewport permits user zoom', () => {
  const html = source('src/client/game.html');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1\.0/);
});

test('community event config and persisted event data are validated before mutation', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /integerOption\('goal', config\.goal, 1\)/);
  assert.match(social, /function assertValidCommunityEvent/);
  assert.match(social, /function parseCommunityEventForMutation\(raw: unknown\)/);
  assert.match(social, /assertValidCommunityEvent\(ev\)/);
  assert.match(social, /const parsedEvent = sourceRaw == null \? null : parseCommunityEventForMutation\(sourceRaw\)/);
});

test('server RNG stays on 64-bit samples and never returns zero', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('function serverRandom()');
  const end = server.indexOf('\nfunction finiteNonNegative', start);
  assert.ok(start >= 0 && end > start);
  const rng = server.slice(start, end);
  assert.match(rng, /new BigUint64Array\(1\)/);
  assert.match(rng, /18_446_744_073_709_551_616/);
  assert.match(rng, /return Math\.max\(Number\.MIN_VALUE, value\)/);
});

test('player charge and shared Global Booster activation commit atomically', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('async function claimWorldBoosterActivation');
  const end = server.indexOf('export async function activateGlobalBooster', start);
  assert.ok(start >= 0 && end > start);
  const claim = server.slice(start, end);
  assert.match(claim, /await save\(s, \{/);
  assert.match(claim, /key: GLOBAL_BOOSTERS_KEY/);
  assert.match(claim, /expectedValue: prepared\.expectedValue/);
  assert.doesNotMatch(claim, /await updateGlobalBooster\(id\)/);
  assert.match(claim, /announcement\/audit projection failed/);
});

test('admin Global Booster state uses watched compare-and-set', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('export async function setGlobalBoosterDebugState');
  const end = server.indexOf('function playerKeyFor', start);
  assert.ok(start >= 0 && end > start);
  const setter = server.slice(start, end);
  assert.match(setter, /await redis\.watch\(GLOBAL_BOOSTERS_KEY\)/);
  assert.match(setter, /await txn\.exec\(\)/);
  assert.doesNotMatch(setter, /await redis\.set\(GLOBAL_BOOSTERS_KEY/);
});

test('Global Booster activation rejects inherited object keys at the service boundary', () => {
  const server = source('src/server/game.ts');
  const start = server.indexOf('export async function activateGlobalBooster(');
  const end = server.indexOf('export async function activatePremiumBooster(', start);
  assert.ok(start >= 0 && end > start);
  assert.match(server.slice(start, end), /hasOwnProperty\.call\(GLOBAL_BOOSTERS, id\)/);
});
