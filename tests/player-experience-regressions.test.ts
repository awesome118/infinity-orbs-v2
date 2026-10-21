import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImpressionCount } from '../src/server/impressions.js';
import { classifyImpressionDeviceType } from '../src/client/impressions.js';

test('impression counters reject partial, negative, fractional, and unsafe values', () => {
  assert.equal(normalizeImpressionCount('123'), 123);
  assert.equal(normalizeImpressionCount('0'), 0);
  assert.equal(normalizeImpressionCount('12garbage'), 0);
  assert.equal(normalizeImpressionCount('-1'), 0);
  assert.equal(normalizeImpressionCount('1.5'), 0);
  assert.equal(normalizeImpressionCount(String(Number.MAX_SAFE_INTEGER + 1)), 0);
});

test('coarse device classification identifies Android tablets and unknown environments', () => {
  assert.equal(classifyImpressionDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel C) AppleWebKit/537.36', 'Linux arm', 5), 'tablet');
  assert.equal(classifyImpressionDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 9 Mobile) Mobile', 'Linux arm', 5), 'mobile');
  assert.equal(classifyImpressionDeviceType('', '', 0), 'unknown');
  assert.equal(classifyImpressionDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)', 'MacIntel', 0), 'desktop');
});
