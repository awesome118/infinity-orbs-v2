import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Pages simulator posts use the same stored record contract and claim payout path as a real Frenzy', () => {
  const server = read('src/server/game.ts');
  const pagesApi = read('src/pages/api.ts');
  const ui = read('src/client/components/RedditPostSimulator.tsx');

  const createStart = server.indexOf('export async function createFrenzySimulatorPost');
  const createEnd = server.indexOf('export async function getOrbFrenzyInfo', createStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  const create = server.slice(createStart, createEnd);
  assert.match(create, /ownerId,[\s\S]*ownerUsername,[\s\S]*rarity,[\s\S]*isInfinity,[\s\S]*adminTest: true,[\s\S]*inGame: true/);
  assert.match(create, /FRENZY_POST_PREFIX \+ postId/);
  assert.match(create, /reddit\.submitCustomPost/);
  assert.match(create, /FRENZY_OWNER_SHARD_REWARD/);

  assert.match(pagesApi, /getOrbFrenzyInfo\(\{ postId, allowAdminTestOwner: true \}\)/);
  assert.match(pagesApi, /game\.claimOrbFrenzy\(\{[\s\S]*postId,[\s\S]*allowAdminTestOwner: true/);
  assert.match(ui, /Orb rarity to publish/);
  assert.match(ui, /Create new post/);
  assert.match(ui, /Claim Frenzy/);
  assert.match(ui, /info\.rewardOrbCount/);
  assert.match(ui, /info\.claimsRemainingToday/);
});
