import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('offline Frenzy owner rewards are accumulated only for offline owners and acknowledged separately', () => {
  const server = read('src/server/game.ts');
  const main = read('src/client/main.tsx');
  const pagesApi = read('src/pages/api.ts');
  const app = read('src/server/app.ts');

  assert.match(server, /if \(ownerWasOffline\) \{[\s\S]*pendingFrenzyOfflineClaimCount[\s\S]*pendingFrenzyOfflineShards/);
  assert.match(server, /export async function acknowledgeFrenzyOfflineReward/);
  assert.match(server, /s\.pendingFrenzyOfflineClaimCount = 0;[\s\S]*s\.pendingFrenzyOfflineShards = 0;/);
  assert.match(main, /pendingFrenzyOfflineClaimCount[\s\S]*people rolled[\s\S]*pendingFrenzyOfflineShards/);
  assert.match(main, /!frenzyRunTriggered/);
  assert.match(pagesApi, /\/api\/frenzy\/offline-reward\/ack/);
  assert.match(app, /\/api\/frenzy\/offline-reward\/ack/);
});

test('Frenzy post shows remaining daily claims instead of a personal claim timer', () => {
  const frenzy = read('src/client/frenzy.tsx');
  assert.match(frenzy, /Frenzy claims remaining today/);
  assert.match(frenzy, /claimsRemainingToday\} \/ \{claimLimit/);
  assert.match(frenzy, /Claims reset at midnight UTC/);
  assert.doesNotMatch(frenzy, /Your claim cooldown/);
  assert.doesNotMatch(frenzy, /FRENZY_CLAIM_COOLDOWN_MS/);
});

test('Reddit simulator is Pages-only and does not call Reddit or game APIs', () => {
  const main = read('src/client/main.tsx');
  const simulator = read('src/client/components/RedditPostSimulator.tsx');
  assert.match(main, /hostname\.endsWith\('\.github\.io'\)/);
  assert.match(main, /IS_GITHUB_PAGES_TEST && tab === 'reddit-simulator'/);
  assert.match(simulator, /Local preview only/);
  assert.match(simulator, /Claim Frenzy/);
  assert.doesNotMatch(simulator, /fetch\(|XMLHttpRequest|window\.open/);
});
