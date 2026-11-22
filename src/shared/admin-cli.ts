/**
 * Admin Console command grammar. Intentionally not a JavaScript interpreter.
 * The caller still has to pass the server-side admin gate before this parser
 * is reached.
 */

export const GLOBAL_FEATURES = [
  { id: 'gameplay', label: 'Gameplay', description: 'Master switch for all classified player-facing game actions and sections' },
  { id: 'rolling', label: 'Rolling', description: 'Manual orb rolls and roll-ticket requests' },
  { id: 'auto-roll', label: 'Auto rolling', description: 'Automated rolling' },
  { id: 'offline', label: 'Offline rewards', description: 'Offline roll claims' },
  { id: 'upgrades', label: 'Upgrades', description: 'Regular upgrades and purchase-based progression' },
  { id: 'mastery', label: 'Mastery', description: 'Mastery skill upgrades' },
  { id: 'boosters', label: 'Boosters and automation', description: 'Personal boosters, automation, and Turbo' },
  { id: 'cosmetics', label: 'Cosmetics', description: 'Cosmetic purchases and unlocks' },
  { id: 'prestige', label: 'Prestige', description: 'Prestige resets, permanent upgrades, and synthesis' },
  { id: 'combat', label: 'Combat', description: 'All combat actions and combat data' },
  { id: 'dungeons', label: 'Dungeons', description: 'Dungeon encounters and progression' },
  { id: 'gear', label: 'Combat gear', description: 'Gear equip, forge, scrap, and auto-scrap' },
  { id: 'skills', label: 'Combat skills', description: 'Combat skill rolls, equipment, and rank-ups' },
  { id: 'runes', label: 'Combat runes', description: 'Rune equipment, sacrifice, and auto-sacrifice' },
  { id: 'arena', label: 'Combat arena', description: 'Arena opponents and challenges' },
  { id: 'social', label: 'Social systems', description: 'Master switch for guilds, chat, sharing, and community interactions' },
  { id: 'guilds', label: 'Guilds', description: 'Guild creation, membership, perks, trust, and moderation actions' },
  { id: 'chat', label: 'Global Chat', description: 'Viewing and posting Global Chat messages; reports remain available' },
  { id: 'sharing', label: 'Sharing', description: 'Reddit sharing actions' },
  { id: 'rewards', label: 'Rewards', description: 'Master switch for claimable player rewards' },
  { id: 'daily-rewards', label: 'Daily rewards', description: 'Daily streak claims' },
  { id: 'quests', label: 'Quests', description: 'Daily and weekly quest claims' },
  { id: 'community-rewards', label: 'Community rewards', description: 'Follow and community reward claims' },
  { id: 'events', label: 'Events', description: 'Master switch for Frenzy and world events' },
  { id: 'frenzy', label: 'Frenzy', description: 'Frenzy creation, claiming, and event interactions' },
  { id: 'world-events', label: 'World events', description: 'World-event status and interactions' },
  { id: 'alignment', label: 'Celestial Alignment', description: 'Alignment status and choices' },
  { id: 'global-boosters', label: 'Global boosters', description: 'Global booster status and activation' },
  { id: 'notifications', label: 'Notifications', description: 'Player notification preferences' },
  { id: 'popups', label: 'Popups', description: 'Player popup configuration and tracking' },
  { id: 'tutorials', label: 'Tutorials', description: 'First-roll and combat tutorial state' },
  { id: 'leaderboards', label: 'Leaderboards', description: 'Leaderboard and ranking views' },
  { id: 'collection', label: 'Collection', description: 'Codex and collection views' },
  { id: 'feedback', label: 'Feedback', description: 'Player feedback submissions' },
  { id: 'purchases', label: 'Purchases', description: 'Product catalog and purchase reconciliation' },
] as const;

export type GlobalFeatureId = typeof GLOBAL_FEATURES[number]['id'];

export type ParsedAdminCliCommand =
  | { kind: 'menus'; enabled: boolean; reason: string }
  | { kind: 'announcement'; message: string }
  | { kind: 'feature'; feature: GlobalFeatureId; enabled: boolean; reason: string }
  | { kind: 'feature-list' }
  | { kind: 'player-save'; commands: string; invalidateRollTicket: boolean };

const DEFAULT_MENU_DISABLED_REASON = 'The developer has disabled the menus.';
const MAX_CLI_SCRIPT_LENGTH = 12_000;
const MAX_CLI_COMMANDS = 50;


export function globalFeaturesForRequest(method: string, path: string): GlobalFeatureId[] {
  const verb = String(method ?? '').toUpperCase();
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(verb);
  const isRead = verb === 'GET' || verb === 'HEAD';
  if (!isWrite && !isRead) return [];

  const normalizedPath = String(path ?? '').split('?')[0]!.replace(/^\/api(?=\/)/, '');
  if (normalizedPath === '/chat/report' || normalizedPath.startsWith('/dev/')) return [];

  const game = (...features: GlobalFeatureId[]): GlobalFeatureId[] => ['gameplay', ...features];

  // Rolling and its read-side ticket/progress endpoints.
  if (normalizedPath === '/roll' && isWrite) return game('rolling');
  if (normalizedPath === '/roll-ticket' && isRead) return game('rolling');
  if (normalizedPath === '/auto-roll' && isWrite) return game('rolling', 'auto-roll');
  if (normalizedPath === '/time-energy/progress' && isRead) return game('rolling');

  // Combat is a parent switch. Individual systems can also be disabled without
  // taking down the rest of combat.
  if (normalizedPath === '/combat/tutorial/status' && isRead) return game('combat', 'tutorials');
  if (normalizedPath === '/combat/tutorial/complete' && isWrite) return game('combat', 'tutorials');
  if (normalizedPath.startsWith('/combat/runes/')) return game('combat', 'runes');
  if (normalizedPath.startsWith('/combat/skills/')) return game('combat', 'skills');
  if (normalizedPath.startsWith('/combat/arena/')) return game('combat', 'arena');
  if (normalizedPath === '/combat/dungeon') return game('combat', 'dungeons');
  if ([
    '/combat/equip', '/combat/gear/scrap', '/combat/forge', '/combat/auto-scrap',
  ].includes(normalizedPath)) return game('combat', 'gear');
  if (normalizedPath.startsWith('/combat/')) return game('combat');

  // Social parent lets the developer stop player-to-player/community
  // interactions while retaining the moderation report endpoint above.
  if (normalizedPath === '/guilds' || normalizedPath.startsWith('/guilds/')) return game('social', 'guilds');
  if (normalizedPath === '/chat' || normalizedPath === '/chat/status') return game('social', 'chat');
  if (normalizedPath === '/share' && isWrite) return game('social', 'sharing');
  if (normalizedPath === '/social/visit' && isWrite) return game('social');
  if ((normalizedPath === '/follow-reward/status' && isRead) || (normalizedPath === '/follow-reward' && isWrite)) {
    return game('social', 'rewards', 'community-rewards');
  }

  // Claimable reward types have both a parent switch and a narrower switch.
  if (normalizedPath === '/streak/claim' && isWrite) return game('rewards', 'daily-rewards');
  if (normalizedPath === '/quests/claim' && isWrite) return game('rewards', 'quests');
  if (normalizedPath === '/community/reward/claim' && isWrite) return game('social', 'rewards', 'community-rewards');

  // Progression systems.
  if ((normalizedPath === '/prestige' || normalizedPath.startsWith('/prestige/')) && isWrite) return game('prestige');
  if (normalizedPath === '/mastery/upgrade' && isWrite) return game('upgrades', 'mastery');
  if (['/boosters/activate', '/automation/buy', '/turbo/activate'].includes(normalizedPath) && isWrite) {
    return game('upgrades', 'boosters');
  }
  if (normalizedPath === '/cosmetics/buy' && isWrite) return game('upgrades', 'cosmetics');
  if ([
    '/upgrade', '/upgrade/batch', '/upgrade/all', '/chain-patcher/buy', '/altar/sacrifice',
  ].includes(normalizedPath) && isWrite) return game('upgrades');

  // Events, global buffs, and player-choice systems.
  if (normalizedPath === '/world-event' && isRead) return game('events', 'world-events');
  if (normalizedPath.startsWith('/frenzy/') && !normalizedPath.startsWith('/frenzy/simulator/')) {
    return game('events', 'frenzy');
  }
  if (['/global-boosters', '/global-booster-announcement'].includes(normalizedPath) && isRead) {
    return game('global-boosters');
  }
  if (normalizedPath === '/global-boosters/activate' && isWrite) return game('global-boosters');
  if (normalizedPath === '/alignment/status' && isRead) return game('alignment');
  if (normalizedPath === '/alignment/choose' && isWrite) return game('alignment');

  // Player-facing utility and community surfaces.
  if (normalizedPath === '/offline/claim' && isWrite) return game('offline');
  if (normalizedPath === '/notifications' && (isRead || isWrite)) return game('notifications');
  if ((normalizedPath === '/popups/config' && isRead) || (normalizedPath === '/popups/track' && isWrite)) {
    return game('popups');
  }
  if (normalizedPath === '/tutorial/first-roll/status' && isRead) return game('tutorials');
  if (normalizedPath === '/tutorial/first-roll/complete' && isWrite) return game('tutorials');
  if (normalizedPath === '/feedback' && isWrite) return game('feedback');

  // Read-only pages and paid-product entry points.
  if (['/leaderboard', '/leaderboards'].includes(normalizedPath) && isRead) return game('leaderboards');
  if (normalizedPath === '/collection' && isRead) return game('collection');
  if ((normalizedPath === '/products' && isRead) || (normalizedPath === '/payments/reconcile' && isWrite)) {
    return game('purchases');
  }

  return [];
}

/** Backwards-compatible single-feature helper for callers and focused tests. */
export function globalFeatureForRequest(method: string, path: string): GlobalFeatureId | null {
  const features = globalFeaturesForRequest(method, path);
  return features.length ? features[features.length - 1]! : null;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )) return trimmed.slice(1, -1);
  return trimmed;
}

function numericText(value: string, label: string): number {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < 0) {
    throw new Error(label + ' must be a finite, non-negative number.');
  }
  return number;
}

function assertPlayerScript(script: string): void {
  const lines = script.split(/\r?\n/);
  const active = lines.map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (active.length < 1) throw new Error('Enter at least one player command.');
  if (active.length > MAX_CLI_COMMANDS) throw new Error('A command batch may contain at most 50 lines.');
  for (const line of active) {
    if (!/^(?:set|add|subtract|sub|delete|del)\s+[^\s]+(?:\s+[\s\S]+)?$/i.test(line)) {
      throw new Error('Player command batches accept only set, add, subtract, and delete lines.');
    }
  }
}

export function parseAdminCliCommand(source: string): ParsedAdminCliCommand {
  const input = String(source ?? '');
  if (!input.trim()) throw new Error('Enter a command.');
  if (input.length > MAX_CLI_SCRIPT_LENGTH) throw new Error('The command is too long.');

  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (!lines.length) throw new Error('Enter a command.');
  if (lines.length > MAX_CLI_COMMANDS) throw new Error('A command batch may contain at most 50 lines.');

  if (lines.length === 1) {
    const line = lines[0]!;
    if (/^(?:features|feature\s+list)$/i.test(line)) return { kind: 'feature-list' };

    const maintenanceMatch = /^maintenance\\s+(on|off|enable|disable)(?:\\s+([\\s\\S]+))?$/i.exec(line);
    if (maintenanceMatch) {
      const maintenanceEnabled = /^(on|enable)$/i.test(maintenanceMatch[1]!);
      const reason = maintenanceEnabled
        ? (unquote(maintenanceMatch[2] ?? '') || 'The game is temporarily under maintenance.').slice(0, 300)
        : '';
      return { kind: 'feature', feature: 'gameplay', enabled: !maintenanceEnabled, reason };
    }

    const featureMatch = /^feature\s+([a-z-]+)\s+(disable|off|enable|on)(?:\s+([\s\S]+))?$/i.exec(line);
    if (featureMatch) {
      const featureName = featureMatch[1]!.toLowerCase();
      const definition = GLOBAL_FEATURES.find(item => item.id === featureName);
      if (!definition) throw new Error('Unknown global feature "' + featureName + '". Use "features" to list valid switches.');
      const enabled = /^(enable|on)$/i.test(featureMatch[2]!);
      const suppliedReason = unquote(featureMatch[3] ?? '');
      if (enabled && suppliedReason) throw new Error('Do not provide a reason when enabling a feature.');
      const reason = enabled ? '' : (suppliedReason || 'The developer has disabled ' + definition.label.toLowerCase() + '.').slice(0, 300);
      return { kind: 'feature', feature: definition.id, enabled, reason };
    }

    const menuMatch = /^menus?\s+(disable|off|enable|on)(?:\s+([\s\S]+))?$/i.exec(line);
    if (menuMatch) {
      const enabled = /^(enable|on)$/i.test(menuMatch[1]!);
      const reason = enabled ? '' : (unquote(menuMatch[2] ?? '') || DEFAULT_MENU_DISABLED_REASON).slice(0, 300);
      return { kind: 'menus', enabled, reason };
    }

    const announceMatch = /^(?:announce|announcement)\s+([\s\S]+)$/i.exec(line);
    if (announceMatch) {
      const raw = unquote(announceMatch[1]!);
      return { kind: 'announcement', message: /^(clear|off|none)$/i.test(raw) ? '' : raw.slice(0, 1200) };
    }

    if (/^cooldown\s+ready$/i.test(line)) {
      return { kind: 'player-save', commands: 'set lastRollAt 0', invalidateRollTicket: true };
    }

    const offlineMatch = /^offline\s+(add|set)\s+(\S+)$/i.exec(line);
    if (offlineMatch) {
      const offlineAmount = numericText(offlineMatch[2]!, 'Offline rolls');
      if (!Number.isSafeInteger(offlineAmount)) throw new Error('Offline rolls must be whole numbers.');
      return {
        kind: 'player-save',
        commands: (offlineMatch[1]!.toLowerCase() === 'add' ? 'add offlineRolls ' : 'set offlineRolls ') + offlineMatch[2],
        invalidateRollTicket: false,
      };
    }

    const giveMatch = /^give\s+(coins?|shards?|dust|offline|rolls)\s+(\S+)$/i.exec(line);
    if (giveMatch) {
      const resource = giveMatch[1]!.toLowerCase();
      const amount = numericText(giveMatch[2]!, 'Grant amount');
      if (amount <= 0) throw new Error('Grant amount must be greater than zero.');
      if (['shard', 'shards', 'rolls', 'offline'].includes(resource) && !Number.isSafeInteger(amount)) {
        throw new Error('Shard, roll, and offline grants must be whole numbers.');
      }
      const commands = resource === 'coin' || resource === 'coins'
        ? 'add coins ' + amount + '\nadd lifetimeCoins ' + amount
        : resource === 'shard' || resource === 'shards'
          ? 'add shards ' + amount + '\nadd lifetimeShards ' + amount
          : resource === 'dust'
            ? 'add cosmicDust ' + amount
            : resource === 'rolls'
              ? 'add totalRolls ' + amount
              : 'add offlineRolls ' + amount;
      return { kind: 'player-save', commands, invalidateRollTicket: false };
    }

    const upgradeMatch = /^upgrade\s+([A-Za-z][A-Za-z0-9_-]*)\s+([\d.]+)$/i.exec(line);
    if (upgradeMatch) {
      numericText(upgradeMatch[2]!, 'Upgrade level');
      return { kind: 'player-save', commands: 'set upgrades.' + upgradeMatch[1] + ' ' + upgradeMatch[2], invalidateRollTicket: false };
    }

    const masteryMatch = /^mastery\s+([A-Za-z][A-Za-z0-9_-]*)\s+([\d.]+)$/i.exec(line);
    if (masteryMatch) {
      numericText(masteryMatch[2]!, 'Mastery level');
      return { kind: 'player-save', commands: 'set masterySkills.' + masteryMatch[1] + ' ' + masteryMatch[2], invalidateRollTicket: false };
    }

    const prestigeMatch = /^prestige-upgrade\s+([A-Za-z][A-Za-z0-9_-]*)\s+([\d.]+)$/i.exec(line);
    if (prestigeMatch) {
      numericText(prestigeMatch[2]!, 'Prestige upgrade level');
      return { kind: 'player-save', commands: 'set prestigeUpgrades.' + prestigeMatch[1] + ' ' + prestigeMatch[2], invalidateRollTicket: false };
    }

    const boosterMatch = /^boost\s+(fortune|hyperdrive|barrage|prosperity|ascension)\s+(\d+)$/i.exec(line);
    if (boosterMatch) {
      const minutes = numericText(boosterMatch[2]!, 'Booster duration');
      if (minutes <= 0 || minutes > 10_080) throw new Error('Booster duration must be between 1 and 10,080 minutes.');
      const expiry = Date.now() + minutes * 60_000;
      return { kind: 'player-save', commands: 'set activeBoosters.' + boosterMatch[1]!.toLowerCase() + ' ' + expiry, invalidateRollTicket: false };
    }
  }

  const playerScript = lines.join('\n');
  assertPlayerScript(playerScript);
  return { kind: 'player-save', commands: playerScript, invalidateRollTicket: false };
}
