/**
 * Admin Console command grammar. Intentionally not a JavaScript interpreter.
 * The caller still has to pass the server-side admin gate before this parser
 * is reached.
 */

export type ParsedAdminCliCommand =
  | { kind: 'menus'; enabled: boolean; reason: string }
  | { kind: 'announcement'; message: string }
  | { kind: 'player-save'; commands: string; invalidateRollTicket: boolean };

const DEFAULT_MENU_DISABLED_REASON = 'The developer has disabled the menus.';
const MAX_CLI_SCRIPT_LENGTH = 12_000;
const MAX_CLI_COMMANDS = 50;

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

    const offlineMatch = /^offline\s+(add|set)\s+([+-]?[\d.]+)$/i.exec(line);
    if (offlineMatch) {
      const offlineAmount = numericText(offlineMatch[2]!, 'Offline rolls');
      if (!Number.isSafeInteger(offlineAmount)) throw new Error('Offline rolls must be whole numbers.');
      return {
        kind: 'player-save',
        commands: (offlineMatch[1]!.toLowerCase() === 'add' ? 'add offlineRolls ' : 'set offlineRolls ') + offlineMatch[2],
        invalidateRollTicket: false,
      };
    }

    const giveMatch = /^give\\s+(coins?|shards?|dust|offline|rolls)\\s+([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)$/i.exec(line);
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
