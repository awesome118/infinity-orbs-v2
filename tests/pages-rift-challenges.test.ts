import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('GitHub Pages boots the actual React game with persistent mock services and Rift Challenges', () => {
  const build = read('vite.pages.config.ts');
  const api = read('src/pages/api.ts');
  const mock = read('src/server/devvit-mock.ts');
  const client = read('src/client/main.tsx');
  const challengeUi = read('src/client/components/RiftChallengesSection.tsx');
  assert.match(build, /root: clientRoot/);
  assert.match(build, /main\.tsx/);
  assert.match(build, /dist-pages/);
  assert.match(api, /getRiftChallengeStatus/);
  assert.match(api, /startRiftChallenge/);
  assert.match(api, /rollRiftChallenge/);
  assert.match(api, /buyRiftChallengeUpgrade/);
  assert.match(api, /abandonRiftChallenge/);
  assert.match(mock, /BROWSER_STORAGE_PREFIX/);
  assert.match(mock, /localStorage/);
  assert.match(client, /RiftChallengesSection/);
  assert.match(client, /tab === 'challenges'/);
  assert.match(challengeUi, /\/api\/rift-challenges\/roll/);
});
