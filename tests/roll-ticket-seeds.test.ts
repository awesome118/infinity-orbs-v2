import test from 'node:test';
import assert from 'node:assert/strict';
import { createRollRandomSource } from '../src/shared/roll-rng.js';

test('roll seed streams are deterministic', () => {
  const seed = '0123456789abcdef'.repeat(4);
  const a = createRollRandomSource(seed);
  const b = createRollRandomSource(seed);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(a.next(), b.next());
    assert.equal(a.nextRarity(), b.nextRarity());
  }
});
