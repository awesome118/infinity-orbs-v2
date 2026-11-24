import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('GitHub Pages boots the actual React game with persistent mock services and full Rift progression', () => {
  const build = read('vite.pages.config.ts');
  const api = read('src/pages/api.ts');
  const mock = read('src/server/devvit-mock.ts');
  const client = read('src/client/main.tsx');
  const challengeUi = read('src/client/components/RiftChallengesSection.tsx');
  const shared = read('src/shared/rift-challenges.ts');
  const server = read('src/server/rift-challenges.ts');
  assert.match(build, /root: clientRoot/);
  assert.match(build, /main\.tsx/);
  assert.match(build, /dist-pages/);
  assert.match(api, /getRiftChallengeStatus/);
  assert.match(api, /startRiftChallenge\(body\.challengeId\)/);
  assert.match(api, /rollRiftChallenge/);
  assert.match(api, /buyRiftChallengeUpgrade/);
  assert.match(api, /buyRiftPerk\(body\.perkId\)/);
  assert.match(api, /abandonRiftChallenge/);
  assert.match(mock, /BROWSER_STORAGE_PREFIX/);
  assert.match(mock, /localStorage/);
  assert.match(client, /RiftChallengesSection/);
  assert.match(client, /riftChallengesMode = tab === 'challenges'/);
  assert.match(client, /renderNavItem\('reddit-simulator', 'Reddit Simulator', MessageSquare\)/);
  assert.match(client, /renderNavItem\('challenges', 'Rift Progression', Compass\)/);
  assert.doesNotMatch(client, /renderNavItem\('challenges', 'Challenges', Compass\)/);
  assert.match(challengeUi, /\/api\/rift-challenges\/roll/);
  assert.match(challengeUi, /\/api\/rift-challenges\/perk/);
  assert.match(shared, /RIFT_BASE_RATE_PER_HOUR = 1/);
  assert.match(shared, /fractured-tempo/);
  assert.match(shared, /hollow-economy/);
  assert.match(server, /accrueRiftProgress/);
});
