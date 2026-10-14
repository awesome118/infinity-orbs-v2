// [BOSS][TESTER] Keep level-gated API tests independent from the Level 1 reset-all assertion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('comprehensive API runner seeds an unlocked fixture after reset-all baseline', () => {
  const runner = readFileSync(resolve(process.cwd(), 'src/client/components/DevDebugModal.tsx'), 'utf8');
  const resetIndex = runner.indexOf('"API · Final fixture baseline"');
  const seedIndex = runner.indexOf("'API · Seed level-gated feature fixture'", resetIndex);
  const nextApiMutationIndex = runner.indexOf('"API · Nested upgrade state mutation"', resetIndex);

  assert.ok(resetIndex >= 0, 'reset-all baseline assertion must remain present');
  assert.ok(seedIndex > resetIndex, 'unlocked fixture must come after reset-all baseline');
  assert.ok(nextApiMutationIndex > seedIndex, 'unlocked fixture must precede stateful API tests');

  const fixture = runner.slice(seedIndex, nextApiMutationIndex);
  assert.match(fixture, /xp:\s*100_000/);
  assert.match(fixture, /level:\s*32/);
  assert.match(fixture, /Number\(state\.level\) < 20/);
});


test('admin API test request helper never retries HTTP 4xx responses', () => {
  const runner = readFileSync(resolve(process.cwd(), 'src/client/components/DevDebugModal.tsx'), 'utf8');
  const start = runner.indexOf('const request = async <T,>');
  const end = runner.indexOf('\n    const step = async <T,>', start);
  assert.ok(start >= 0 && end > start, 'admin API request helper boundaries must exist');

  const helper = runner.slice(start, end);
  const fetchTryEnd = helper.indexOf('} catch (error)');
  const successCheck = helper.indexOf('if (response.ok) return data as T;');
  const clientErrorGuard = helper.indexOf('if (response.status < 500 || attempt === 2) throw lastError;');
  assert.ok(fetchTryEnd > helper.indexOf('response = await fetch('),
    'network errors must be caught around fetch only');
  assert.ok(successCheck > fetchTryEnd,
    'HTTP response handling must be outside the network-error catch');
  assert.ok(clientErrorGuard > successCheck,
    'HTTP 4xx responses must throw without being swallowed or retried');
  assert.match(helper, /if \(response\.status < 500 \|\| attempt === 2\) throw lastError;/);
});

test('feature-level fixture is verified through the same /api/me read path used by feature gates', () => {
  const runner = readFileSync(resolve(process.cwd(), 'src/client/components/DevDebugModal.tsx'), 'utf8');
  const seedIndex = runner.indexOf("'API · Seed level-gated feature fixture'");
  const nextIndex = runner.indexOf('"API · Nested upgrade state mutation"', seedIndex);
  assert.ok(seedIndex >= 0 && nextIndex > seedIndex);
  const fixture = runner.slice(seedIndex, nextIndex);
  assert.match(fixture, /level:\s*32/);
  assert.match(fixture, /request<any>\('\/api\/me'\)/);
  assert.match(fixture, /Number\(state\.level\) < 20/);
  assert.match(fixture, /Number\(state\.xp\) < 100_000/);
});


test('admin roll helper clears cooldown before getting a fresh ticket and retries stale-ticket failures', () => {
  const runner = readFileSync(resolve(process.cwd(), 'src/client/components/DevDebugModal.tsx'), 'utf8');
  const start = runner.indexOf('const rollOnce = async');
  const end = runner.indexOf('const rollDetail', start);
  assert.ok(start >= 0 && end > start, 'admin roll helper boundaries must exist');
  const helper = runner.slice(start, end);

  const resetIndex = helper.indexOf("request('/api/dev/reset-cooldown'");
  const ticketIndex = helper.indexOf("request<{ ticketId: string; nextIndex: number }>('/api/roll-ticket')");
  const rollIndex = helper.indexOf("request<RollResponse>('/api/roll'");
  assert.ok(resetIndex >= 0 && ticketIndex > resetIndex && rollIndex > ticketIndex,
    'cooldown reset must commit before the fresh ticket is acquired and used');
  assert.match(helper, /message\.includes\('Roll prediction ticket is'\)/);
  assert.match(helper, /message\.includes\('Could not create a roll prediction ticket'\)/);
});
