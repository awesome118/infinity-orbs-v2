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
  assert.deepEqual(parseAdminCliCommand('give coins 1e50'), {
    kind: 'player-save',
    commands: 'add coins 1e+50\nadd lifetimeCoins 1e+50',
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
  assert.throws(() => parseAdminCliCommand('give coins -10'), /finite, non-negative/);
  assert.throws(() => parseAdminCliCommand('boost fortune 20000'), /between 1 and 10,080/);
  const longReason = parseAdminCliCommand('menus disable ' + 'x'.repeat(400));
  assert.equal(longReason.kind, 'menus');
  if (longReason.kind === 'menus') assert.equal(longReason.reason.length, 300);
});

test('CLI supports global feature switches with defaults, reasons, and status listing', () => {
  assert.deepEqual(parseAdminCliCommand('feature combat disable'), {
    kind: 'feature', feature: 'combat', enabled: false, reason: 'The developer has disabled combat.',
  });
  assert.deepEqual(parseAdminCliCommand('feature guilds off "Guild maintenance"'), {
    kind: 'feature', feature: 'guilds', enabled: false, reason: 'Guild maintenance',
  });
  assert.deepEqual(parseAdminCliCommand('feature combat enable'), {
    kind: 'feature', feature: 'combat', enabled: true, reason: '',
  });
  assert.deepEqual(parseAdminCliCommand('features'), { kind: 'feature-list' });
  assert.throws(() => parseAdminCliCommand('feature trading disable'), /Unknown global feature/);
  assert.throws(() => parseAdminCliCommand('feature combat enable reason'), /Do not provide a reason/);
});

test('global feature request mapping blocks only the intended write routes', async () => {
  const { globalFeatureForRequest } = await import('../src/shared/admin-cli.js');
  assert.equal(globalFeatureForRequest('POST', '/api/roll'), 'rolling');
  assert.equal(globalFeatureForRequest('POST', '/auto-roll'), 'auto-roll');
  assert.equal(globalFeatureForRequest('POST', '/combat/beat'), 'combat');
  assert.equal(globalFeatureForRequest('POST', '/guilds/create'), 'guilds');
  assert.equal(globalFeatureForRequest('POST', '/prestige'), 'prestige');
  assert.equal(globalFeatureForRequest('POST', '/upgrade/batch'), 'upgrades');
  assert.equal(globalFeatureForRequest('POST', '/quests/claim'), 'quests');
  assert.equal(globalFeatureForRequest('POST', '/offline/claim'), 'offline');
  assert.equal(globalFeatureForRequest('POST', '/frenzy/start'), 'frenzy');
  assert.equal(globalFeatureForRequest('POST', '/chat'), 'chat');
  assert.equal(globalFeatureForRequest('GET', '/roll'), null);
  assert.equal(globalFeatureForRequest('POST', '/frenzy/simulator/create'), null);
  assert.equal(globalFeatureForRequest('POST', '/chat/report'), null);
});

test('maintenance alias controls the gameplay master switch', () => {
  assert.deepEqual(parseAdminCliCommand('maintenance on "Planned maintenance"'), {
    kind: 'feature', feature: 'gameplay', enabled: false, reason: 'Planned maintenance',
  });
  assert.deepEqual(parseAdminCliCommand('maintenance on'), {
    kind: 'feature', feature: 'gameplay', enabled: false, reason: 'The game is temporarily under maintenance.',
  });
  assert.deepEqual(parseAdminCliCommand('maintenance off'), {
    kind: 'feature', feature: 'gameplay', enabled: true, reason: '',
  });
  assert.deepEqual(parseAdminCliCommand('features list'), { kind: 'feature-list' });
});

test('global feature manifest covers distinct game systems and has unique IDs', async () => {
  const { GLOBAL_FEATURES } = await import('../src/shared/admin-cli.js');
  const ids = GLOBAL_FEATURES.map(feature => feature.id);
  assert.ok(ids.length >= 30);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'gameplay', 'rolling', 'auto-roll', 'offline', 'upgrades', 'mastery', 'boosters',
    'prestige', 'combat', 'dungeons', 'gear', 'skills', 'runes', 'arena',
    'social', 'guilds', 'chat', 'sharing', 'rewards', 'daily-rewards', 'quests',
    'community-rewards', 'events', 'frenzy', 'world-events', 'alignment',
    'global-boosters', 'notifications', 'popups', 'tutorials', 'leaderboards',
    'collection', 'feedback', 'purchases',
  ]) assert.ok(ids.includes(id), 'Missing feature switch: ' + id);
});

test('global feature route map supports master, parent, and granular switches', async () => {
  const { globalFeaturesForRequest } = await import('../src/shared/admin-cli.js');
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/roll'), ['gameplay', 'rolling']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/auto-roll'), ['gameplay', 'rolling', 'auto-roll']);
  assert.deepEqual(globalFeaturesForRequest('GET', '/api/roll-ticket'), ['gameplay', 'rolling']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/combat/dungeon'), ['gameplay', 'combat', 'dungeons']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/combat/forge'), ['gameplay', 'combat', 'gear']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/combat/skills/roll'), ['gameplay', 'combat', 'skills']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/combat/runes/equip'), ['gameplay', 'combat', 'runes']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/combat/arena/challenge'), ['gameplay', 'combat', 'arena']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/guilds/create'), ['gameplay', 'social', 'guilds']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/chat'), ['gameplay', 'social', 'chat']);
  assert.deepEqual(globalFeaturesForRequest('GET', '/api/leaderboards'), ['gameplay', 'leaderboards']);
  assert.deepEqual(globalFeaturesForRequest('GET', '/api/collection'), ['gameplay', 'collection']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/streak/claim'), ['gameplay', 'rewards', 'daily-rewards']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/quests/claim'), ['gameplay', 'rewards', 'quests']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/frenzy/claim'), ['gameplay', 'events', 'frenzy']);
  assert.deepEqual(globalFeaturesForRequest('GET', '/api/world-event'), ['gameplay', 'events', 'world-events']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/global-boosters/activate'), ['gameplay', 'global-boosters']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/notifications'), ['gameplay', 'notifications']);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/feedback'), ['gameplay', 'feedback']);
  assert.deepEqual(globalFeaturesForRequest('GET', '/api/products'), ['gameplay', 'purchases']);
});

test('global feature gate leaves admin, moderation reports, and telemetry available', async () => {
  const { globalFeaturesForRequest } = await import('../src/shared/admin-cli.js');
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/dev/cli/execute'), []);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/chat/report'), []);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/activity/heartbeat'), []);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/impressions'), []);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/impressions/conversion'), []);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/diagnostics/upgrade-rollback'), []);
  assert.deepEqual(globalFeaturesForRequest('POST', '/api/frenzy/simulator/create'), []);
});
