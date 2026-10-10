import test from 'node:test';
import assert from 'node:assert/strict';

import { getActivePlayerMutationLock, withPlayerMutationLockFor } from '../src/server/player-lock.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('player mutation lock serializes same-player operations in one runtime', async () => {
  let active = 0;
  let maxActive = 0;
  const order: number[] = [];

  const operation = (id: number) => withPlayerMutationLockFor('lock-test-player', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push(id);
    await delay(10);
    active -= 1;
  });

  await Promise.all([operation(1), operation(2), operation(3), operation(4)]);

  assert.equal(maxActive, 1);
  assert.deepEqual(order, [1, 2, 3, 4]);
});

test('player mutation lock releases cleanly after a failed operation', async () => {
  await assert.rejects(
    withPlayerMutationLockFor('lock-test-failure', async () => {
      throw new Error('expected test failure');
    }),
    /expected test failure/,
  );

  let ran = false;
  await withPlayerMutationLockFor('lock-test-failure', async () => {
    ran = true;
  });

  assert.equal(ran, true);
});


test('active player lock exposes its fencing token only while ownership is held', async () => {
  const userId = 'lock-fencing-player';
  let token: string | null = null;
  await withPlayerMutationLockFor(userId, async () => {
    const active = getActivePlayerMutationLock(userId);
    assert.ok(active);
    assert.match(active!.key, /lock-fencing-player$/);
    assert.ok(active!.token.length > 0);
    token = active!.token;
    assert.equal(getActivePlayerMutationLock(userId)?.token, token);
  });

  assert.equal(getActivePlayerMutationLock(userId), null);
});
