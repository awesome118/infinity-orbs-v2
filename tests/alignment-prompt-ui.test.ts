import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Celestial Alignment ignores stale pending polls after a choice succeeds', () => {
  const main = source('src/client/main.tsx');

  assert.match(main, /alignmentDismissedPendingAtRef = useRef\(0\)/);
  assert.match(main, /const chosenPendingAt = alignmentStatus\?\.pendingAt \?\? 0/);
  assert.match(main, /alignmentDismissedPendingAtRef\.current = Math\.max\(alignmentDismissedPendingAtRef\.current, chosenPendingAt\)/);
  assert.match(main, /const pendingWasDismissed = status\.pending[\s\S]*?status\.pendingAt <= alignmentDismissedPendingAtRef\.current/);
  assert.match(main, /if \(pendingWasDismissed\) return;[\s\S]*?setAlignmentStatus\(status\)/);
  assert.match(main, /if \(!alignmentConfirmationRef\.current\) setAlignmentPromptVisible\(false\)/);
});

test('Celestial Alignment shows a 60-second confirmation and closes it automatically', () => {
  const main = source('src/client/main.tsx');

  assert.match(main, /closesAt: Date\.now\(\) \+ 60_000/);
  assert.match(main, /setAlignmentConfirmationSeconds\(60\)/);
  assert.match(main, /alignmentPromptVisible && \(alignmentConfirmation !== null \|\| alignmentStatus\?\.pending\)/);
  assert.match(main, /data-testid="celestial-alignment-confirmation"/);
  assert.match(main, /Confirmation closes in/);
  assert.match(main, /const remaining = Math\.max\(0, Math\.ceil\(\(closesAt - Date\.now\(\)\) \/ 1000\)\)/);
  assert.match(main, /if \(remaining <= 0\) \{[\s\S]*?setAlignmentPromptVisible\(false\)/);
});
