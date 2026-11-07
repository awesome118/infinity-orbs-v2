import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compressStorageString } from '../src/server/storage-compression.js';
import { readRedisLargeValue } from '../src/server/redis-large-values.js';

test('Highest Depth leaderboard decodes compressed and chunked Combat save records', () => {
  const social = readFileSync(resolve(process.cwd(), 'src/server/social.ts'), 'utf8');
  const start = social.indexOf('async function buildLeaderboardsSnapshot');
  const end = social.indexOf('interface PlayerRegistryLeaderboardEntry', start);
  assert.ok(start >= 0 && end > start);
  const block = social.slice(start, end);

  assert.match(block, /readRedisLargeValue\('infinity-orbs:combat:' \+ userId, storedValue\)/);
  assert.match(block, /decodedCombatSaves/);
  assert.match(block, /parseStoredJson<unknown>\(decodedCombatSaves\[index\]\)/);
  assert.match(block, /Combat save could not be decoded for depth ranking/);
});

test('shared large-value reader restores a compressed Combat leaderboard depth payload', async () => {
  const key = 'infinity-orbs:combat:leaderboard-decode-test';
  const combat = {
    dungeonId: 'glass-labyrinth',
    depth: 12_345,
    bestDepth: 12_345,
    dungeonBestDepths: {
      undercrypt: 200,
      'cinder-vault': 4_000,
      'glass-labyrinth': 12_345,
    },
    dungeonBossesBeaten: { undercrypt: 20, 'cinder-vault': 400, 'glass-labyrinth': 1_234 },
    inventory: Array.from({ length: 300 }, (_, index) => ({
      id: 'gear-' + index,
      name: 'Celestial Guardian Equipment ' + index,
      slot: 'weapon',
      quality: 100,
      damageBonus: 1.25,
      effect: 'A deliberately repetitive payload used to exercise compressed Combat saves.',
      majorAbility: { id: 'chrono-surge', description: 'Shortens the global Combat beat timer.' },
    })),
  };
  const serialized = JSON.stringify(combat);
  const compressed = compressStorageString(serialized);
  assert.ok(compressed.startsWith('ioz1:'));
  assert.equal(await readRedisLargeValue(key, compressed), serialized);
});
