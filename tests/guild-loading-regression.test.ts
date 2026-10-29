import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Guild polling is not skipped when the world-event endpoint fails', () => {
  const main = source('src/client/main.tsx');
  const start = main.indexOf('const refreshCommunityState = async () =>');
  const end = main.indexOf('\n    const onVisibilityChange', start);
  assert.ok(start >= 0 && end > start, 'community polling effect must exist');
  const poll = main.slice(start, end);
  assert.match(poll, /getJson<WorldEvent \| null>\('\/api\/world-event'\)\.catch\(\(\) => null\)/);
  assert.match(poll, /getJson<\{ guilds: Guild\[\]; mine: Guild \| null \}>\('\/api\/guilds', \{ cache: 'no-store' \}\)/);
  assert.ok(poll.indexOf("'/api/world-event'") < poll.indexOf("'/api/guilds'"));
  assert.match(poll, /Guild data could not be loaded/);
});

test('Failed Guild requests no longer erase data and are shown with a retry action', () => {
  const main = source('src/client/main.tsx');
  const guildUi = source('src/client/components/GuildsAndSocial.tsx');
  assert.doesNotMatch(main, /catch\(\(\) => \(\{ guilds: \[\], mine: null \}\)\)/);
  assert.match(main, /if \(gd\.data\) \{\s*setGuildData\(gd\.data\)/);
  assert.match(main, /setGuildLoadError\(error instanceof Error \? error\.message/);
  assert.match(guildUi, /Guild data could not be loaded/);
  assert.match(guildUi, /Retry loading/);
});
