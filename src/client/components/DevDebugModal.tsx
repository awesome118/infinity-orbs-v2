import React, { useEffect, useState } from 'react';
import {
  X, Wrench, Coins, Gem, Sparkles, Zap, RotateCcw, Play, Shield, Megaphone,
  Users,
  Ban, UserX, CheckCircle2, RefreshCw, Flame,
  Database, Wand2, Trash2, Gauge, ListRestart, Save, Power, Copy, ClipboardCheck,
} from 'lucide-react';
import { PRESTIGE_UPGRADES } from '../../shared/game.js';
import type { RollResponse } from '../../shared/game.js';
import { sound } from '../sound.js';

interface DevDebugModalProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onForceRollResult?: (res: RollResponse) => void;
}

type AdminContext = {
  username: string | null;
  userId: string | null;
  subredditName: string | null;
  postId: string | null;
  gameModerationVersion?: string;
  gameBan?: {
    active: true;
    bannedAt: number;
    bannedUntil: number | null;
    reason: string;
  } | null;
};

const buttonBase =
  'rounded-xl border text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
const panelBase = 'bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3';

const SHORT_PLAYER_LOG_MAX_CHARS = 12_000;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shortNumber(value: unknown, maxDecimals = 3): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '?';
  return Number(n.toFixed(maxDecimals)).toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  });
}

function compactTimestamp(timestamp: unknown, baseTimestamp: number): string {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !Number.isFinite(baseTimestamp)) return '+?s';
  const seconds = Math.max(0, Math.round((ts - baseTimestamp) / 1000));
  return '+' + seconds.toLocaleString('en-US') + 's';
}

function shortenPlayerSpyLogs(
  username: string,
  userId: string,
  logs: Array<Record<string, unknown>>,
): string {
  const baseTimestamp = Number(logs[0]?.timestamp ?? 0);
  const meaningfulLogs = logs.filter(log => log.event !== 'roll-activation');

  const rollStats = {
    count: 0,
    totalCoins: 0,
    totalShards: 0,
    totalXp: 0,
    totalCrits: 0,
    totalUnique: 0,
    best: 0,
    min: Infinity,
    max: 0,
  };

  const standardLines = meaningfulLogs.map((log) => {
    const event = String(log.event ?? 'event');
    const details = recordValue(log.details);
    const stamp = compactTimestamp(log.timestamp, baseTimestamp);

    if (event === 'roll') {
      rollStats.count += Number(details.processedRollCount ?? 0) || 0;
      rollStats.totalCoins += Number(details.coinsGained ?? 0) || 0;
      rollStats.totalShards += Number(details.shardsGained ?? 0) || 0;
      rollStats.totalXp += Number(details.xpGained ?? 0) || 0;
      rollStats.totalCrits += Number(details.criticalRolls ?? 0) || 0;
      rollStats.totalUnique += Number(details.uniqueGained ?? 0) || 0;

      const best = Number(details.bestRarity ?? 0) || 0;
      rollStats.best = Math.max(rollStats.best, best);
      if (best > 0) {
        rollStats.min = Math.min(rollStats.min, best);
        rollStats.max = Math.max(rollStats.max, best);
      }

      const samples = Array.isArray(details.sampleRarities)
        ? details.sampleRarities.map(value => shortNumber(value, 0)).join(',')
        : '';

      return [
        stamp,
        'ROLLx' + String(details.processedRollCount ?? details.requestedRollCount ?? '?'),
        samples ? 'R[' + samples + ']' : '',
        'B' + shortNumber(details.bestRarity, 0),
        'C+' + shortNumber(details.coinsGained, 0),
        'X+' + shortNumber(details.xpGained, 0),
        'S+' + shortNumber(details.shardsGained, 1),
        'K+' + shortNumber(details.criticalRolls, 0),
        'U+' + shortNumber(details.uniqueGained, 0),
        'L' + shortNumber(details.luckMultiplier),
        'Lv' + shortNumber(details.level, 0),
      ].filter(Boolean).join(' | ');
    }

    if (event === 'upgrade-purchase') {
      return [
        stamp,
        'UP',
        String(details.upgrade ?? '?'),
        String(details.levelBefore ?? '?') + '>' + String(details.levelAfter ?? '?'),
        'C-' + shortNumber(details.cost, 0),
      ].join(' | ');
    }

    if (event === 'altar-sacrifice') {
      return [
        stamp,
        'ALTAR',
        'C-' + shortNumber(details.coinsSacrificed, 0),
        'S-' + shortNumber(details.shardsSacrificed, 0),
        details.luckSurgeExtended ? 'SURGE+' : '',
        details.altarLeveledUp ? 'LEVEL UP' : '',
        details.snapshot ? 'Lv' + shortNumber(recordValue(details.snapshot).level, 0) : '',
      ].filter(Boolean).join(' | ');
    }

    if (event === 'quest-claim') {
      return [
        stamp,
        'QUEST',
        String(details.questId ?? details.type ?? '?'),
        'C+' + shortNumber(details.rewardCoins, 0),
        'S+' + shortNumber(details.rewardShards, 0),
        'T+' + shortNumber(details.rewardTokens, 0),
      ].join(' | ');
    }

    return [
      stamp,
      event.replace(/-/g, '_').toUpperCase(),
      ...Object.entries(details)
        .filter(([key]) => !['snapshot', 'globalBoosters', 'before', 'after', 'userId'].includes(key))
        .slice(0, 5)
        .map(([key, value]) => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return key + '=' + JSON.stringify(value);
          return key + '=' + String(value);
        })
        .filter(Boolean),
    ].join(' | ');
  });

  const header = [
    'Infinity Orbs Player Spy (shortened)',
    'u/' + (username.replace(/^u\//i, '') || '?') + (userId ? ' · ID ' + userId.slice(-10) : ''),
    'Events ' + logs.length + ' · Duplicate roll-activation entries and repeated state snapshots removed.',
    'ROLL: t=elapsed seconds, R=sample rarities, B=best, C=coins, X=XP, S=shards, K=crits, U=uniques, L=luck multiplier, Lv=level.',
    '',
  ].join('\n');

  const standard = header + standardLines.join('\n');
  if (standard.length <= SHORT_PLAYER_LOG_MAX_CHARS) return standard;

  const ultraLines = meaningfulLogs.map((log) => {
    const event = String(log.event ?? 'event');
    const details = recordValue(log.details);
    const stamp = compactTimestamp(log.timestamp, baseTimestamp);

    if (event === 'roll') {
      const parts = [
        stamp,
        'R' + shortNumber(details.bestRarity, 0),
        'C' + shortNumber(details.coinsGained, 0),
        'X' + shortNumber(details.xpGained, 0),
      ];
      if (Number(details.shardsGained ?? 0)) parts.push('S' + shortNumber(details.shardsGained, 0));
      if (Number(details.criticalRolls ?? 0)) parts.push('K' + shortNumber(details.criticalRolls, 0));
      if (Number(details.uniqueGained ?? 0)) parts.push('U' + shortNumber(details.uniqueGained, 0));
      return parts.join(' ');
    }

    if (event === 'upgrade-purchase') {
      return stamp + ' UP ' + String(details.upgrade ?? '?') + ' ' + String(details.levelBefore ?? '?') + '>' + String(details.levelAfter ?? '?') + ' C-' + shortNumber(details.cost, 0);
    }

    if (event === 'altar-sacrifice') {
      return stamp + ' ALTAR C-' + shortNumber(details.coinsSacrificed, 0) + ' S-' + shortNumber(details.shardsSacrificed, 0) + (details.luckSurgeExtended ? ' SURGE+' : '');
    }

    if (event === 'quest-claim') {
      return stamp + ' QUEST ' + String(details.questId ?? details.type ?? '?') + ' C+' + shortNumber(details.rewardCoins, 0) + ' S+' + shortNumber(details.rewardShards, 0) + ' T+' + shortNumber(details.rewardTokens, 0);
    }

    return stamp + ' ' + event;
  });

  const ultraHeader = [
    'Infinity Orbs Player Spy (ultra-short)',
    'u/' + (username.replace(/^u\//i, '') || '?') + ' · ' + logs.length + ' events · activation duplicates/snapshots removed.',
    'ROLL: t R=best rarity C=coins X=XP; S=shards K=crits U=uniques only when nonzero.',
    '',
  ].join('\n');

  const ultra = ultraHeader + ultraLines.join('\n');
  if (ultra.length <= SHORT_PLAYER_LOG_MAX_CHARS) return ultra;

  const ultraText = ultraLines.join('\n');
  const keepChars = Math.max(1000, Math.floor((SHORT_PLAYER_LOG_MAX_CHARS - ultraHeader.length - 260) / 2));
  const first = ultraText.slice(0, keepChars);
  const last = ultraText.slice(-keepChars);
  const middleStart = first.split('\n').length;
  const middleEnd = Math.max(middleStart, ultraLines.length - last.split('\n').length);
  const omittedCount = Math.max(0, middleEnd - middleStart);
  const summary = [
    '',
    '... middle omitted to stay under ' + SHORT_PLAYER_LOG_MAX_CHARS.toLocaleString() + ' characters ...',
    'Rolls: ' + rollStats.count + ' · best: ' + (rollStats.best || '?') + ' · min: ' + (rollStats.min === Infinity ? '?' : rollStats.min) + ' · max: ' + (rollStats.max || '?'),
    'Rewards in loaded logs: C+' + rollStats.totalCoins.toLocaleString() + ' X+' + rollStats.totalXp.toLocaleString() + ' S+' + rollStats.totalShards.toLocaleString() + ' K+' + rollStats.totalCrits.toLocaleString() + ' U+' + rollStats.totalUnique.toLocaleString(),
    '',
  ].join('\n');

  return (ultraHeader + first + '\n...[' + omittedCount.toLocaleString() + ' compact events omitted]...\n' + last + summary).slice(0, SHORT_PLAYER_LOG_MAX_CHARS);
}


export const DevDebugModal: React.FC<DevDebugModalProps> = ({
  onClose,
  onRefresh,
  onForceRollResult,
}) => {
  const [customRarity, setCustomRarity] = useState('100000');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [contextInfo, setContextInfo] = useState<AdminContext | null>(null);

  const [targetUser, setTargetUser] = useState('');
  const [pendingWipe, setPendingWipe] = useState<{ action: 'wipe-game' | 'wipe-and-ban' | 'wipe-and-unban'; username: string } | null>(null);
  const [banDuration, setBanDuration] = useState('permanent');
  const [banReason, setBanReason] = useState('Infinity Orbs admin action');
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementLoaded, setAnnouncementLoaded] = useState(false);
  const [paymentLogs, setPaymentLogs] = useState<Array<Record<string, unknown>>>([]);
  const [paymentLogsLoading, setPaymentLogsLoading] = useState(false);
  const [saveLogs, setSaveLogs] = useState<Array<Record<string, unknown>>>([]);
  const [saveLogsLoading, setSaveLogsLoading] = useState(false);
  const [globalBooster, setGlobalBooster] = useState('luck');
  const [globalTier, setGlobalTier] = useState('1');
  const [globalMinutes, setGlobalMinutes] = useState('30');
  const [globalBoosterLogs, setGlobalBoosterLogs] = useState<Array<Record<string, unknown>>>([]);
  const [globalBoosterLogsLoading, setGlobalBoosterLogsLoading] = useState(false);
  const [ccuStats, setCcuStats] = useState<{
    current: number;
    last24Hours: number;
    last7Days: number;
    last30Days: number;
    allTime: number;
    fakeCcuBonus: number;
    effectiveLuckCcu: number;
  } | null>(null);
  const [ccuLoading, setCcuLoading] = useState(false);
  const [fakeCcuInput, setFakeCcuInput] = useState('0');
  const [pushTestLoading, setPushTestLoading] = useState(false);
  const [followStats, setFollowStats] = useState<{
    recordedFollowActions: number;
    totalSubscribers: number | null;
    targetSubreddit: string;
  } | null>(null);
  const [followStatsLoading, setFollowStatsLoading] = useState(false);
  const [fullTestRunning, setFullTestRunning] = useState(false);
  const [fullTestCurrentAction, setFullTestCurrentAction] = useState('');
  const [fullTestLogs, setFullTestLogs] = useState<Array<{
    action: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    durationMs: number;
    detail: string;
  }>>([]);

  const [guildChatSpy, setGuildChatSpy] = useState<Array<{
    id: string;
    name: string;
    tag: string;
    memberCount: number;
    messages: Array<{
      id: string;
      username: string;
      userId?: string;
      text: string;
      timestamp: number;
      isSystem?: boolean;
    }>;
  }>>([]);
  const [guildChatMutes, setGuildChatMutes] = useState<Array<{
    userId: string;
    username: string;
    mutedAt: number;
    mutedBy: string;
  }>>([]);
  const [guildChatSpyLoading, setGuildChatSpyLoading] = useState(false);
  const [guildChatSpyLoaded, setGuildChatSpyLoaded] = useState(false);
  const [guildChatMuteUser, setGuildChatMuteUser] = useState('');

  const [frenzyRarity, setFrenzyRarity] = useState('');
  const [frenzyPostId, setFrenzyPostId] = useState('');
  const [frenzyPostUrl, setFrenzyPostUrl] = useState('');

  const [stateInputs, setStateInputs] = useState({
    coins: '',
    shards: '',
    dust: '',
    xp: '',
    totalRolls: '',
    highestRarity: '',
    collectionValue: '',
    offlineRolls: '',
    currentRunRolls: '',
    rollsSinceBest: '',
  });



  const sendAdminAction = async (endpoint: string, body: any = {}, refresh = true, successMessage = 'Success.') => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Admin request failed');
      sound.playClick();
      setMessage(successMessage);
      if (refresh) await onRefresh();
      return data;
    } catch (e: any) {
      setMessage(`Error: ${e?.message || 'Admin request failed'}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getBannedUsers = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/dev/moderation/banned');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load banned users.');
      setBannedUsers(data.users ?? []);
      setMessage(`Loaded ${(data.users ?? []).length} banned users.`);
    } catch (e: any) {
      setMessage(`Error: ${e?.message || 'Could not load banned users.'}`);
    } finally {
      setLoading(false);
    }
  };

  const [playerList, setPlayerList] = useState<Array<{
    userId: string;
    username: string;
    firstSeenAt: number;
    lastSeenAt: number;
    active: boolean;
    level: number;
    xp: number;
    totalRolls: number;
    highestRarity: number;
    coins: number;
    shards: number;
  }>>([]);
  const [bannedUsers, setBannedUsers] = useState<Array<{
    username: string;
    userId?: string;
    bannedAt: number;
    bannedUntil: number | null;
    reason: string;
  }>>([]);
  const [playerSpyLogs, setPlayerSpyLogs] = useState<Array<Record<string, unknown>>>([]);
  const [playerSpyUsername, setPlayerSpyUsername] = useState('');
  const [playerSpyUserId, setPlayerSpyUserId] = useState('');
  const [playerSpyLoading, setPlayerSpyLoading] = useState(false);
  const [playerSpyShortened, setPlayerSpyShortened] = useState(false);

  const loadCcuStats = async () => {
    setCcuLoading(true);
    try {
      const res = await fetch('/api/dev/ccu', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load CCU statistics.');
      setCcuStats(data);
      setMessage('CCU statistics refreshed.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load CCU statistics.'));
    } finally {
      setCcuLoading(false);
    }
  };

  useEffect(() => {
    void loadCcuStats();
    void loadFollowStats();
  }, []);

  const setFakeCcu = async (bonus: number) => {
    setCcuLoading(true);
    try {
      const res = await fetch('/api/dev/ccu/fake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bonus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not set fake CCU.');
      setMessage(`Fake CCU set to +${Number(data.fakeCcuBonus ?? bonus).toLocaleString()}.`);
      await loadCcuStats();
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not set fake CCU.'));
    } finally {
      setCcuLoading(false);
    }
  };

  const loadFollowStats = async () => {
    setFollowStatsLoading(true);
    try {
      const res = await fetch('/api/dev/follow-stats', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load follow statistics.');
      setFollowStats(data);
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load follow statistics.'));
    } finally {
      setFollowStatsLoading(false);
    }
  };

  const showFollowPromptTest = () => {
    window.dispatchEvent(new Event('io-follow-prompt-test'));
    setMessage('Follow prompt triggered for this game session.');
  };

  const sendPushTest = async () => {
    setPushTestLoading(true);
    try {
      const res = await fetch('/api/dev/push-test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send push test notification.');
      setMessage('Push test notification sent. Check your Reddit notifications.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Failed to send push test notification.'));
    } finally {
      setPushTestLoading(false);
    }
  };

  const loadSaveLogs = async () => {
    setSaveLogsLoading(true);
    try {
      const username = playerSpyUsername.trim().replace(/^u\//i, '');
      const suffix = username ? '&username=' + encodeURIComponent(username) : '';
      const res = await fetch('/api/dev/save-logs?limit=500' + suffix, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load save diagnostics.');
      setSaveLogs(Array.isArray(data.logs) ? data.logs : []);
      setMessage('Loaded ' + (Array.isArray(data.logs) ? data.logs.length : 0) + ' save diagnostic entries' + (username ? ' for u/' + username : '') + '.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load save diagnostics.'));
    } finally {
      setSaveLogsLoading(false);
    }
  };

  const copySaveLogs = async () => {
    const serialized = JSON.stringify(saveLogs, null, 2);
    try {
      await navigator.clipboard.writeText(serialized);
      setMessage('Save diagnostics copied to clipboard.');
    } catch {
      const textarea = document.getElementById('save-debug-log-copy') as HTMLTextAreaElement | null;
      if (!textarea) {
        setMessage('Could not access the clipboard.');
        return;
      }
      textarea.focus();
      textarea.select();
      setMessage('Clipboard access was blocked. The save diagnostics are selected; copy them manually.');
    }
  };

  const clearSaveLogs = async () => {
    setSaveLogsLoading(true);
    try {
      const res = await fetch('/api/dev/save-logs/clear', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not clear save diagnostics.');
      setSaveLogs([]);
      setMessage('Save diagnostics cleared.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not clear save diagnostics.'));
    } finally {
      setSaveLogsLoading(false);
    }
  };

  const loadPaymentLogs = async () => {
    setPaymentLogsLoading(true);
    try {
      const res = await fetch('/api/dev/payment-logs?limit=200');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load payment logs.');
      setPaymentLogs(Array.isArray(data.logs) ? data.logs : []);
      setMessage('Loaded ' + (Array.isArray(data.logs) ? data.logs.length : 0) + ' payment log entries.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load payment logs.'));
    } finally {
      setPaymentLogsLoading(false);
    }
  };

  const copyPaymentLogs = async () => {
    const text = JSON.stringify(paymentLogs, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Payment logs copied to clipboard.');
    } catch {
      const textarea = document.getElementById('payment-debug-log-copy') as HTMLTextAreaElement | null;
      if (!textarea) {
        setMessage('Could not access the clipboard.');
        return;
      }
      textarea.focus();
      textarea.select();
      setMessage('Clipboard access was blocked. The logs are selected; copy them manually.');
    }
  };

  const loadPlayerSpy = async () => {
    const username = playerSpyUsername.trim().replace(/^u\//i, '');
    if (!username) {
      setMessage('Enter a Reddit username first.');
      return;
    }

    setPlayerSpyLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/dev/player-spy?username=' + encodeURIComponent(username) + '&limit=500', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load Player Spy logs.');
      setPlayerSpyUsername(data.username ?? username);
      setPlayerSpyUserId(data.userId ?? '');
      setPlayerSpyLogs(Array.isArray(data.logs) ? data.logs : []);
      setPlayerSpyShortened(false);
      setMessage('Loaded ' + (Array.isArray(data.logs) ? data.logs.length : 0) + ' Player Spy events for u/' + (data.username ?? username) + '.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load Player Spy logs.'));
      setPlayerSpyLogs([]);
      setPlayerSpyUserId('');
    } finally {
      setPlayerSpyLoading(false);
    }
  };

  const fullPlayerSpyLog = () => JSON.stringify({
    username: playerSpyUsername.trim().replace(/^u\//i, ''),
    userId: playerSpyUserId || null,
    exportedAt: new Date().toISOString(),
    logCount: playerSpyLogs.length,
    logs: playerSpyLogs,
  }, null, 2);

  const shortenedPlayerSpyLog = () => shortenPlayerSpyLogs(
    playerSpyUsername.trim().replace(/^u\//i, ''),
    playerSpyUserId,
    playerSpyLogs,
  );

  const copyPlayerSpy = async () => {
    const serialized = playerSpyShortened ? shortenedPlayerSpyLog() : fullPlayerSpyLog();
    try {
      await navigator.clipboard.writeText(serialized);
      setMessage(
        playerSpyShortened
          ? 'Shortened Player Spy log copied. It is capped for chat-friendly size.'
          : 'Player Spy logs copied to clipboard. You may paste the JSON into chat for analysis.',
      );
    } catch {
      const textarea = document.getElementById('player-spy-log-copy') as HTMLTextAreaElement | null;
      if (!textarea) {
        setMessage('Could not access the clipboard.');
        return;
      }
      textarea.focus();
      textarea.select();
      setMessage('Clipboard access was blocked. The Player Spy log is selected; copy it manually.');
    }
  };

  const clearPlayerSpy = async () => {
    const username = playerSpyUsername.trim().replace(/^u\//i, '');
    if (!username) {
      setMessage('Enter a Reddit username first.');
      return;
    }
    if (!window.confirm(`Clear all stored Player Spy logs for u/${username}?`)) return;

    setPlayerSpyLoading(true);
    try {
      const res = await fetch('/api/dev/player-spy/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not clear Player Spy logs.');
      setPlayerSpyLogs([]);
      setMessage('Player Spy logs cleared.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not clear Player Spy logs.'));
    } finally {
      setPlayerSpyLoading(false);
    }
  };

  const loadGuildChatSpy = async (quiet = false) => {
    if (!quiet) setGuildChatSpyLoading(true);
    try {
      const res = await fetch('/api/dev/guild-chat-spy');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load Guild Chat spy data.');
      setGuildChatSpy(Array.isArray(data.guilds) ? data.guilds : []);
      setGuildChatMutes(Array.isArray(data.mutes) ? data.mutes : []);
      setGuildChatSpyLoaded(true);
      if (!quiet) {
        const guilds = Array.isArray(data.guilds) ? data.guilds : [];
        const messageCount = guilds.reduce(
          (total: number, guild: { messages?: unknown[] }) =>
            total + (Array.isArray(guild.messages) ? guild.messages.length : 0),
          0,
        );
        setMessage('Loaded ' + guilds.length + ' guilds and ' + messageCount + ' stored chat messages.');
      }
    } catch (e: any) {
      if (!quiet) setMessage('Error: ' + (e?.message || 'Could not load Guild Chat spy data.'));
    } finally {
      if (!quiet) setGuildChatSpyLoading(false);
    }
  };

  useEffect(() => {
    if (!guildChatSpyLoaded) return;
    const interval = window.setInterval(() => {
      void loadGuildChatSpy(true);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [guildChatSpyLoaded]);

  const toggleGuildChatMute = async (username: string, currentlyMuted: boolean) => {
    const cleanName = username.trim().replace(/^u\//i, '');
    const data = await sendAdminAction(
      currentlyMuted ? '/api/dev/guild-chat/unmute' : '/api/dev/guild-chat/mute',
      { username: cleanName },
      false,
      currentlyMuted
        ? 'Unmuted u/' + cleanName + ' from Guild Chat.'
        : 'Muted u/' + cleanName + ' in Guild Chat.',
    );
    if (data) await loadGuildChatSpy(true);
  };

  const loadGlobalBoosterLogs = async () => {
    setGlobalBoosterLogsLoading(true);
    try {
      const res = await fetch('/api/dev/global-booster-logs?limit=300');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load Global Booster logs.');
      setGlobalBoosterLogs(Array.isArray(data.logs) ? data.logs : []);
      setMessage('Loaded ' + (Array.isArray(data.logs) ? data.logs.length : 0) + ' Global Booster log entries.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load Global Booster logs.'));
    } finally {
      setGlobalBoosterLogsLoading(false);
    }
  };

  const copyGlobalBoosterLogs = async () => {
    const text = JSON.stringify(globalBoosterLogs, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Global Booster logs copied to clipboard.');
    } catch {
      const textarea = document.getElementById('global-booster-debug-log-copy') as HTMLTextAreaElement | null;
      if (!textarea) {
        setMessage('Could not access the clipboard.');
        return;
      }
      textarea.focus();
      textarea.select();
      setMessage('Clipboard access was blocked. The logs are selected; copy them manually.');
    }
  };

  const clearGlobalBoosterLogs = async () => {
    setGlobalBoosterLogsLoading(true);
    try {
      const res = await fetch('/api/dev/global-booster-logs/clear', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not clear Global Booster logs.');
      setGlobalBoosterLogs([]);
      setMessage('Global Booster logs cleared.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not clear Global Booster logs.'));
    } finally {
      setGlobalBoosterLogsLoading(false);
    }
  };

  const clearPaymentLogs = async () => {
    setPaymentLogsLoading(true);
    try {
      const res = await fetch('/api/dev/payment-logs/clear', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not clear payment logs.');
      setPaymentLogs([]);
      setMessage('Payment debug logs cleared.');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not clear payment logs.'));
    } finally {
      setPaymentLogsLoading(false);
    }
  };

  const getPlayerList = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/dev/players');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load player list.');
      const players = Array.isArray(data.players) ? data.players : [];
      setPlayerList(players);
      const activeCount = players.filter((player: { active?: boolean }) => player.active).length;
      setMessage('Loaded ' + players.length + ' player accounts (' + activeCount + ' active now).');
    } catch (e: any) {
      setMessage('Error: ' + (e?.message || 'Could not load player list.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetch('/api/dev/status')
      .then(r => r.json())
      .then(setContextInfo)
      .catch(() => null);

    void fetch('/api/dev/announcement')
      .then(async r => {
        if (!r.ok) throw new Error('Could not load the developer announcement.');
        return r.json();
      })
      .then(data => setAnnouncementText(String(data.message ?? '')))
      .catch(() => null)
      .finally(() => setAnnouncementLoaded(true));
  }, []);

  const handleForceRoll = async (rarityNum: number) => {
    const data = await sendAdminAction('/api/dev/force-roll', { rarity: rarityNum });
    if (data && onForceRollResult) {
      onForceRollResult(data as RollResponse);
      onClose();
    }
  };

  const updateState = async () => {
    const body: Record<string, number> = {};
    for (const [key, value] of Object.entries(stateInputs)) {
      if (!value.trim()) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) {
        setMessage(`${key} must be a number.`);
        return;
      }
      const mapped = key === 'dust' ? 'cosmicDust' : key;
      body[mapped] = Math.floor(num);
    }
    if (Object.keys(body).length === 0) {
      setMessage('Enter at least one state value.');
      return;
    }
    await sendAdminAction('/api/dev/state', body);
  };

  const setPreset = async (preset: string) => {
    await sendAdminAction('/api/dev/preset', { preset });
  };

  const runFullComprehensiveTest = async () => {
    if (fullTestRunning) return;

    setFullTestRunning(true);
    setFullTestCurrentAction('Starting comprehensive test…');
    setFullTestLogs([]);
    setMessage('');

    const startedAt = performance.now();
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    const appendTestLog = (
      action: string,
      status: 'PASS' | 'FAIL' | 'SKIP',
      durationMs: number,
      detail: string,
    ) => {
      setFullTestLogs(previous => [
        ...previous,
        {
          action,
          status,
          durationMs: Math.max(0, Math.round(durationMs)),
          detail,
        },
      ].slice(-200));
    };

    const request = async <T,>(url: string, body?: unknown): Promise<T> => {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : `${response.status} ${response.statusText}`,
        );
      }
      return data as T;
    };

    const step = async <T,>(
      action: string,
      fn: () => Promise<T>,
      detail: (result: T) => string = () => '',
    ): Promise<T | null> => {
      const stepStarted = performance.now();
      setFullTestCurrentAction(action);
      try {
        const result = await fn();
        passed += 1;
        appendTestLog(action, 'PASS', performance.now() - stepStarted, detail(result));
        return result;
      } catch (error) {
        failed += 1;
        appendTestLog(
          action,
          'FAIL',
          performance.now() - stepStarted,
          error instanceof Error ? error.message : String(error),
        );
        return null;
      }
    };

    const skip = (action: string, reason: string) => {
      skipped += 1;
      appendTestLog(action, 'SKIP', 0, reason);
    };

    const stateSummary = (result: unknown): string => {
      const state = recordValue(recordValue(result).state);
      const fields = [
        `coins=${shortNumber(state.coins, 0)}`,
        `shards=${shortNumber(state.shards, 0)}`,
        `xp=${shortNumber(state.xp, 0)}`,
        `level=${shortNumber(state.level, 0)}`,
      ];
      return fields.join(' · ');
    };

    const rollOnce = async (label: string, auto = false) => {
      await request('/api/dev/reset-cooldown', {});
      const ticket = await request<{
        ticketId: string;
        nextIndex: number;
      }>('/api/roll-ticket');
      return step(
        label,
        () => request<RollResponse>('/api/roll', {
          auto,
          ticketId: ticket.ticketId,
          ticketIndex: ticket.nextIndex,
        }),
        result =>
          `1/${shortNumber(result.orb?.rarity, 0)} · processed=${shortNumber(result.rollsProcessed, 0)} · coins +${shortNumber(result.coinsGained, 0)} · XP +${shortNumber(result.xpGained, 0)}`,
      );
    };

    try {
      await step(
        '1. Wipe save',
        () => request('/api/dev/reset-all', {}),
        result => `fresh save written · ${stateSummary(result)}`,
      );

      await step(
        '2. Seed test state',
        () => request('/api/dev/state', {
          coins: 1_000,
          shards: 50,
          xp: 100_000,
          totalRolls: 0,
          totalCrits: 0,
          highestRarity: 0,
          collectionValue: 0,
          lifetimeCollectionValue: 0,
          offlineRolls: 0,
          currentRunRolls: 0,
          rollsSinceBest: 0,
          lastRollAt: 0,
          lastSeenAt: Date.now(),
          onlinePlayers: 1,
        }),
        result => `coins=1,000 · shards=50 · XP=100,000`,
      );

      const upgradeIds = ['speed', 'luck', 'multi', 'coinBonus', 'xpBonus', 'critChance'] as const;
      for (const id of upgradeIds) {
        if (['coinBonus', 'xpBonus', 'critChance'].includes(id)) {
          await step(
            `Set 1,000 Coins before ${id}`,
            () => request('/api/dev/state', { coins: 1_000 }),
            () => 'admin state mutation',
          );
        }
        await step(
          `Buy ${id}`,
          () => request<{ state: any }>('/api/upgrade', { id }),
          (result: any) => `${id}=${shortNumber(result.state?.upgrades?.[id], 0)} · ${stateSummary(result)}`,
        );
      }

      await step(
        'Test manual roll + ticket',
        () => rollOnce('manual roll'),
        () => 'ticketed client roll endpoint returned authoritative state',
      );

      await step(
        'Luck test · normal CCU sample',
        async () => {
          await request('/api/dev/ccu/fake', { bonus: 0 });
          const rarities: number[] = [];
          for (let i = 0; i < 5; i++) {
            const result = await rollOnce(`luck baseline roll ${i + 1}`);
            if (result) rarities.push(result.orb.rarity);
          }
          if (rarities.length !== 5) throw new Error(`Only ${rarities.length}/5 baseline luck rolls completed.`);
          return rarities;
        },
        rarities => {
          const values = (rarities as number[]);
          const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
          return `n=${values.length} · avg rarity=${shortNumber(average, 0)} · best=${shortNumber(Math.max(0, ...values), 0)}`;
        },
      );

      await step(
        'Luck test · high CCU sample',
        async () => {
          await request('/api/dev/ccu/fake', { bonus: 1_000 });
          const rarities: number[] = [];
          for (let i = 0; i < 5; i++) {
            const result = await rollOnce(`luck high-CCU roll ${i + 1}`);
            if (result) rarities.push(result.orb.rarity);
          }
          if (rarities.length !== 5) throw new Error(`Only ${rarities.length}/5 high-CCU luck rolls completed.`);
          return rarities;
        },
        rarities => {
          const values = rarities as number[];
          const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
          return `n=${values.length} · avg rarity=${shortNumber(average, 0)} · best=${shortNumber(Math.max(0, ...values), 0)}`;
        },
      );

      await step(
        'Clear fake CCU',
        () => request('/api/dev/ccu/fake', { bonus: 0 }),
        () => 'luck calculation returned to real CCU',
      );

      await step(
        'Set 100,000 Coins',
        () => request('/api/dev/state', { coins: 100_000 }),
        () => 'admin currency mutation',
      );

      await step(
        'Upgrade All',
        () => request<{ state: any }>('/api/upgrade/all', {}),
        result => `all standard upgrades exercised · ${stateSummary(result)}`,
      );

      const autoRoll = await rollOnce('Manual roll for Auto Roll unlock');
      if (!autoRoll) skip('Auto Roll unlock prerequisite', 'manual roll failed');
      const autoRoll2 = await rollOnce('Second manual roll for Auto Roll unlock');
      if (!autoRoll2) skip('Auto Roll unlock prerequisite', 'second manual roll failed');
      const autoRoll3 = await rollOnce('Third manual roll for Auto Roll unlock');
      if (!autoRoll3) skip('Auto Roll unlock prerequisite', 'third manual roll failed');

      const autoEnabled = await step(
        'Enable Auto Roll',
        () => request<{ state: any }>('/api/auto-roll', { enabled: true }),
        result => stateSummary(result),
      );
      if (autoEnabled) {
        await rollOnce('Auto Roll execution', true);
      }

      await step(
        'Seed Offline Rolls',
        () => request('/api/dev/state', {
          offlineRolls: 2,
          lastSeenAt: Date.now(),
        }),
        () => 'offlineRolls=2',
      );
      await step(
        'Claim Offline Rolls',
        () => request<RollResponse>('/api/offline/claim', {}),
        result => `processed=${shortNumber(result.rollsProcessed, 0)} · ${stateSummary(result)}`,
      );

      await step(
        'Claim Daily Streak',
        () => request<{ state: any }>('/api/streak/claim', {}),
        (result: any) => `streak=${shortNumber(result.state?.streak?.count, 0)}`,
      );

      await step(
        'Prepare Daily + Weekly Quests',
        () => request('/api/dev/state', { questState: 'ready' }),
        () => 'all quests marked complete and unclaimed',
      );

      const meForQuest = await step(
        'Load quest state',
        () => request<any>('/api/me'),
        result => `daily=${Array.isArray(result.dailyQuests) ? result.dailyQuests.length : 0} · weekly=${Array.isArray(result.weeklyQuests) ? result.weeklyQuests.length : 0}`,
      );
      const firstQuestId = meForQuest && Array.isArray(meForQuest.dailyQuests) ? meForQuest.dailyQuests[0]?.id : null;
      if (firstQuestId) {
        await step(
          'Claim Daily Quest',
          () => request('/api/quests/claim', { type: 'daily', id: firstQuestId }),
          () => `claimed ${firstQuestId}`,
        );
      } else {
        skip('Claim Daily Quest', 'no daily quest id returned');
      }

      await step(
        'Altar shard sacrifice',
        async () => {
          await request('/api/dev/state', { coins: 2_000, shards: 1 });
          return request('/api/altar/sacrifice', { coins: 0, shards: 1 });
        },
        (result: any) => `luck surge extended=${String(result.luckSurgeExtended)} · ${stateSummary(result)}`,
      );

      await step(
        'Seed premium Booster currency',
        () => request('/api/dev/state', { shards: 100 }),
        () => 'shards=100',
      );
      await step(
        'Activate Prosperity booster',
        () => request<{ state: any }>('/api/boosters/activate', { id: 'prosperity' }),
        result => `prosperity active · ${stateSummary(result)}`,
      );

      await step(
        'Set 50 Shards',
        () => request('/api/dev/state', { shards: 50 }),
        () => 'shards=50',
      );
      await step(
        'Activate Global Luck',
        () => request<{ state: any }>('/api/global-boosters/activate', { id: 'luck' }),
        (result: any) => `global luck tier=${shortNumber(result.state?.globalBoosters?.luck?.tier, 0)} · ${stateSummary(result)}`,
      );
      await step(
        'Set 25 Shards',
        () => request('/api/dev/state', { shards: 25 }),
        () => 'shards=25',
      );
      await step(
        'Activate Global Speed',
        () => request<{ state: any }>('/api/global-boosters/activate', { id: 'speed' }),
        (result: any) => `global speed tier=${shortNumber(result.state?.globalBoosters?.speed?.tier, 0)} · ${stateSummary(result)}`,
      );
      await step(
        'Set 25 Shards',
        () => request('/api/dev/state', { shards: 25 }),
        () => 'shards=25',
      );
      await step(
        'Activate Global Crit',
        () => request<{ state: any }>('/api/global-boosters/activate', { id: 'crit' }),
        (result: any) => `global crit tier=${shortNumber(result.state?.globalBoosters?.crit?.tier, 0)} · ${stateSummary(result)}`,
      );

      await step(
        'Prepare Prestige',
        () => request('/api/dev/state', {
          coins: 10_000,
          shards: 0,
          collectionValue: 100_000_000,
          lifetimeCollectionValue: 100_000_000,
          lastRollAt: 0,
        }),
        () => 'collectionValue=100,000,000 · expected dust=10',
      );

      const prestigeResult = await step(
        'Prestige',
        () => request<{ state: any; dustGained: number }>('/api/prestige', {}),
        result => `dust +${shortNumber(result.dustGained, 0)} · prestigeCount=${shortNumber(recordValue(result.state).prestigeCount, 0)}`,
      );

      if (prestigeResult) {
        await step(
          'Seed Prestige Dust',
          () => request('/api/dev/state', {
            cosmicDust: 1_000,
            coins: 100_000,
            shards: 0,
          }),
          () => 'cosmicDust=1,000 for the full prestige upgrade sweep',
        );

        for (const id of Object.keys(PRESTIGE_UPGRADES) as Array<keyof typeof PRESTIGE_UPGRADES>) {
          await step(
            `Buy Prestige Upgrade · ${PRESTIGE_UPGRADES[id].name}`,
            async () => {
              const beforeState = await request<any>('/api/me');
              const before = Number(beforeState?.prestigeUpgrades?.[id] ?? 0);
              const result = await request<{ state: any }>('/api/prestige/upgrade', { id });
              const after = Number(result.state?.prestigeUpgrades?.[id] ?? 0);
              if (after !== before + 1) {
                throw new Error(`${id} did not increment from ${before} to ${before + 1}.`);
              }
              return result;
            },
            (result: any) => `${id}=${shortNumber(result.state?.prestigeUpgrades?.[id], 0)} · dust=${shortNumber(result.state?.cosmicDust, 0)}`,
          );
        }

        await step(
          'Buy Mastery Skill · continuumLuck',
          () => request<{ state: any }>('/api/mastery/upgrade', { skillId: 'continuumLuck' }),
          (result: any) => `continuumLuck=${shortNumber(result.state?.masterySkills?.continuumLuck, 0)}`,
        );

        await step(
          'Test Singularity Tithe · single-roll boundary',
          async () => {
            await request('/api/dev/state', {
              level: 1,
              xp: 0,
              totalRolls: 999,
              singularityTitheSingleRolls: 999,
              cosmicDust: 0,
              lastRollAt: 0,
              upgrades: {
                multi: 0,
                clusterRoll: 0,
                auto: 0,
              },
              prestigeUpgrades: {
                astralBarrage: 0,
                astralArsenal: 0,
                singularityTithe: 1,
              },
              masterySkills: {
                celestialVolley: 0,
              },
              activeBoosters: {
                barrage: 0,
              },
            });
            const result = await rollOnce('tithe single roll');
            const state = recordValue(recordValue(result).state);
            const counter = Number(state.singularityTitheSingleRolls ?? 0);
            const dust = Number(state.cosmicDust ?? 0);
            if (counter !== 1_000 || dust < 1) {
              throw new Error(`Expected 1,000 single rolls and at least 1 Dust, got counter=${counter}, dust=${dust}.`);
            }
            return result;
          },
          (result: any) => `singleRolls=${shortNumber(result.state?.singularityTitheSingleRolls, 0)} · dust=${shortNumber(result.state?.cosmicDust, 0)}`,
        );

        await step(
          'Test Singularity Tithe · multi-roll excluded',
          async () => {
            await request('/api/dev/state', {
              singularityTitheSingleRolls: 1_000,
              cosmicDust: 0,
              lastRollAt: 0,
              upgrades: {
                multi: 1,
                clusterRoll: 0,
                auto: 0,
              },
              prestigeUpgrades: {
                astralBarrage: 0,
                astralArsenal: 0,
                singularityTithe: 1,
              },
              masterySkills: {
                celestialVolley: 0,
              },
              activeBoosters: {
                barrage: 0,
              },
            });
            const result = await rollOnce('tithe multi roll');
            const state = recordValue(recordValue(result).state);
            const counter = Number(state.singularityTitheSingleRolls ?? 0);
            const dust = Number(state.cosmicDust ?? 0);
            if (counter !== 1_000 || dust !== 0) {
              throw new Error(`Multi-roll advanced Tithe unexpectedly: counter=${counter}, dust=${dust}.`);
            }
            return result;
          },
          (result: any) => `singleRolls=${shortNumber(result.state?.singularityTitheSingleRolls, 0)} · dust=${shortNumber(result.state?.cosmicDust, 0)} · processed=${shortNumber(result.rollsProcessed, 0)}`,
        );

        await step(
          'Restore Prestige Test State',
          () => request('/api/dev/state', {
            prestigeUpgrades: Object.fromEntries(
              Object.keys(PRESTIGE_UPGRADES).map(id => [id, 1]),
            ),
          }),
          () => 'all prestige upgrades restored to level 1',
        );
      } else {
        skip('Full Prestige Upgrade Sweep', 'prestige failed');
        skip('Test Singularity Tithe · single-roll boundary', 'prestige failed');
        skip('Test Singularity Tithe · multi-roll excluded', 'prestige failed');
        skip('Restore Prestige Test State', 'prestige failed');
        skip('Buy Mastery Skill · continuumLuck', 'prestige failed');
      }

      await step(
        'Seed Dust Synthesis',
        () => request('/api/dev/state', { shards: 10 }),
        () => 'shards=10',
      );
      await step(
        'Synthesize Cosmic Dust',
        () => request<{ state: any; dustEarned: number }>('/api/prestige/synthesize', {}),
        result => `dust +${shortNumber(result.dustEarned, 0)} · ${stateSummary(result)}`,
      );

      await step(
        'Final client state read',
        () => request<any>('/api/me'),
        result => `level=${shortNumber(result.level, 0)} · rolls=${shortNumber(result.totalRolls, 0)} · highest=${shortNumber(result.highestRarity, 0)} · dust=${shortNumber(result.cosmicDust, 0)}`,
      );

      const totalMs = performance.now() - startedAt;
      setMessage(
        `Full test finished in ${Math.round(totalMs).toLocaleString()}ms · ${passed} passed · ${failed} failed · ${skipped} skipped.`,
      );
      setFullTestCurrentAction('Completed');
      await onRefresh().catch(() => null);
    } catch (error) {
      const totalMs = performance.now() - startedAt;
      failed += 1;
      appendTestLog(
        'Runner',
        'FAIL',
        totalMs,
        error instanceof Error ? error.message : String(error),
      );
      setMessage(
        `Full test aborted after ${Math.round(totalMs).toLocaleString()}ms · ${passed} passed · ${failed} failed · ${skipped} skipped.`,
      );
      setFullTestCurrentAction('Aborted');
    } finally {
      setFullTestRunning(false);
    }
  };

  const confirmation = (text: string) => window.confirm(text);
  const requestWipeConfirmation = (action: 'wipe-game' | 'wipe-and-ban' | 'wipe-and-unban') => {
    const username = targetUser.trim().replace(/^u\//i, '');
    if (!username) return;

    if (pendingWipe?.action === action && pendingWipe.username.toLowerCase() === username.toLowerCase()) {
      setPendingWipe(null);
      const endpoint = action === 'wipe-game'
        ? '/api/dev/moderation/wipe-game'
        : action === 'wipe-and-ban'
          ? '/api/dev/moderation/wipe-and-ban'
          : '/api/dev/moderation/wipe-and-unban';
      const body = action === 'wipe-game' || action === 'wipe-and-unban'
        ? { username }
        : {
            username,
            durationDays: banDuration === 'permanent' ? null : Number(banDuration),
            reason: banReason,
          };
      const label = action === 'wipe-game' ? 'Wiped' : action === 'wipe-and-ban' ? 'Wiped and banned' : 'Wiped and unbanned';
      void sendAdminAction(endpoint, body, true, label + ' u/' + username + ' successfully.');
      return;
    }

    setPendingWipe({ action, username });
    setMessage('Click the same wipe button again to confirm for u/' + username + '.');
  };


  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl p-4 sm:p-6 max-w-5xl w-full space-y-4 shadow-2xl relative max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Admin Console</h3>
              <p className="text-xs text-slate-400">Server-authorized testing and moderation controls.</p>
              <p className="text-[10px] text-emerald-400/70 font-mono">Game moderation: {contextInfo?.gameModerationVersion ?? "loading"}</p>
            </div>
          </div>
          <button title="Close the admin console." onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-emerald-400">Admin</div>
            <div className="text-xs font-mono text-white truncate">{contextInfo?.username ?? '...'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-slate-500">User ID</div>
            <div className="text-[10px] font-mono text-slate-300 truncate">{contextInfo?.userId ?? '...'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-slate-500">Subreddit</div>
            <div className="text-xs font-semibold text-white truncate">{contextInfo?.subredditName ? `r/${contextInfo.subredditName}` : 'No context'}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[9px] uppercase font-bold text-slate-500">Post</div>
            <div className="text-[10px] font-mono text-slate-300 truncate">{contextInfo?.postId ?? 'Game root'}</div>
          </div>
        </div>

        {message && (
          <div className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400">
            {message}
          </div>
        )}

        <section className={panelBase + ' border border-emerald-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <ClipboardCheck className="w-4 h-4" /> Full Comprehensive Test
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Rebuilds the current admin save, mutates test data, and drives the same client API endpoints used by gameplay. This intentionally changes the save.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                disabled={fullTestRunning}
                title="Run the full end-to-end admin test. This wipes and rewrites the current admin save."
                onClick={() => {
                  void runFullComprehensiveTest();
                }}
                className={buttonBase + ' bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white px-3 py-2'}
              >
                <ClipboardCheck className="inline w-3.5 h-3.5 mr-1" />
                {fullTestRunning ? 'Running…' : 'Run Full Test'}
              </button>
              <button
                disabled={fullTestRunning || fullTestLogs.length === 0}
                title="Copy the current comprehensive test log."
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      fullTestLogs.map(log =>
                        `[${log.status}] ${log.action} · ${log.durationMs}ms · ${log.detail}`,
                      ).join('\n'),
                    );
                    setMessage('Full comprehensive test log copied.');
                  } catch {
                    setMessage('Could not copy the comprehensive test log.');
                  }
                }}
                className={buttonBase + ' bg-slate-900 border-slate-700 text-slate-200 px-3 py-2'}
              >
                <Copy className="inline w-3.5 h-3.5 mr-1" /> Copy Log
              </button>
            </div>
          </div>

          {fullTestRunning && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-300 animate-spin shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider font-black text-emerald-300">
                    Test running
                  </div>
                  <div className="text-xs text-slate-200 truncate" title={fullTestCurrentAction}>
                    {fullTestCurrentAction || 'Working…'}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-slate-400 shrink-0">
                  {fullTestLogs.length} completed
                </div>
              </div>
            </div>
          )}

          {!fullTestRunning && fullTestCurrentAction && fullTestLogs.length > 0 && (
            <div className="text-[10px] text-slate-500">
              Last run: <span className="text-slate-300">{fullTestCurrentAction}</span> · {fullTestLogs.length} logged steps
            </div>
          )}

          {fullTestLogs.length > 0 ? (
            <pre className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-black/30 p-3 text-[10px] leading-4 font-mono text-slate-300 whitespace-pre-wrap">
{fullTestLogs.map((log, index) =>
  `[${log.status}] ${log.action} · ${log.durationMs}ms${log.detail ? ` · ${log.detail}` : ''}${index === fullTestLogs.length - 1 && fullTestRunning ? ' · running…' : ''}`,
).join('\n')}
            </pre>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-500">
              No comprehensive test has been run in this admin session.
            </div>
          )}
        </section>
        <section className={panelBase + ' border border-orange-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-300">
                <Users className="w-4 h-4" /> Follow Prompt
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Trigger the follow prompt immediately for testing and inspect subreddit metrics.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={showFollowPromptTest} className={buttonBase + ' bg-orange-600 hover:bg-orange-500 border-orange-500 text-white px-3 py-2'}>
                Show Prompt
              </button>
              <button
                disabled={followStatsLoading}
                onClick={() => void loadFollowStats()}
                className={buttonBase + ' bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2'}
              >
                {followStatsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-slate-500">Prompt follow actions</div>
              <div className="text-lg font-black text-orange-300">{followStats?.recordedFollowActions?.toLocaleString() ?? '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-slate-500">
                r/{followStats?.targetSubreddit ?? 'infinityorbs'} subscribers
              </div>
              <div className="text-lg font-black text-emerald-300">
                {followStats?.totalSubscribers == null ? '—' : followStats.totalSubscribers.toLocaleString()}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-600">
            Reddit does not expose whether a viewer was already subscribed, so prompt follow actions are not guaranteed net-new followers.
          </p>
        </section>

        <section className={panelBase + ' border border-fuchsia-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                <Users className="w-4 h-4" /> Fake CCU
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Adds a testing-only CCU offset to your Luck calculation. It does not change Current CCU or any historical Max CCU metric.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
            <input
              type="number"
              min="0"
              max="1000000"
              step="1"
              value={fakeCcuInput}
              onChange={e => setFakeCcuInput(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                void setFakeCcu(Math.max(0, Math.min(1_000_000, Math.floor(Number(fakeCcuInput) || 0))));
              }}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              placeholder="Fake CCU to add"
              title="Number of additional virtual players to add to the current real CCU for your Luck calculation."
            />
            <button
              disabled={ccuLoading}
              onClick={() => void setFakeCcu(Math.max(0, Math.min(1_000_000, Math.floor(Number(fakeCcuInput) || 0))))}
              className={buttonBase + ' bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-500 text-white px-3 py-2'}
            >
              Set Fake CCU
            </button>
            <button
              disabled={ccuLoading}
              onClick={() => {
                setFakeCcuInput('0');
                void setFakeCcu(0);
              }}
              className={buttonBase + ' bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2'}
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">Real CCU</div>
              <div className="text-lg font-black text-cyan-300 font-mono mt-1">{(ccuStats?.current ?? 0).toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">Luck CCU</div>
              <div className="text-lg font-black text-fuchsia-300 font-mono mt-1">
                {(ccuStats?.effectiveLuckCcu ?? ccuStats?.current ?? 0).toLocaleString()}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">
                +{(ccuStats?.fakeCcuBonus ?? 0).toLocaleString()} fake
              </div>
            </div>
          </div>
        </section>

        <section className={panelBase + ' border border-cyan-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <Gauge className="w-4 h-4" /> Max CCU
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Peak concurrent players recorded from the game's 30-second online presence window.
              </p>
            </div>
            <button
              title="Refresh current and historical peak concurrent-user counts."
              disabled={ccuLoading}
              onClick={() => void loadCcuStats()}
              className={buttonBase + ' bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300 px-3 py-2'}
            >
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" /> {ccuLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {[
              ['Current', ccuStats?.current ?? 0],
              ['Last 24 Hours', ccuStats?.last24Hours ?? 0],
              ['Last 7 Days', ccuStats?.last7Days ?? 0],
              ['Last 30 Days', ccuStats?.last30Days ?? 0],
              ['All Time', ccuStats?.allTime ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-3 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-500">{label as string}</div>
                <div className="text-xl font-black text-cyan-300 font-mono mt-1">
                  {Number(value).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <Database className="w-4 h-4" /> Reddit Gold Payment Logs
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Persistent server-side trace of the payment callback, buyer resolution, save read, and fulfillment. Run the sandbox purchase first, then press Refresh.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                title="Load the latest payment trace from the server."
                disabled={paymentLogsLoading}
                onClick={() => void loadPaymentLogs()}
                className={buttonBase + ' bg-slate-900 border-slate-700 text-slate-200 px-3 py-2'}
              >
                {paymentLogsLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button
                title="Copy the complete payment trace."
                disabled={paymentLogs.length === 0}
                onClick={() => void copyPaymentLogs()}
                className={buttonBase + ' bg-emerald-600/20 border-emerald-500/30 text-emerald-200 px-3 py-2'}
              >
                <Copy className="w-3.5 h-3.5 inline mr-1" /> Copy
              </button>
              <button
                title="Delete all stored payment traces."
                disabled={paymentLogsLoading || paymentLogs.length === 0}
                onClick={() => void clearPaymentLogs()}
                className={buttonBase + ' bg-red-600/20 border-red-500/30 text-red-200 px-3 py-2'}
              >
                <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Clear
              </button>
            </div>
          </div>

          <textarea
            id="payment-debug-log-copy"
            readOnly
            value={paymentLogs.length > 0 ? JSON.stringify(paymentLogs, null, 2) : 'No payment logs loaded. Run a Reddit Gold sandbox purchase, then press Refresh.'}
            className="w-full min-h-56 max-h-96 rounded-xl border border-slate-800 bg-black/40 p-3 text-[10px] leading-4 font-mono text-slate-300 resize-y"
            onFocus={e => e.currentTarget.select()}
          />
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            <Power className="w-4 h-4" /> Global Booster Control
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select title="Choose the Global Booster to edit." value={globalBooster} onChange={e => setGlobalBooster(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white">
              <option value="luck">Global Luck</option>
              <option value="speed">Global Speed</option>
              <option value="crit">Global Crit</option>
            </select>
            <select title="Choose the tier to force. Off disables the booster." value={globalTier} onChange={e => setGlobalTier(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white">
              {[0, 1, 5, 10].map(v => <option key={v} value={v}>{v === 0 ? 'Off' : 'Tier ' + v}</option>)}
            </select>
            <input value={globalMinutes} onChange={e => setGlobalMinutes(e.target.value)} type="number" min="1" title="How many minutes the forced Global Booster state should remain active." className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono" placeholder="minutes" />
            <button
              title="Set a Global Booster tier and duration directly without spending Shards."
              disabled={loading}
              onClick={() => void sendAdminAction('/api/dev/global-booster', { id: globalBooster, tier: Number(globalTier), minutes: Number(globalMinutes) })}
              className={buttonBase + ' bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-500 text-white px-3 py-2'}
            >
              Set Booster
            </button>
          </div>
        </section>

        <section className={panelBase + ' border border-rose-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
                <Save className="w-4 h-4" /> Save Trace
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Persistent diagnostics for save conflicts, including expected/stored revisions, generations, incoming state, stored state, and the save caller.
                Use the Player Spy username field to filter this trace to one player.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button title="Load recent save diagnostics, filtered by the Player Spy username when present." disabled={saveLogsLoading} onClick={() => void loadSaveLogs()} className={buttonBase + ' bg-slate-900 border-slate-700 text-slate-200 px-3 py-2'}>
                {saveLogsLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button title="Copy the complete save trace." disabled={saveLogs.length === 0} onClick={() => void copySaveLogs()} className={buttonBase + ' bg-emerald-600/20 border-emerald-500/30 text-emerald-200 px-3 py-2'}>
                <Copy className="w-3.5 h-3.5 inline mr-1" /> Copy
              </button>
              <button title="Delete all save diagnostics." disabled={saveLogsLoading || saveLogs.length === 0} onClick={() => void clearSaveLogs()} className={buttonBase + ' bg-red-600/20 border-red-500/30 text-red-200 px-3 py-2'}>
                <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Clear
              </button>
            </div>
          </div>
          <textarea
            id="save-debug-log-copy"
            readOnly
            value={saveLogs.length > 0 ? JSON.stringify(saveLogs, null, 2) : 'No save diagnostics loaded. Reproduce the player-state error, then press Refresh.'}
            className="w-full min-h-56 max-h-96 rounded-xl border border-slate-800 bg-black/40 p-3 text-[10px] leading-4 font-mono text-slate-300 resize-y"
            onFocus={e => e.currentTarget.select()}
          />
        </section>

        <section className={panelBase}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                <Database className="w-4 h-4" /> Global Booster Logs
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Persistent trace of Global Booster reads, state calculations, atomic writes, player currency deduction, and save failures.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button title="Load the latest Global Booster trace." disabled={globalBoosterLogsLoading} onClick={() => void loadGlobalBoosterLogs()} className={buttonBase + ' bg-slate-900 border-slate-700 text-slate-200 px-3 py-2'}>
                {globalBoosterLogsLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button title="Copy the complete Global Booster trace." disabled={globalBoosterLogs.length === 0} onClick={() => void copyGlobalBoosterLogs()} className={buttonBase + ' bg-emerald-600/20 border-emerald-500/30 text-emerald-200 px-3 py-2'}>
                <Copy className="w-3.5 h-3.5 inline mr-1" /> Copy
              </button>
              <button title="Delete all Global Booster traces." disabled={globalBoosterLogsLoading || globalBoosterLogs.length === 0} onClick={() => void clearGlobalBoosterLogs()} className={buttonBase + ' bg-red-600/20 border-red-500/30 text-red-200 px-3 py-2'}>
                <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Clear
              </button>
            </div>
          </div>
          <textarea
            id="global-booster-debug-log-copy"
            readOnly
            value={globalBoosterLogs.length > 0 ? JSON.stringify(globalBoosterLogs, null, 2) : 'No Global Booster logs loaded. Clear the trace, activate one booster, then press Refresh.'}
            className="w-full min-h-56 max-h-96 rounded-xl border border-slate-800 bg-black/40 p-3 text-[10px] leading-4 font-mono text-slate-300 resize-y"
            onFocus={e => e.currentTarget.select()}
          />
        </section>

        <section className={panelBase + ' border border-fuchsia-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                <Megaphone className="w-4 h-4" /> Push Notification Test
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Sends a real Reddit push notification to the current admin account. Notifications must be enabled first.
              </p>
            </div>
            <button
              title="Send a real test push notification to the current admin account."
              disabled={pushTestLoading}
              onClick={() => void sendPushTest()}
              className={buttonBase + ' bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-500 text-white px-3 py-2'}
            >
              {pushTestLoading ? 'Sending…' : 'Send Test Push'}
            </button>
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Megaphone className="w-4 h-4" /> Developer Announcement
          </div>
          <p className="text-[11px] text-slate-500">
            This text appears above the game navigation for every player. Leave it blank to hide the announcement.
          </p>
          <textarea
            value={announcementText}
            onChange={e => setAnnouncementText(e.target.value.slice(0, 1200))}
            disabled={!announcementLoaded || loading}
            rows={4}
            placeholder="Write the announcement players should see..."
            className="w-full rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-600 p-3 resize-y focus:outline-none focus:border-cyan-500/50"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">{announcementText.length}/1200 characters</span>
            <button
              title="Publish the current developer announcement."
              disabled={!announcementLoaded || loading}
              onClick={() => void sendAdminAction('/api/dev/announcement', { message: announcementText }, true, 'Developer announcement updated.')}
              className={`${buttonBase} bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2`}
            >
              <Save className="inline w-3.5 h-3.5 mr-1" /> Publish Announcement
            </button>
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Wand2 className="w-4 h-4" /> Test Presets
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['fresh', 'Fresh Save', 'bg-slate-800 hover:bg-slate-700'],
              ['max', 'Max Everything', 'bg-emerald-600 hover:bg-emerald-500'],
              ['frenzy-ready', 'Frenzy Ready', 'bg-fuchsia-600 hover:bg-fuchsia-500'],
              ['offline-ready', '1,000 Offline', 'bg-indigo-600 hover:bg-indigo-500'],
              ['quests-ready', 'Quests Ready', 'bg-amber-600 hover:bg-amber-500'],
              ['prestige-ready', 'Prestige Ready', 'bg-violet-600 hover:bg-violet-500'],
              ['booster-test', 'Boosters 1h', 'bg-cyan-600 hover:bg-cyan-500'],
              ['upgrades-max', 'Upgrades Max', 'bg-emerald-700 hover:bg-emerald-600'],
              ['upgrades-reset', 'Upgrades 0', 'bg-slate-800 hover:bg-slate-700'],
              ['prestige-max', 'Prestige Max', 'bg-violet-700 hover:bg-violet-600'],
              ['prestige-reset', 'Prestige 0', 'bg-slate-800 hover:bg-slate-700'],
              ['mastery-max', 'Mastery Max', 'bg-purple-700 hover:bg-purple-600'],
              ['mastery-reset', 'Mastery 0', 'bg-slate-800 hover:bg-slate-700'],
              ['automations-on', 'Automation On', 'bg-cyan-700 hover:bg-cyan-600'],
              ['automations-off', 'Automation Off', 'bg-slate-800 hover:bg-slate-700'],
              ['boosters-off', 'Boosters Off', 'bg-slate-800 hover:bg-slate-700'],
              ['collection-clear', 'Clear Collection', 'bg-rose-700 hover:bg-rose-600'],
              ['quests-reset', 'Reset Quests', 'bg-slate-800 hover:bg-slate-700'],
              ['streak-reset', 'Reset Streak', 'bg-slate-800 hover:bg-slate-700'],
              ['offline-clear', 'Clear Offline', 'bg-slate-800 hover:bg-slate-700'],
            ].map(([id, label, cls]) => (
              <button title={`Apply the ${label} test preset.`} key={id} disabled={loading} onClick={() => void setPreset(id)} className={`${buttonBase} border-transparent px-3 py-2 text-white ${cls}`}>
                {label}
              </button>
            ))}
            <button
              title="Reset daily, weekly, streak, free-shard, and Frenzy timing flags."
              disabled={loading}
              onClick={() => void sendAdminAction('/api/dev/reset-daily')}
              className={`${buttonBase} bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-300 px-3 py-2`}
            >
              <ListRestart className="inline w-3.5 h-3.5 mr-1" /> Reset Daily
            </button>
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Play className="w-4 h-4" /> Force Exact Roll
          </div>
          <div className="flex gap-2">
            <input
              title="Exact rarity denominator for the forced roll. For example, 100000 means 1/100,000."
              type="number"
              value={customRarity}
              onChange={e => setCustomRarity(e.target.value)}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              placeholder="Rarity denominator"
            />
            <button title="Perform one roll at the exact rarity entered in the field." onClick={() => void handleForceRoll(Number(customRarity))} disabled={loading} className={`${buttonBase} bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-white px-4`}>
              Roll Exact
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000].map(v => (
              <button title={`Force one roll at exact rarity 1/${v.toLocaleString()}.`} key={v} onClick={() => void handleForceRoll(v)} disabled={loading} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-1.5 font-mono`}>
                1/{v.toLocaleString()}
              </button>
            ))}
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Coins className="w-4 h-4" /> Resources
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ['/api/dev/currency', { coins: 10_000 }, '+10K Coins'],
              ['/api/dev/currency', { coins: 1_000_000 }, '+1M Coins'],
              ['/api/dev/currency', { coins: 100_000_000 }, '+100M Coins'],
              ['/api/dev/currency', { shards: 25 }, '+25 Shards'],
              ['/api/dev/currency', { shards: 500 }, '+500 Shards'],
              ['/api/dev/currency', { dust: 50 }, '+50 Dust'],
            ].map(([endpoint, body, label]) => (
              <button title="Add the displayed test resource amount without normal gameplay costs." key={label as string} onClick={() => void sendAdminAction(endpoint as string, body)} disabled={loading} className={`${buttonBase} bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300 px-2.5 py-2`}>
                {label as string}
              </button>
            ))}
          </div>
        </section>

        <section className={panelBase}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
              <Database className="w-4 h-4" /> Fine State Control
            </div>
            <button title="Make the next normal roll immediately available." disabled={loading} onClick={() => void sendAdminAction('/api/dev/reset-cooldown')} className={`${buttonBase} bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-300 px-3 py-1.5`}>
              <Gauge className="inline w-3.5 h-3.5 mr-1" /> Cooldown Ready
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {Object.entries(stateInputs).map(([key, value]) => (
              <label key={key} className="text-[10px] text-slate-400">
                <span className="block mb-1 uppercase font-bold">{key.replace(/([A-Z])/g, ' $1')}</span>
                <input
                  type="number"
                  value={value}
                  onChange={e => setStateInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  title="Set this field directly for testing. Leave blank to keep its current value." placeholder="leave blank"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button title="Apply every nonblank state field above directly to the current test account." disabled={loading} onClick={() => void updateState()} className={`${buttonBase} bg-purple-600 hover:bg-purple-500 border-purple-500 text-white px-4 py-2`}>
              <Save className="inline w-3.5 h-3.5 mr-1" /> Apply State Fields
            </button>
            <button title="Set every standard upgrade to a high testing level." disabled={loading} onClick={() => void sendAdminAction('/api/dev/unlock-upgrades')} className={`${buttonBase} bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2`}>
              Unlock Standard Upgrades
            </button>
            <button title="Populate the account with a broad maxed progression state for testing." disabled={loading} onClick={() => void sendAdminAction('/api/dev/unlock-everything')} className={`${buttonBase} bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300 px-3 py-2`}>
              <Sparkles className="inline w-3.5 h-3.5 mr-1" /> Everything
            </button>
            <button title="Add 50 offline rolls to the vault." disabled={loading} onClick={() => void sendAdminAction('/api/dev/add-offline', { amount: 50 })} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}>
              +50 Offline Rolls
            </button>
          </div>
        </section>

        <section className={`${panelBase} border border-fuchsia-500/30`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            <Flame className="w-4 h-4" /> Orb Frenzy Testing
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input
              type="number"
              value={frenzyRarity}
              onChange={e => setFrenzyRarity(e.target.value)}
              placeholder="Optional forced Frenzy rarity, e.g. 1000000"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
            <button
              title="Create a new test Frenzy post. The optional rarity forces its starting rarity and bypasses the daily limit."
              disabled={loading}
              onClick={async () => {
                const data = await sendAdminAction('/api/dev/frenzy/start', frenzyRarity.trim() ? { rarity: Number(frenzyRarity) } : {});
                if (data) {
                  setFrenzyPostId(data.postId ?? '');
                  setFrenzyPostUrl(data.url ?? '');
                }
              }}
              className={`${buttonBase} bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-500 text-white px-4 py-2`}
            >
              <Flame className="inline w-4 h-4 mr-1" /> Trigger Test Frenzy
            </button>
          </div>
          {frenzyPostId && (
            <div className="rounded-xl bg-slate-900 border border-fuchsia-500/20 p-3 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-500">Latest Test Post</div>
              <div className="text-xs font-mono text-fuchsia-200 break-all">{frenzyPostId}</div>
              {frenzyPostUrl && (
                <a href={frenzyPostUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 underline break-all">
                  Open Frenzy post
                </a>
              )}
              <button
                title="Claim the latest admin test Frenzy as the owner to test the reward flow."
                disabled={loading}
                onClick={() => {
                  if (!confirmation('Claim the latest admin test Frenzy with this admin account?')) return;
                  void sendAdminAction('/api/dev/frenzy/claim', { postId: frenzyPostId });
                }}
                className={`${buttonBase} bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300 px-3 py-2`}
              >
                Claim Own Test Frenzy
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button title="Clear Frenzy flags so another Frenzy test can run immediately." disabled={loading} onClick={() => void sendAdminAction('/api/dev/frenzy/reset')} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}>
              <RotateCcw className="inline w-3.5 h-3.5 mr-1" /> Reset Frenzy Flags
            </button>
            {[100, 10_000, 1_000_000, 100_000_000].map(v => (
              <button title={`Use 1/${v.toLocaleString()} as the forced Frenzy rarity.`} key={v} disabled={loading} onClick={() => setFrenzyRarity(String(v))} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-1.5 font-mono`}>
                1/{v.toLocaleString()}
              </button>
            ))}
          </div>
        </section>

        <section className={`${panelBase} border border-purple-500/30`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
            <Sparkles className="w-4 h-4" /> Community Event
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[1_000, 10_000, 100_000, 1_000_000].map(goal => (
              <button title={`Set the community event goal to ${goal.toLocaleString()} rolls.`} key={goal} disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { goal })} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-2 font-mono`}>
                Goal {goal >= 1_000_000 ? '1M' : goal >= 1_000 ? `${goal / 1000}K` : goal}
              </button>
            ))}
            {[0, 500, 5_000, 50_000].map(progress => (
              <button title={`Set community event progress to ${progress.toLocaleString()}.`} key={`progress-${progress}`} disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { progress })} className={`${buttonBase} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 px-2.5 py-2`}>
                Progress {progress >= 1000 ? `${progress / 1000}K` : progress}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[500, 5_000, 50_000].map(amount => (
              <button title={`Add ${amount.toLocaleString()} rolls to community event progress.`} key={amount} disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { addRolls: amount })} className={`${buttonBase} bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/40 text-purple-300 px-3 py-1.5`}>
                +{amount.toLocaleString()} Event Rolls
              </button>
            ))}
            <button title="Reset the community event to its base state." disabled={loading} onClick={() => void sendAdminAction('/api/dev/event', { reset: true })} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-1.5`}>
              Reset Event
            </button>
          </div>
        </section>

        <section className={`${panelBase} border border-rose-500/30`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
            <Shield className="w-4 h-4" /> Game Moderation
          </div>
          <p className="text-[10px] text-slate-500">
            These actions affect Infinity Orbs accounts only. They do not ban, mute, approve, or otherwise moderate Reddit users.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <input
              value={targetUser}
              onChange={e => setTargetUser(e.target.value)}
              title="Enter the Reddit username whose Infinity Orbs game account you want to manage." placeholder="Reddit username, without u/"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <select
              title="Choose the duration of a game-only ban. Permanent stays until manually unbanned."
              value={banDuration}
              onChange={e => setBanDuration(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="permanent">Permanent game ban</option>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              title="This reason is shown to the player on the Infinity Orbs ban screen." placeholder="Game ban reason"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              title="Ban your own Infinity Orbs account only. The ban screen will keep the admin console available so you can unban yourself."
              disabled={loading}
              onClick={() => {
                const self = contextInfo?.username ?? '';
                if (!self) {
                  setMessage('Could not determine the current admin username.');
                  return;
                }
                if (!confirmation('Ban your own Infinity Orbs account using the current game-ban settings?')) return;
                void sendAdminAction('/api/dev/moderation/self-game-ban', {
                  durationDays: banDuration === 'permanent' ? null : Number(banDuration),
                  reason: banReason,
                });
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Ban className="inline w-3.5 h-3.5 mr-1" /> Ban Myself (Test)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <button
              title="Ban the selected account from Infinity Orbs only. This does not affect Reddit."
              disabled={loading || !targetUser.trim()}
              onClick={() => void sendAdminAction('/api/dev/moderation/ban', {
                username: targetUser,
                durationDays: banDuration === 'permanent' ? null : Number(banDuration),
                reason: banReason,
              })}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Ban className="inline w-3.5 h-3.5 mr-1" /> Ban in Game
            </button>
            <button
              title="Remove the selected account's Infinity Orbs game ban."
              disabled={loading || !targetUser.trim()}
              onClick={() => void sendAdminAction('/api/dev/moderation/unban', { username: targetUser })}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" /> Unban Game
            </button>
            <button
              title="Delete the selected player's Infinity Orbs save. This does not change their game-ban record."
              disabled={loading || !targetUser.trim()}
              onClick={() => requestWipeConfirmation('wipe-game')}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <UserX className="inline w-3.5 h-3.5 mr-1" /> Wipe Save
            </button>
            <button
              title="Delete the selected save and then apply the selected Infinity Orbs game ban."
              disabled={loading || !targetUser.trim()}
              onClick={() => requestWipeConfirmation('wipe-and-ban')}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Ban className="inline w-3.5 h-3.5 mr-1" /> Wipe + Ban
            </button>
            <button
              title="Delete the selected save and remove the selected Infinity Orbs game ban."
              disabled={loading || !targetUser.trim()}
              onClick={() => requestWipeConfirmation('wipe-and-unban')}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <Trash2 className="inline w-3.5 h-3.5 mr-1" /> Wipe + Unban
            </button>
            <button
              title="Inspect the selected account\'s live save, generation, level, XP, and game-ban state."
              disabled={loading || !targetUser.trim()}
              onClick={async () => {
                setLoading(true);
                setMessage('');
                try {
                  const res = await fetch('/api/dev/moderation/save?username=' + encodeURIComponent(targetUser.trim()));
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || 'Could not inspect player save.');
                  const save = data.save;
                  setMessage('Save: ' + (data.exists ? 'exists' : 'missing') + ' | Level ' + (save?.level ?? 1) + ' | XP ' + Number(save?.xp ?? 0).toLocaleString() + ' | Gen ' + (save?.saveGeneration ?? 0) + '/' + (data.generation ?? 0) + ' | Ban: ' + (data.ban ? 'ACTIVE' : 'none'));
                } catch (e: any) {
                  setMessage('Error: ' + (e?.message || 'Could not inspect player save.'));
                } finally {
                  setLoading(false);
                }
              }}
              className="rounded-xl border text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-white px-3 py-2"
            >
              <Database className="inline w-3.5 h-3.5 mr-1" /> Inspect Save
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              title="Load the current list of active Infinity Orbs game bans."
              disabled={loading}
              onClick={() => void getBannedUsers()}
              className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}
            >
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" /> Load Banned Game Accounts
            </button>
            <button
              title="Delete your own Infinity Orbs save while keeping your game-ban record unchanged."
              disabled={loading}
              onClick={() => {
                const self = contextInfo?.username ?? '';
                if (!self) return;
                if (pendingWipe?.action === 'wipe-game' && pendingWipe.username.toLowerCase() === self.toLowerCase()) {
                  setPendingWipe(null);
                  void sendAdminAction('/api/dev/moderation/wipe-game', { username: self }, true, 'Wiped your save successfully.');
                  return;
                }
                setPendingWipe({ action: 'wipe-game', username: self });
                setMessage('Click "Wipe My Save" again to confirm for u/' + self + '.');
              }}
              className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}
            >
              Wipe My Save
            </button>
            <button
              title="Remove your own Infinity Orbs game ban. This is also available from the ban screen."
              disabled={loading}
              onClick={() => {
                const self = contextInfo?.username ?? '';
                if (!self) return;
                void sendAdminAction('/api/dev/moderation/unban', { username: self });
              }}
              className={`${buttonBase} bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2`}
            >
              Unban Me
            </button>
          </div>

          {bannedUsers.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800">
              {bannedUsers.map(user => (
                <div key={user.userId ?? user.username} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-200">u/{user.username}</div>
                    <div className="text-[10px] text-slate-500">
                      {user.bannedUntil === null ? 'Permanent' : `Until ${new Date(user.bannedUntil).toLocaleString()}`} · {user.reason}
                    </div>
                  </div>
                  <button
                    title="Remove this listed player's Infinity Orbs game ban."
                    disabled={loading}
                    onClick={() => void sendAdminAction('/api/dev/moderation/unban', { username: user.username })}
                    className={`${buttonBase} bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2`}
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`${panelBase} border border-cyan-500/30`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <Users className="w-4 h-4" /> Player List
            </div>
            <button
              title="Load every player account Infinity Orbs has registered, with currently active players first."
              disabled={loading}
              onClick={() => void getPlayerList()}
              className={`${buttonBase} bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300 px-3 py-2`}
            >
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" /> Refresh Player List
            </button>
          </div>
          <p className="text-[10px] text-slate-500">Active means the account contacted the game within the last 30 seconds. Active players stay at the top.</p>
          {playerList.length > 0 ? (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800">
              {playerList.map(player => (
                <div key={player.userId} className="px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-200 truncate">u/{player.username}</span>
                      {player.active && <span className="text-[9px] font-black uppercase text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">Active</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Level {player.level} · {player.totalRolls.toLocaleString()} rolls · Best 1/{Math.max(1, player.highestRarity).toLocaleString()}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-slate-400">{player.active ? 'Online now' : player.lastSeenAt ? new Date(player.lastSeenAt).toLocaleString() : 'No recent activity'}</div>
                    <div className="text-[9px] text-slate-600 font-mono">ID {player.userId.slice(-8)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-500">No player accounts are registered yet.</div>
          )}
        </section>

        <section className={panelBase + ' border border-fuchsia-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                <Users className="w-4 h-4" /> Player Spy
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Loads gameplay telemetry for one player so balance problems can be investigated from real progression and roll data.
              </p>
            </div>
            <span className="text-[10px] text-slate-600 font-mono">{playerSpyLogs.length}/500</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2">
            <input
              value={playerSpyUsername}
              onChange={e => setPlayerSpyUsername(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void loadPlayerSpy();
              }}
              title="Enter the Reddit username whose gameplay logs you want to inspect."
              placeholder="Reddit username, without u/"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              title="Load the latest 500 gameplay telemetry events for this player."
              disabled={playerSpyLoading || !playerSpyUsername.trim()}
              onClick={() => void loadPlayerSpy()}
              className={buttonBase + ' bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-500 text-white px-3 py-2'}
            >
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" />
              {playerSpyLoading ? 'Loading…' : 'Spy'}
            </button>
            <button
              title="Toggle a compact Player Spy format that removes duplicate activation entries and repeated state snapshots so the log is small enough to paste into chat."
              disabled={playerSpyLogs.length === 0}
              onClick={() => {
                const next = !playerSpyShortened;
                setPlayerSpyShortened(next);
                setMessage(next
                  ? 'Player Spy log shortened for chat. The detailed JSON is still available with Full Log.'
                  : 'Player Spy log restored to full JSON.');
              }}
              className={buttonBase + ' bg-cyan-600/20 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-200 px-3 py-2'}
            >
              <ListRestart className="inline w-3.5 h-3.5 mr-1" /> {playerSpyShortened ? 'Full Log' : 'Shorten Log'}
            </button>
            <button
              title={playerSpyShortened
                ? 'Copy the shortened Player Spy log for pasting into ChatGPT or another analysis tool.'
                : 'Copy the Player Spy data as JSON so it can be analyzed externally or pasted into ChatGPT.'}
              disabled={playerSpyLogs.length === 0}
              onClick={() => void copyPlayerSpy()}
              className={buttonBase + ' bg-emerald-600/20 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-200 px-3 py-2'}
            >
              <Copy className="inline w-3.5 h-3.5 mr-1" /> {playerSpyShortened ? 'Copy Shortened' : 'Copy'}
            </button>
          </div>

          {playerSpyUserId && (
            <div className="text-[10px] text-slate-600 font-mono">
              u/{playerSpyUsername.replace(/^u\//i, '')} · ID {playerSpyUserId.slice(-10)}
            </div>
          )}

          <textarea
            id="player-spy-log-copy"
            readOnly
            value={playerSpyLogs.length > 0
              ? (playerSpyShortened
                ? shortenedPlayerSpyLog()
                : fullPlayerSpyLog())
              : 'No Player Spy logs loaded. Enter a Reddit username and press Spy.'}
            className="w-full min-h-72 max-h-[32rem] rounded-xl border border-slate-800 bg-black/40 p-3 text-[10px] leading-4 font-mono text-slate-300 resize-y"
            onFocus={e => e.currentTarget.select()}
          />
        </section>

        <section className={panelBase + ' border border-amber-500/30'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <Shield className="w-4 h-4" /> Guild Chat Spy
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Moderation-only view of every message currently retained in every guild. Refreshes every 3 seconds after the first load.
              </p>
            </div>
            <button
              title="Load all stored Guild Chat messages and active chat mutes."
              disabled={guildChatSpyLoading}
              onClick={() => void loadGuildChatSpy()}
              className={buttonBase + ' bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300 px-3 py-2'}
            >
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" />
              {guildChatSpyLoading ? 'Loading…' : 'Refresh Spy'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input
              value={guildChatMuteUser}
              onChange={e => setGuildChatMuteUser(e.target.value)}
              title="Enter a Reddit username to mute or unmute from all Infinity Orbs Guild Chat."
              placeholder="Reddit username, without u/"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <div className="flex gap-2">
              <button
                title="Mute this account from every Infinity Orbs Guild Chat."
                disabled={loading || !guildChatMuteUser.trim()}
                onClick={async () => {
                  const name = guildChatMuteUser.trim().replace(/^u\//i, '');
                  const data = await sendAdminAction('/api/dev/guild-chat/mute', { username: name }, false, 'Muted u/' + name + ' in Guild Chat.');
                  if (data) {
                    setGuildChatMuteUser('');
                    await loadGuildChatSpy(true);
                  }
                }}
                className={buttonBase + ' bg-rose-600/20 hover:bg-rose-600/30 border-rose-500/40 text-rose-200 px-3 py-2'}
              >
                Mute
              </button>
              <button
                title="Unmute this account from every Infinity Orbs Guild Chat."
                disabled={loading || !guildChatMuteUser.trim()}
                onClick={async () => {
                  const name = guildChatMuteUser.trim().replace(/^u\//i, '');
                  const data = await sendAdminAction('/api/dev/guild-chat/unmute', { username: name }, false, 'Unmuted u/' + name + ' from Guild Chat.');
                  if (data) {
                    setGuildChatMuteUser('');
                    await loadGuildChatSpy(true);
                  }
                }}
                className={buttonBase + ' bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 px-3 py-2'}
              >
                Unmute
              </button>
            </div>
          </div>

          {guildChatMutes.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3 space-y-2">
              <div className="text-[10px] uppercase font-bold text-rose-300">Muted accounts</div>
              <div className="flex flex-wrap gap-2">
                {guildChatMutes.map(mute => (
                  <button
                    key={mute.userId}
                    title={'Unmute u/' + mute.username + ' from Guild Chat.'}
                    disabled={loading}
                    onClick={() => void toggleGuildChatMute(mute.username, true)}
                    className={buttonBase + ' bg-rose-500/10 border-rose-500/30 text-rose-200 px-2.5 py-1.5'}
                  >
                    u/{mute.username} · Unmute
                  </button>
                ))}
              </div>
            </div>
          )}

          {guildChatSpy.length > 0 ? (
            <div className="space-y-3">
              {guildChatSpy.map(guild => {
                const mutedNames = new Set(guildChatMutes.map(mute => mute.username.toLowerCase()));
                return (
                  <div key={guild.id} className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white">[{guild.tag}] {guild.name}</div>
                        <div className="text-[10px] text-slate-500">{guild.memberCount} members · {guild.messages.length} stored messages</div>
                      </div>
                    </div>
                    {guild.messages.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/80">
                        {guild.messages.map(msg => {
                          const isMuted = !msg.isSystem && mutedNames.has(msg.username.toLowerCase());
                          return (
                            <div key={msg.id} className="px-3 py-2 flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={'text-xs font-bold ' + (msg.isSystem ? 'text-slate-500' : 'text-slate-200')}>u/{msg.username}</span>
                                  {isMuted && <span className="text-[9px] font-black uppercase text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-full px-1.5 py-0.5">Muted</span>}
                                  <span className="text-[9px] text-slate-600">{new Date(msg.timestamp).toLocaleString()}</span>
                                </div>
                                <div className={'text-xs mt-0.5 whitespace-pre-wrap break-words ' + (msg.isSystem ? 'text-slate-500 italic' : 'text-slate-300')}>{msg.text}</div>
                              </div>
                              {!msg.isSystem && (
                                <button
                                  title={(isMuted ? 'Unmute ' : 'Mute ') + 'u/' + msg.username + ' from all Guild Chat.'}
                                  disabled={loading}
                                  onClick={() => void toggleGuildChatMute(msg.username, isMuted)}
                                  className={buttonBase + ' ' + (isMuted
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200') + ' px-2 py-1 shrink-0'}
                                >
                                  {isMuted ? 'Unmute' : 'Mute'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 text-xs text-slate-600 italic">No stored messages.</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-500">
              Press Refresh Spy to load Guild Chat across all guilds.
            </div>
          )}
        </section>

        <section className="bg-rose-950/20 border border-rose-500/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
            <Trash2 className="w-4 h-4" /> Destructive Testing
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              title="Erase the entire current Infinity Orbs save and restore the normal starting state."
              disabled={loading}
              onClick={() => {
                if (!confirmation('Reset your entire Infinity Orbs save to a fresh state?')) return;
                void sendAdminAction('/api/dev/reset-all');
              }}
              className={`${buttonBase} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white px-3 py-2`}
            >
              <RotateCcw className="inline w-3.5 h-3.5 mr-1" /> Reset My Save
            </button>
            <button title="Reset the current test account to the ordinary new-player starting state." disabled={loading} onClick={() => void sendAdminAction('/api/dev/preset', { preset: 'fresh' })} className={`${buttonBase} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 px-3 py-2`}>
              <Database className="inline w-3.5 h-3.5 mr-1" /> Fresh State
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
