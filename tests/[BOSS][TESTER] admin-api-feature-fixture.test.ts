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
