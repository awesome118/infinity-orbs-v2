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
  assert.doesNotMatch(simulatorServer, /reddit\.submitCustomPost\s*\(/);

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

test('Rift first-clear announcements and simulator use the registered rift custom-post entry', () => {
  const game = read('src/server/game.ts');
  const riftServer = read('src/server/rift-challenges.ts');
  const app = read('src/server/app.ts');
  const pagesApi = read('src/pages/api.ts');
  const simulator = read('src/client/components/RedditPostSimulator.tsx');
  const riftEntry = read('src/client/rift.tsx');
  const riftHtml = read('src/client/rift.html');
  const devvit = read('devvit.json');
  const pagesBuild = read('vite.pages.config.ts');

  assert.match(game, /let firstClear = false/);
  assert.match(game, /firstClear = !completedIds\.includes\(challenge\.id\)/);
  assert.match(game, /state\.riftChallengeFirstClear = \{/);
  assert.match(game, /delete stored\.riftChallengeFirstClear/);
  assert.match(riftServer, /export async function registerRiftCompletionPost/);
  assert.match(riftServer, /export async function getRiftCompletionPostInfo/);
  assert.match(riftServer, /export async function createRiftCompletionSimulatorPost/);
  assert.match(app, /result\.state\?\.riftChallengeFirstClear/);
  assert.match(app, /reddit\.submitCustomPost\([\s\S]*?entry: 'rift'/);
  assert.match(app, /registerRiftCompletionPost\(/);
  assert.match(app, /app\.get\('\/api\/rift-completion\/info'/);
  assert.match(pagesApi, /riftChallenges\.createRiftCompletionSimulatorPost\(body\.challengeId\)/);
  assert.match(pagesApi, /riftChallenges\.getRiftCompletionPostInfo\(url\.searchParams\.get\('postId'\)\)/);
  assert.match(simulator, /Rift first-clear post/);
  assert.match(simulator, /\/api\/rift-completion\/simulator\/create/);
  assert.match(simulator, /rift\.html/);
  assert.match(riftEntry, /previewPostId/);
  assert.match(riftEntry, /\/api\/rift-completion\/info/);
  assert.match(riftEntry, /Simulator preview/);
  assert.match(riftHtml, /rift\.tsx/);
  assert.match(devvit, /"rift": \{[\s\S]*?"entry": "rift\.html"/);
  assert.match(pagesBuild, /rift: path\.join\(clientRoot, 'rift\.html'\)/);
});
