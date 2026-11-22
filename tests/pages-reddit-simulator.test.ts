import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Pages simulator previews the exact Reddit payload and custom Frenzy entry used by real posts', () => {
  const server = read('src/server/game.ts');
  const pagesApi = read('src/pages/api.ts');
  const simulator = read('src/client/components/RedditPostSimulator.tsx');
  const frenzyEntry = read('src/client/frenzy.tsx');
  const pagesBuild = read('vite.pages.config.ts');

  const builderStart = server.indexOf('async function buildFrenzyPostSubmission');
  const builderEnd = server.indexOf('export async function startOrbFrenzy', builderStart);
  assert.ok(builderStart >= 0 && builderEnd > builderStart);
  const builder = server.slice(builderStart, builderEnd);
  assert.match(builder, /getPostFlairOptions\(subredditName, 'frenzy'\)/);
  assert.match(builder, /entry: 'frenzy'/);
  assert.match(builder, /userGeneratedContent: \{ text: body \}/);
  assert.match(builder, /FRENZY_CLAIMS_PER_DAY/);
  assert.match(builder, /FRENZY_OWNER_SHARD_REWARD/);

  const start = server.indexOf('export async function startOrbFrenzy');
  const simulatorStart = server.indexOf('export async function createFrenzySimulatorPost');
  const simulatorEnd = server.indexOf('export async function getOrbFrenzyInfo', simulatorStart);
  assert.ok(start >= 0 && simulatorStart > start && simulatorEnd > simulatorStart);
  assert.match(server.slice(start, simulatorStart), /buildFrenzyPostSubmission\([\s\S]*?reddit\.submitCustomPost\(postSubmission\)/);
  const simulatorServer = server.slice(simulatorStart, simulatorEnd);
  assert.match(simulatorServer, /buildFrenzyPostSubmission\(/);
  assert.match(simulatorServer, /adminTest: true/);
  assert.match(simulatorServer, /FRENZY_POST_PREFIX \+ postId/);
  assert.doesNotMatch(simulatorServer, /reddit\.submitCustomPost/);

  assert.match(pagesApi, /createFrenzySimulatorPost\(body\.rarity\)/);
  assert.match(pagesApi, /game\.claimOrbFrenzy\(\{[\s\S]*?postId,[\s\S]*?allowAdminTestOwner: true/);
  assert.match(simulator, /Orb rarity to publish/);
  assert.match(simulator, /frenzy\.html/);
  assert.match(simulator, /io-frenzy-preview-claimed/);
  assert.match(simulator, /post\.title/);
  assert.match(simulator, /post\.body/);
  assert.match(frenzyEntry, /previewPostId/);
  assert.match(frenzyEntry, /\/api\/frenzy\/simulator\/info/);
  assert.match(frenzyEntry, /\/api\/frenzy\/simulator\/claim/);
  assert.match(frenzyEntry, /window\.parent\.postMessage/);
  assert.match(frenzyEntry, /if \(previewPostId \|\| impressionRecordedRef\.current\) return;/);
  assert.match(pagesBuild, /frenzy: path\.join\(clientRoot, 'frenzy\.html'\)/);
});
