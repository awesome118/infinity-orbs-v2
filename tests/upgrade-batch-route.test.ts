import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UPGRADE_IDS,
  UPGRADE_UNLOCK_LEVELS,
  MAX_UPGRADE_PURCHASES_PER_REQUEST,
  PRESTIGE_UPGRADES,
  PREMIUM_BOOSTERS,
  AUTOMATIONS,
  GLOBAL_BOOSTERS,
  CELESTIAL_ALIGNMENT_CHOICES,
} from '../src/shared/game.js';
import { GUILD_PERK_IDS } from '../src/shared/social.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function routeBlock(sourceText: string, startMarker: string, endMarker: string): string {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing route: ${startMarker}`);
  assert.ok(end > start, `missing route boundary: ${endMarker}`);
  return sourceText.slice(start, end);
}

test('standard upgrade IDs match the shared unlock catalog', () => {
  assert.deepEqual([...UPGRADE_IDS].sort(), Object.keys(UPGRADE_UNLOCK_LEVELS).sort());
});

test('single and batch upgrade routes both accept the complete shared upgrade catalog', () => {
  const app = source('src/server/app.ts');
  const game = source('src/server/game.ts');
  const singleRoute = routeBlock(app, "app.post('/api/upgrade'", "app.post('/api/upgrade/batch'");
  const batchRoute = routeBlock(app, "app.post('/api/upgrade/batch'", "app.post('/api/diagnostics/upgrade-rollback'");
  const purchaseHandler = game.slice(game.indexOf('export async function buyUpgradeBatch'), game.indexOf('export function autoBuyCheapest'));

  assert.match(singleRoute, /UPGRADE_IDS\.includes/);
  assert.match(batchRoute, /UPGRADE_IDS\.includes/);
  assert.match(purchaseHandler, /UPGRADE_IDS\.includes/);
  for (const id of ['offlineFoundry', 'orbFingers', 'criticalDividend']) {
    assert.ok(UPGRADE_IDS.includes(id as (typeof UPGRADE_IDS)[number]));
  }
});

test('prestige route accepts only upgrades in the current prestige catalog', () => {
  const app = source('src/server/app.ts');
  const route = routeBlock(app, "app.post('/api/prestige/upgrade'", "app.post('/api/prestige/synthesize'");
  assert.match(route, /hasOwnProperty\.call\(PRESTIGE_UPGRADES, id\)/);
  assert.doesNotMatch(route, /masteryEngine/);
  assert.ok(Object.keys(PRESTIGE_UPGRADES).length > 0);
});

test('booster and automation routes validate against their live shared catalogs', () => {
  const app = source('src/server/app.ts');
  assert.match(routeBlock(app, "app.post('/api/global-boosters/activate'", "app.get('/api/world-event'"), /hasOwnProperty\.call\(GLOBAL_BOOSTERS, id\)/);
  assert.match(routeBlock(app, "app.post('/api/boosters/activate'", "app.post('/api/automation/buy'"), /hasOwnProperty\.call\(PREMIUM_BOOSTERS, id\)/);
  assert.match(routeBlock(app, "app.post('/api/automation/buy'", "app.post('/api/community/reward/claim'"), /hasOwnProperty\.call\(AUTOMATIONS, id\)/);

  assert.deepEqual(Object.keys(GLOBAL_BOOSTERS).sort(), ['crit', 'luck', 'speed']);
  assert.ok(Object.keys(PREMIUM_BOOSTERS).length > 0);
  assert.ok(Object.keys(AUTOMATIONS).length > 0);
});

test('Guild perk and Celestial Alignment routes and server stats share their catalogs', () => {
  const app = source('src/server/app.ts');
  const game = source('src/server/game.ts');
  assert.match(routeBlock(app, "app.post('/api/alignment/choose'", "app.post('/api/cosmetics/buy'"), /CELESTIAL_ALIGNMENT_CHOICES\.includes/);
  assert.match(routeBlock(app, "app.post('/api/guilds/perk'", "app.post('/api/guilds/trust'"), /GUILD_PERK_IDS\.includes/);
  assert.match(game, /CELESTIAL_ALIGNMENT_CHOICES,/);
  assert.doesNotMatch(game, /const CELESTIAL_ALIGNMENT_CHOICES\s*=/);
  assert.ok(CELESTIAL_ALIGNMENT_CHOICES.length >= 3);
  assert.ok(GUILD_PERK_IDS.includes('tokenYieldRank'));
  assert.ok(GUILD_PERK_IDS.includes('taskBountyRank'));
});

test('Buy All shares its safety cap and reports when more affordable upgrades remain', () => {
  const server = source('src/server/game.ts');
  const client = source('src/client/main.tsx');
  const handler = server.slice(server.indexOf('export async function buyAllUpgrades'), server.indexOf('export async function claimDailyStreak'));

  assert.equal(MAX_UPGRADE_PURCHASES_PER_REQUEST, 5_000);
  assert.match(handler, /upgradedCount < MAX_UPGRADE_PURCHASES_PER_REQUEST/);
  assert.match(handler, /purchaseLimitReached = upgradedCount >= MAX_UPGRADE_PURCHASES_PER_REQUEST/);
  assert.match(handler, /return \{ state: s, totalSpent, upgradedCount, purchaseLimitReached \}/);
  assert.match(client, /purchases < MAX_UPGRADE_PURCHASES_PER_REQUEST/);
  assert.match(client, /res\.purchaseLimitReached/);
  assert.match(client, /run Buy All again to continue/);
});
