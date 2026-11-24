import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Pages Reddit Simulator is a standalone page backed by the real Frenzy preview and claim engine', () => {
  const main = read('src/client/main.tsx');
  const simulator = read('src/client/components/RedditPostSimulator.tsx');
  const frenzy = read('src/client/frenzy.tsx');
  const api = read('src/pages/api.ts');
  const game = read('src/server/game.ts');
  const moreMenuStart = main.indexOf('id="io-more-navigation"');
  assert.ok(moreMenuStart >= 0);
  const moreMenuEnd = main.indexOf('                </div>\n                <button\n                  type="button"\n                  onClick={() => changeTab(\'fight\')}', moreMenuStart);
  assert.ok(moreMenuEnd > moreMenuStart);
  assert.doesNotMatch(main.slice(moreMenuStart, moreMenuEnd), /reddit-simulator/);
  assert.match(main, /IS_GITHUB_PAGES_TEST/);
  assert.match(main, /redditSimulatorMode/);
  assert.match(main, /io-nav-reddit-simulator/);
  assert.match(main, /RedditPostSimulator/);
  assert.match(main, /Back to Orbs/);
  assert.match(simulator, /\/api\/frenzy\/simulator\/create/);
  assert.match(simulator, /frenzy\.html/);
  assert.match(frenzy, /previewPostId/);
  assert.match(frenzy, /\/api\/frenzy\/simulator\/info/);
  assert.match(frenzy, /\/api\/frenzy\/simulator\/claim/);
  assert.match(frenzy, /io-frenzy-preview-claimed/);
  assert.match(api, /game\.createFrenzySimulatorPost\(body.rarity\)/);
  assert.match(game, /export async function createFrenzySimulatorPost/);
  assert.match(game, /buildFrenzyPostSubmission/);
  assert.match(game, /options\.allowAdminTestOwner/);
});
