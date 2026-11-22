import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminCliCommand } from '../src/shared/admin-cli.js';

test('CLI can disable menus globally with a developer reason and re-enable them', () => {
  assert.deepEqual(parseAdminCliCommand('menus disable'), {
    kind: 'menus',
    enabled: false,
    reason: 'The developer has disabled the menus.',
  });
  assert.deepEqual(parseAdminCliCommand('menus off "Maintenance window"'), {
    kind: 'menus',
    enabled: false,
    reason: 'Maintenance window',
  });
  assert.deepEqual(parseAdminCliCommand('menus enable'), {
    kind: 'menus',
    enabled: true,
    reason: '',
  });
});

test('CLI supports global developer announcements', () => {
  assert.deepEqual(parseAdminCliCommand('announce "We are performing maintenance."'), {
    kind: 'announcement',
    message: 'We are performing maintenance.',
  });
  assert.deepEqual(parseAdminCliCommand('announce clear'), {
    kind: 'announcement',
    message: '',
  });
});

test('CLI maps player grants and cooldown actions to guarded save commands', () => {
  assert.deepEqual(parseAdminCliCommand('give coins 250'), {
    kind: 'player-save',
    commands: 'add coins 250\nadd lifetimeCoins 250',
    invalidateRollTicket: false,
  });
  assert.deepEqual(parseAdminCliCommand('give shards 10'), {
    kind: 'player-save',
    commands: 'add shards 10\nadd lifetimeShards 10',
    invalidateRollTicket: false,
  });
  assert.deepEqual(parseAdminCliCommand('cooldown ready'), {
    kind: 'player-save',
    commands: 'set lastRollAt 0',
    invalidateRollTicket: true,
  });
});

test('CLI maps upgrade, mastery, prestige, booster, and offline commands', () => {
  assert.equal(parseAdminCliCommand('upgrade speed 20').kind, 'player-save');
  assert.equal(parseAdminCliCommand('upgrade speed 20').commands, 'set upgrades.speed 20');
  assert.equal(parseAdminCliCommand('mastery continuumLuck 50').commands, 'set masterySkills.continuumLuck 50');
  assert.equal(parseAdminCliCommand('prestige-upgrade permLuck 10').commands, 'set prestigeUpgrades.permLuck 10');
  assert.match(parseAdminCliCommand('boost fortune 30').commands, /^set activeBoosters\.fortune \d+$/);
  assert.equal(parseAdminCliCommand('offline add 25').commands, 'add offlineRolls 25');
  assert.equal(parseAdminCliCommand('offline set 0').commands, 'set offlineRolls 0');
});

test('CLI passes bounded save-command batches through without evaluating code', () => {
  const parsed = parseAdminCliCommand([
    '# Player save batch',
    'set coins 1e30',
    'add shards 5',
    'set upgrades.speed 20',
  ].join('\n'));
  assert.equal(parsed.kind, 'player-save');
  assert.equal(parsed.commands, 'set coins 1e30\nadd shards 5\nset upgrades.speed 20');
  assert.throws(() => parseAdminCliCommand('run process.exit(1)'), /accept only set, add, subtract, and delete/);
  assert.throws(() => parseAdminCliCommand('menus disable\nset coins 0'), /accept only set, add, subtract, and delete/);
});

test('CLI enforces positive and bounded grant arguments', () => {
  assert.throws(() => parseAdminCliCommand('give coins 0'), /greater than zero/);
  assert.throws(() => parseAdminCliCommand('give shards 1.5'), /whole numbers/);
  assert.throws(() => parseAdminCliCommand('offline add -10'), /finite, non-negative/);
  assert.throws(() => parseAdminCliCommand('boost fortune 20000'), /between 1 and 10,080/);
  const longReason = parseAdminCliCommand('menus disable ' + 'x'.repeat(400));
  assert.equal(longReason.kind, 'menus');
  if (longReason.kind === 'menus') assert.equal(longReason.reason.length, 300);
});
