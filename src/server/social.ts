import { context, redis } from './devvit-mock.js';
import type {
  Guild,
  LeaderboardEntry,
  Achievement,
  GuildMessage,
  GuildPerkId,
  WorldEvent,
  GlobalChatMessage,
} from '../shared/social.js';
import { ACHIEVEMENTS, CHALLENGE_POOL, challengeForWeek, COMMUNITY_WORLD_EVENT, createInitialGuildBoss } from '../shared/social.js';
import type { PlayerState } from '../shared/game.js';
import { cooldownMs, createInitialState, grantFreeShards, spendShards, weekEndMs, weekKey, GUILD_LUCK_PER_RANK, GUILD_SPEED_REDUCTION_MS_PER_RANK, GUILD_OFFLINE_CAPACITY_PER_RANK, GUILD_SHARD_CHANCE_PER_RANK, GUILD_CRIT_CHANCE_PER_RANK, GUILD_COIN_MULTIPLIER_PER_RANK, GUILD_TOKEN_YIELD_PER_RANK, GUILD_XP_MULTIPLIER_PER_RANK } from '../shared/game.js';

const user = () => context.userId ?? 'unknown';
const username = () => context.username ?? `reddit-user-${user().slice(-8)}`;
const key = (name: string) => `io:${name}`;
const GUILDS_KEY = key('guilds');
const GUILD_CHAT_MUTES_KEY = key('guild-chat-mutes:v1');

function parseStoredJson<T>(raw: unknown): T | null {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  if (typeof raw === 'object') {
    const value = raw as Record<string, unknown>;
    // Be tolerant of Redis/adapter responses that wrap the stored value.
    if ('value' in value) return parseStoredJson<T>(value.value);
    if ('data' in value) return parseStoredJson<T>(value.data);
    return raw as T;
  }

  return null;
}

async function ensureRedisStringKey(keyName: string, fallback: string): Promise<void> {
  const existing = await redis.get(keyName);
  if (existing == null) {
    await redis.set(keyName, fallback);
  }
}

function parseGuildList(raw: unknown): Guild[] {
  const parsed = parseStoredJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  return normalizeGuilds(parsed.filter(item => item && typeof item === 'object') as Guild[]);
}

function parseLeaderboardList(raw: unknown): LeaderboardEntry[] {
  const parsed = parseStoredJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(item => item && typeof item === 'object') as LeaderboardEntry[];
}
const COMMUNITY_EVENT_KEY = key('community_event');

function normalizeGuilds(guilds: Guild[], now = Date.now()): Guild[] {
  const currentWeek = weekKey(now);
  for (const g of guilds) {
    if (!g.perks) {
      g.perks = {
        luckRank: 0,
        speedRank: 0,
        vaultRank: 0,
        shardRank: 0,
        critRank: 0,
        coinRank: 0,
        memberCapacityRank: 0,
        tokenYieldRank: 0,
        guildXpRank: 0,
      };
    } else {
      if (g.perks.memberCapacityRank == null) {
        g.perks.memberCapacityRank = Math.min(40, Math.max(0, g.members.length - 10));
      }
      g.perks.tokenYieldRank ??= 0;
      g.perks.guildXpRank ??= 0;
    }
    g.taxRate = Math.max(0, Math.min(10, Math.floor(Number(g.taxRate ?? 0) || 0)));
    for (const member of g.members) {
      if (member.role === 'owner') member.trusted = true;
      member.userId = member.userId || undefined;
    }
    if (!g.boss || (g as any).bossWeek !== currentWeek) {
      g.boss = createInitialGuildBoss(Math.max(1, Math.min(10, g.level || 1)));
      (g as any).bossWeek = currentWeek;
    }
    if (!g.challenge || (g as any).challengeWeek !== currentWeek) {
      g.challenge = challengeForWeek();
      (g as any).challengeWeek = currentWeek;
    }
  }
  return guilds;
}

function memberMatches(member: Guild['members'][number], requestedUsername?: string): boolean {
  const currentUsername = username();
  return Boolean(
    (member.userId && member.userId === user()) ||
    member.username === requestedUsername ||
    member.username === currentUsername,
  );
}

function currentGuild(guilds: Guild[]): Guild | undefined {
  return guilds.find(g => g.members.some(member => memberMatches(member)));
}

function maxGuildMembersForGuild(guild: Guild): number {
  return 10 + Math.min(40, Math.max(0, Math.floor(guild.perks?.memberCapacityRank ?? 0)));
}

function isTrustedMember(guild: Guild, member: Guild['members'][number]): boolean {
  return member.role === 'owner' || member.role === 'officer' || member.trusted === true;
}

function guildPerkMax(perk: GuildPerkId): number {
  if (perk === 'memberCapacityRank') return 40;
  if (perk === 'tokenYieldRank' || perk === 'guildXpRank') return 20;
  return 10;
}

function guildPerkCost(perk: GuildPerkId, currentRank: number): number {
  const base = perk === 'memberCapacityRank' ? 250 : 100;
  const exponent = perk === 'memberCapacityRank' ? 1.45 : 1.65;
  return Math.max(1, Math.round(base * Math.pow(currentRank + 1, exponent)));
}

async function updateGuilds<T>(mutator: (guilds: Guild[]) => Promise<T> | T): Promise<T> {
  // The transaction client queues the pre-MULTI GET for EXEC. If the key does not
  // exist, Valkey returns nil for that command and the adapter cannot transform
  // the transaction result. Initialize the collection once so the watched GET
  // always has a concrete string reply.
  await ensureRedisStringKey(GUILDS_KEY, '[]');

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(GUILDS_KEY);
    const raw = await redis.get(GUILDS_KEY);
    const guilds: Guild[] = parseGuildList(raw);
    try {
      const result = await mutator(guilds);
      await txn.multi();
      await txn.set(GUILDS_KEY, JSON.stringify(guilds));
      const committed = await txn.exec();
      if (committed !== null) return result;
    } catch (error) {
      await txn.unwatch();
      throw error;
    }
  }
  throw new Error('Guild data changed while processing the request. Please retry.');
}


async function loadGuilds(): Promise<Guild[]> {
  const raw = await redis.get(GUILDS_KEY);
  return parseGuildList(raw);
}

export interface GuildChatSpyGuild {
  id: string;
  name: string;
  tag: string;
  memberCount: number;
  messages: GuildMessage[];
}

export async function listGuildChatSpy(): Promise<{
  guilds: GuildChatSpyGuild[];
  mutes: import('../shared/social.js').GuildChatMuteRecord[];
}> {
  const guilds = await loadGuilds();
  const rawMutes = await redis.hGetAll(GUILD_CHAT_MUTES_KEY);
  const mutes: import('../shared/social.js').GuildChatMuteRecord[] = [];

  if (rawMutes && typeof rawMutes === 'object') {
    for (const [userId, raw] of Object.entries(rawMutes as Record<string, string>)) {
      if (!raw) continue;
      const parsed = parseStoredJson<import('../shared/social.js').GuildChatMuteRecord>(raw);
      if (!parsed || !parsed.userId || !parsed.username) continue;
      mutes.push({
        userId: parsed.userId || userId,
        username: parsed.username,
        mutedAt: Number(parsed.mutedAt ?? 0) || 0,
        mutedBy: parsed.mutedBy || 'Admin',
      });
    }
  }

  mutes.sort((a, b) => b.mutedAt - a.mutedAt);

  return {
    guilds: guilds.map(guild => ({
      id: guild.id,
      name: guild.name,
      tag: guild.tag,
      memberCount: guild.members.length,
      messages: Array.isArray(guild.chat) ? guild.chat : [],
    })),
    mutes,
  };
}

export async function isGuildChatMuted(userId = user()): Promise<boolean> {
  if (!userId || userId === 'unknown') return false;
  const raw = await redis.hGet(GUILD_CHAT_MUTES_KEY, userId);
  return Boolean(raw);
}

export async function muteGuildChatUser(
  userId: string,
  targetUsername: string,
  mutedBy = username(),
): Promise<import('../shared/social.js').GuildChatMuteRecord> {
  const record: import('../shared/social.js').GuildChatMuteRecord = {
    userId: String(userId),
    username: String(targetUsername).trim().replace(/^u\//i, ''),
    mutedAt: Date.now(),
    mutedBy: String(mutedBy).trim() || 'Admin',
  };
  await redis.hSet(GUILD_CHAT_MUTES_KEY, {
    [record.userId]: JSON.stringify(record),
  });
  return record;
}

export async function unmuteGuildChatUser(userId: string): Promise<boolean> {
  const existing = await redis.hGet(GUILD_CHAT_MUTES_KEY, userId);
  if (!existing) return false;
  await redis.hSet(GUILD_CHAT_MUTES_KEY, { [userId]: '' });
  return true;
}

export async function guildInfo() {
  const guilds = await loadGuilds();
  const mine = currentGuild(guilds);
  return {
    guilds: guilds.sort((a, b) => b.xp - a.xp).slice(0, 20),
    mine: mine ?? null,
  };
}

export async function getPlayerGuildPerks(uname: string, uid?: string) {
  const guilds = await loadGuilds();
  const mine = guilds.find(g => g.members.some(m => (uid && m.userId === uid) || m.username === uname));
  return mine?.perks ?? {
    luckRank: 0,
    speedRank: 0,
    vaultRank: 0,
    shardRank: 0,
    critRank: 0,
    coinRank: 0,
    memberCapacityRank: 0,
    tokenYieldRank: 0,
    guildXpRank: 0,
  };
}

export async function addGuildTokens(uname: string, amount: number) {
  if (amount <= 0) return;
  await updateGuilds(guilds => {
    const guild = guilds.find(g => g.members.some(m => m.username === uname));
    if (!guild) return;
    const tokenMultiplier = 1 + Math.max(0, Math.floor(guild.perks?.tokenYieldRank ?? 0)) * GUILD_TOKEN_YIELD_PER_RANK;
    guild.tokens = (guild.tokens ?? 0) + Math.max(1, Math.floor(amount * tokenMultiplier));
    if (!guild.chat) guild.chat = [];
    guild.chat.push({
      id: `msg-${Date.now()}`,
      username: 'System',
      text: `${uname} contributed +${amount} Guild Tokens from quest.`,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (guild.chat.length > 50) guild.chat.shift();
  });
}

export async function buyGuildPerk(perk: GuildPerkId) {
  return updateGuilds(guilds => {
    const guild = currentGuild(guilds);
    if (!guild) throw new Error('You are not in a guild.');
    const member = guild.members.find(m => memberMatches(m));
    if (!member || !isTrustedMember(guild, member)) {
      throw new Error('You are not trusted to purchase Guild Upgrades.');
    }

    if (!guild.perks) guild.perks = {
      luckRank: 0, speedRank: 0, vaultRank: 0, shardRank: 0,
      critRank: 0, coinRank: 0, memberCapacityRank: 0, tokenYieldRank: 0, guildXpRank: 0,
    };

    const current = Math.max(0, Math.floor(guild.perks[perk] ?? 0));
    const max = guildPerkMax(perk);
    if (current >= max) throw new Error(`Perk is already max level (${max}).`);

    const cost = guildPerkCost(perk, current);
    if ((guild.tokens ?? 0) < cost) {
      throw new Error(`Guild needs ${cost.toLocaleString()} Guild Tokens.`);
    }

    guild.tokens -= cost;
    guild.perks[perk] = current + 1;

    const perkNames: Record<GuildPerkId, string> = {
      luckRank: 'Luck Aura',
      speedRank: 'Speed Blessing',
      vaultRank: 'Vault Expansion',
      shardRank: 'Shard Attunement',
      critRank: 'Critical Alignment',
      coinRank: 'Prosperity Sigil',
      memberCapacityRank: 'Member Capacity',
      tokenYieldRank: 'Token Yield',
      guildXpRank: 'Guild Growth',
    };

    if (!guild.chat) guild.chat = [];
    guild.chat.push({
      id: `msg-${Date.now()}`,
      username: 'System',
      text: `${username()} upgraded ${perkNames[perk]} to Level ${guild.perks[perk]}.`,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (guild.chat.length > 50) guild.chat.shift();

    return { guild, perk, level: guild.perks[perk], cost };
  });
}

export async function setGuildTrust(targetUsername: string, trusted: boolean) {
  return updateGuilds(guilds => {
    const guild = currentGuild(guilds);
    if (!guild) throw new Error('You are not in a guild.');
    const actor = guild.members.find(m => memberMatches(m));
    if (!actor || actor.role !== 'owner') {
      throw new Error('Only the guild owner can change Trust status.');
    }
    const target = guild.members.find(m => m.username === targetUsername);
    if (!target) throw new Error('Guild member not found.');
    if (target.role === 'owner') {
      target.trusted = true;
    } else {
      target.trusted = trusted;
    }
    return target;
  });
}

export async function setGuildTaxRate(rate: number) {
  const safeRate = Math.max(0, Math.min(10, Math.floor(Number(rate) || 0)));
  return updateGuilds(guilds => {
    const guild = currentGuild(guilds);
    if (!guild) throw new Error('You are not in a guild.');
    const actor = guild.members.find(m => memberMatches(m));
    if (!actor || !isTrustedMember(guild, actor)) {
      throw new Error('You are not trusted to change the Guild Tax.');
    }
    guild.taxRate = safeRate;
    if (!guild.chat) guild.chat = [];
    guild.chat.push({
      id: `msg-${Date.now()}-tax`,
      username: 'System',
      text: `Guild Tax set to ${safeRate}%.`,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (guild.chat.length > 50) guild.chat.shift();
    return guild;
  });
}

export async function applyGuildTax(coinsEarned: number): Promise<{ taxedCoins: number; tokensEarned: number }> {
  const safeCoins = Math.max(0, Math.floor(coinsEarned || 0));
  if (safeCoins < 100) return { taxedCoins: 0, tokensEarned: 0 };

  return updateGuilds(guilds => {
    const guild = currentGuild(guilds);
    if (!guild) return { taxedCoins: 0, tokensEarned: 0 };

    const rate = Math.max(0, Math.min(10, Math.floor(Number(guild.taxRate ?? 0) || 0)));
    const taxedCoins = Math.min(safeCoins, Math.floor(safeCoins * rate / 100));
    if (taxedCoins <= 0) return { taxedCoins: 0, tokensEarned: 0 };

    const tokenMultiplier = 1 + Math.max(0, Math.floor(guild.perks?.tokenYieldRank ?? 0)) * 0.05;
    const tokensEarned = Math.max(1, Math.floor((taxedCoins / 100) * tokenMultiplier));
    guild.tokens = (guild.tokens ?? 0) + tokensEarned;
    return { taxedCoins, tokensEarned };
  });
}

export async function donateToGuildAtomic(coins: number, shards: number) {
  const safeCoins = Math.max(0, Math.floor(Number(coins) || 0));
  const safeShards = Math.max(0, Math.floor(Number(shards) || 0));
  const playerKey = 'player:' + user();
  const generationKey = 'player-generation:' + user();

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(GUILDS_KEY, playerKey, generationKey);
    const [guildRaw, playerRaw, generationRaw] = await Promise.all([
      redis.get(GUILDS_KEY),
      redis.get(playerKey),
      redis.get(generationKey),
    ]);
    const guilds = parseStoredJson<Guild[]>(guildRaw) ?? [];
    const state = parseStoredJson<PlayerState>(playerRaw);
    const generation = Math.max(0, Number.parseInt(String(generationRaw ?? '0'), 10) || 0);
    if (!state) {
      await txn.unwatch();
      throw new Error('Player state unavailable.');
    }
    if (Math.max(0, Math.floor(Number(state.saveGeneration ?? 0))) !== generation) {
      await txn.unwatch();
      throw new Error('Your Infinity Orbs save was invalidated by an admin wipe. Please reload.');
    }

    const guild = guilds.find(g => g.members.some(m => memberMatches(m)));
    if (!guild) {
      await txn.unwatch();
      throw new Error('You are not in a guild.');
    }
    const member = guild.members.find(m => memberMatches(m));
    if (!member) {
      await txn.unwatch();
      throw new Error('Guild member not found.');
    }
    if (state.coins < safeCoins || (state.shards ?? 0) < safeShards) {
      await txn.unwatch();
      throw new Error('Not enough Coins or Shards.');
    }
    if (safeCoins === 0 && safeShards === 0) {
      await txn.unwatch();
      throw new Error('Donation must be at least 500 Coins or 1 Shard.');
    }

    const tokenMultiplier = 1 + Math.max(0, Math.floor(guild.perks?.tokenYieldRank ?? 0)) * GUILD_TOKEN_YIELD_PER_RANK;
    const xpMultiplier = 1 + Math.max(0, Math.floor(guild.perks?.guildXpRank ?? 0)) * GUILD_XP_MULTIPLIER_PER_RANK;
    const tokenGain = Math.floor((Math.floor(safeCoins / 500) * 5 + safeShards * 5) * tokenMultiplier);
    const xpGain = Math.max(0, Math.floor((Math.floor(safeCoins / 50) + safeShards * 25) * xpMultiplier));
    if (tokenGain <= 0 && xpGain <= 0) {
      await txn.unwatch();
      throw new Error('Donation must be at least 500 Coins or 1 Shard.');
    }

    state.coins -= safeCoins;
    if (safeShards > 0) spendShards(state, safeShards);
    state.guildContribution = (state.guildContribution ?? 0) + safeCoins + safeShards * 1000;
    state.stateRevision = Math.max(0, Math.floor(Number(state.stateRevision ?? 0)) || 0) + 1;
    state.saveGeneration = generation;

    member.contribution += safeCoins + safeShards * 1000;
    guild.xp += xpGain;
    guild.level = 1 + Math.floor(guild.xp / 500);
    guild.tokens = (guild.tokens ?? 0) + tokenGain;
    if (!guild.chat) guild.chat = [];
    const parts: string[] = [];
    if (safeCoins > 0) parts.push(safeCoins.toLocaleString() + ' Coins');
    if (safeShards > 0) parts.push(safeShards + ' Shards');
    guild.chat.push({
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      username: 'System',
      text: username() + ' donated ' + parts.join(' and ') + ' (+' + tokenGain + ' Tokens, +' + xpGain + ' Guild XP).',
      timestamp: Date.now(),
      isSystem: true,
    });
    if (guild.chat.length > 50) guild.chat.shift();

    await txn.multi();
    await txn.set(GUILDS_KEY, JSON.stringify(guilds));
    await txn.set(playerKey, JSON.stringify(state));
    const committed = await txn.exec();
    if (committed !== null) return { guild, tokensEarned: tokenGain, xpEarned: xpGain, state };
  }
  throw new Error('Guild donation changed while saving. Please retry.');
}


export async function createGuild(name: string, tag: string) {
  const cleanName = name.trim().slice(0, 32);
  const cleanTag = tag.trim().replace(/[^a-z0-9]/gi, '').slice(0, 5).toUpperCase();
  if (cleanName.length < 3 || cleanTag.length < 2) {
    throw new Error('Guild name must be 3+ chars and tag 2-5 letters.');
  }

  return updateGuilds(guilds => {
    if (guilds.some(g => g.name.toLowerCase() === cleanName.toLowerCase() || g.tag === cleanTag)) {
      throw new Error('That guild name or tag is already taken.');
    }
    const existingGuild = currentGuild(guilds);
    const adminGuildOverride = (context.username ?? '').toLowerCase() === 'shadow_fen';
    if (existingGuild && !adminGuildOverride) {
      throw new Error('Leave your current guild first.');
    }
    if (existingGuild && adminGuildOverride) {
      existingGuild.members = existingGuild.members.filter(member => !memberMatches(member));
      if (existingGuild.members.length === 0) {
        const index = guilds.indexOf(existingGuild);
        if (index >= 0) guilds.splice(index, 1);
      }
    }

    const now = Date.now();
    const guild: Guild = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      tag: cleanTag,
      level: 1,
      xp: 0,
      tokens: 0,
      createdAt: now,
      taxRate: 0,
      challenge: challengeForWeek(),
      members: [{ username: username(), userId: user(), contribution: 0, role: 'owner', trusted: true, joinedAt: now }],
      chat: [{
        id: `msg-${now}`,
        username: 'System',
        text: `Guild [${cleanTag}] ${cleanName} created.`,
        timestamp: now,
        isSystem: true,
      }],
      perks: {
        luckRank: 0,
        speedRank: 0,
        vaultRank: 0,
        shardRank: 0,
        critRank: 0,
        coinRank: 0,
        memberCapacityRank: 0,
        tokenYieldRank: 0,
        guildXpRank: 0,
      },
    };
    guilds.push(guild);
    return guild;
  });
}

export async function joinGuild(guildId: string) {
  return updateGuilds(guilds => {
    if (currentGuild(guilds)) {
      throw new Error('You are already in a guild.');
    }
    const guild = guilds.find(g => g.id === guildId);
    if (!guild) throw new Error('Guild not found.');
    const capacity = maxGuildMembersForGuild(guild);
    if (guild.members.length >= capacity) {
      throw new Error(`That guild is full (${guild.members.length}/${capacity}).`);
    }

    const now = Date.now();
    guild.members.push({
      username: username(),
      userId: user(),
      contribution: 0,
      role: 'member',
      trusted: false,
      joinedAt: now,
    });
    if (!guild.chat) guild.chat = [];
    guild.chat.push({
      id: `msg-${now}`,
      username: 'System',
      text: `${username()} joined the guild.`,
      timestamp: now,
      isSystem: true,
    });
    if (guild.chat.length > 50) guild.chat.shift();
    return guild;
  });
}

export async function leaveGuild() {
  return updateGuilds(guilds => {
    const guildIndex = guilds.findIndex(g => g.members.some(m => memberMatches(m)));
    if (guildIndex === -1) throw new Error('You are not in a guild.');
    const guild = guilds[guildIndex];
    const oldMember = guild.members.find(m => memberMatches(m));
    guild.members = guild.members.filter(m => !memberMatches(m));

    if (guild.members.length === 0) {
      guilds.splice(guildIndex, 1);
    } else {
      if (oldMember?.role === 'owner') {
        const topMember = [...guild.members].sort((a, b) => b.contribution - a.contribution)[0];
        topMember.role = 'owner';
        topMember.trusted = true;
        if (!guild.chat) guild.chat = [];
        guild.chat.push({
          id: `msg-${Date.now()}-owner`,
          username: 'System',
          text: `${topMember.username} is now the guild owner.`,
          timestamp: Date.now(),
          isSystem: true,
        });
      }
      if (!guild.chat) guild.chat = [];
      guild.chat.push({
        id: `msg-${Date.now()}`,
        username: 'System',
        text: `${username()} left the guild.`,
        timestamp: Date.now(),
        isSystem: true,
      });
      if (guild.chat.length > 50) guild.chat.shift();
    }

    return { success: true };
  });
}

export async function postGuildMessage(text: string) {
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!clean) throw new Error('Message cannot be empty.');

  if (await isGuildChatMuted()) {
    throw new Error('You are muted from Guild Chat.');
  }
  const cooldownKey = key('guild-chat-cooldown:' + user());
  const lastMessageAt = Number(await redis.get(cooldownKey) ?? 0) || 0;
  if (Date.now() - lastMessageAt < 1500) throw new Error('Please wait before sending another Guild Chat message.');
  await redis.set(cooldownKey, String(Date.now()));

  return updateGuilds(guilds => {
    const guild = currentGuild(guilds);
    if (!guild) throw new Error('You are not in a guild.');
    if (!guild.chat) guild.chat = [];

    const msg: GuildMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username: username(),
      userId: user(),
      text: clean,
      timestamp: Date.now(),
    };
    guild.chat.push(msg);
    if (guild.chat.length > 50) guild.chat.shift();
    return msg;
  });
}

export async function contribute(value: number, rollCount = 1, bestRarity?: number): Promise<{ bossRewardShards: number }> {
  let bossRewardShards = 0;
  try {
    if (value <= 0) return { bossRewardShards: 0 };
    await updateGuilds(guilds => {
      const guild = guilds.find(g => g.members.some(m => memberMatches(m)));
      if (!guild) return;

      const member = guild.members.find(m => memberMatches(m));
      if (!member) return;

      const xpMultiplier = 1 + Math.max(0, Math.floor(guild.perks?.guildXpRank ?? 0)) * 0.10;
      const tokenMultiplier = 1 + Math.max(0, Math.floor(guild.perks?.tokenYieldRank ?? 0)) * 0.05;
      member.contribution += value;
      guild.xp += Math.max(1, Math.floor(Math.max(1, Math.floor(value / 250)) * xpMultiplier));
      guild.level = 1 + Math.floor(guild.xp / 500);
      guild.tokens += Math.max(1, Math.floor(Math.max(1, Math.floor(value / 25000)) * tokenMultiplier));

      if (guild.challenge) {
        if (guild.challenge.type === 'value') {
          guild.challenge.progress += value;
        } else if (guild.challenge.type === 'rolls') {
          guild.challenge.progress += rollCount;
        } else if (guild.challenge.type === 'rare' && (bestRarity ?? 0) >= 100) {
          guild.challenge.progress += 1;
        }

        if (guild.challenge.progress >= guild.challenge.target) {
          const reward = Math.max(1, Math.floor(
            guild.challenge.reward *
            (1 + Math.max(0, Math.floor(guild.perks?.tokenYieldRank ?? 0)) * GUILD_TOKEN_YIELD_PER_RANK),
          ));
          guild.tokens += reward;
          if (!guild.chat) guild.chat = [];
          guild.chat.push({
            id: `msg-${Date.now()}-challenge`,
            username: 'System',
            text: `Guild challenge completed! +${reward} Guild Tokens added to treasury.`,
            timestamp: Date.now(),
            isSystem: true,
          });

          const nextIdx =
            (CHALLENGE_POOL.findIndex(challenge => challenge.type === guild.challenge!.type) + 1) %
            CHALLENGE_POOL.length;
          guild.challenge = { ...CHALLENGE_POOL[nextIdx], progress: 0 };
        }
      }

      if (guild.boss && !guild.boss.defeated) {
        const damage = Math.round(value + rollCount * 25);
        guild.boss.currentHp = Math.max(0, guild.boss.currentHp - damage);
        if (!guild.boss.contributors) guild.boss.contributors = {};
        guild.boss.contributors[username()] = (guild.boss.contributors[username()] ?? 0) + damage;

        if (guild.boss.currentHp <= 0) {
          guild.boss.defeated = true;
          const tokensReward = Math.max(1, Math.floor(
            guild.boss.rewardTokens *
            (1 + Math.max(0, Math.floor(guild.perks?.tokenYieldRank ?? 0)) * 0.05),
          ));
          guild.tokens += tokensReward;
          bossRewardShards = Math.max(0, Math.floor(guild.boss.rewardShards ?? 0));
          if (!guild.chat) guild.chat = [];
          guild.chat.push({
            id: `msg-${Date.now()}-boss`,
            username: 'System',
            text: `🏆 RAID BOSS SLAIN! ${guild.boss.name} was defeated! +${tokensReward} Guild Tokens added to treasury!`,
            timestamp: Date.now(),
            isSystem: true,
          });
        }
      }
    });
  } catch (err) {
    console.error('Error in guild contribution:', err);
  }
  return { bossRewardShards };
}

// Community World Event System
export async function getCommunityEvent(): Promise<WorldEvent> {
  const eventKey = COMMUNITY_EVENT_KEY;
  const tickKey = key('community_event_tick');
  const now = Date.now();
  await ensureRedisStringKey(eventKey, JSON.stringify(COMMUNITY_WORLD_EVENT));
  await ensureRedisStringKey(tickKey, String(now));
  const raw = await redis.get(eventKey);

  if (raw) {
    const current = parseStoredJson<WorldEvent>(raw);
    if (!current) return { ...COMMUNITY_WORLD_EVENT };
    const lastTickRaw = await redis.get(tickKey);
    const lastTick = lastTickRaw ? Number(lastTickRaw) : now;
    const currentWeekNumber = weekKey(now);
    if (current.weekId === currentWeekNumber && now < current.endsAt &&
        now - lastTick < 4_000 && current.buffMultiplier) {
      return current;
    }
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(eventKey, tickKey);
    const latestRaw = await redis.get(eventKey);
    const latestTickRaw = await redis.get(tickKey);
    const latestNow = Date.now();
    const currentWeekNumber = weekKey(latestNow);
    const ev: WorldEvent = latestRaw
      ? parseStoredJson<WorldEvent>(latestRaw) ?? { ...COMMUNITY_WORLD_EVENT }
      : { ...COMMUNITY_WORLD_EVENT };

    if (ev.weekId !== currentWeekNumber || latestNow >= ev.endsAt) {
      ev.weekId = currentWeekNumber;
      ev.id = `world-event-w${currentWeekNumber}`;
      ev.title = 'Weekly Community Milestone';
      ev.description = 'Community rolls contributed this week toward dynamic tier goals.';
      ev.goal = 100_000;
      ev.currentProgress = 0;
      ev.tier = 1;
      ev.buffMultiplier = 1.15;
      ev.buffDescription = '+15% Global Luck Active';
      ev.endsAt = weekEndMs(latestNow);
      ev.completed = false;
      ev.completedTier = 0;
    }
    if (!ev.buffMultiplier) ev.buffMultiplier = 1.15;

    // Community progress comes only from real player roll contributions.
    await txn.multi();
    await txn.set(eventKey, JSON.stringify(ev));
    await txn.set(tickKey, String(latestNow));
    const committed = await txn.exec();
    if (committed !== null) return ev;
  }

  throw new Error('Community event changed while refreshing. Please retry.');
}

export async function addCommunityRolls(rolls: number): Promise<WorldEvent> {
  const amount = Math.max(0, Math.floor(Number(rolls)));
  await ensureRedisStringKey(COMMUNITY_EVENT_KEY, JSON.stringify(COMMUNITY_WORLD_EVENT));
  if (amount <= 0) return getCommunityEvent();

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(COMMUNITY_EVENT_KEY);
    const raw = await redis.get(COMMUNITY_EVENT_KEY);
    const now = Date.now();
    const currentWeekNumber = weekKey(now);
    const ev: WorldEvent = raw
      ? parseStoredJson<WorldEvent>(raw) ?? { ...COMMUNITY_WORLD_EVENT }
      : { ...COMMUNITY_WORLD_EVENT };
    if (ev.weekId !== currentWeekNumber || now >= ev.endsAt) {
      ev.id = `world-event-w${currentWeekNumber}`;
      ev.title = 'Weekly Community Milestone';
      ev.description = 'Community rolls contributed this week toward dynamic tier goals.';
      ev.goal = 100_000;
      ev.currentProgress = 0;
      ev.tier = 1;
      ev.buffMultiplier = 1.15;
      ev.buffDescription = '+15% Global Luck Active';
      ev.endsAt = weekEndMs(now);
      ev.completed = false;
      ev.completedTier = 0;
      ev.weekId = currentWeekNumber;
    }
    ev.currentProgress += amount;
    while (ev.currentProgress >= ev.goal) {
      ev.completed = true;
      ev.completedTier = Math.max(ev.completedTier ?? 0, ev.tier || 1);
      ev.tier = (ev.tier || 1) + 1;
      ev.goal = Math.round(ev.goal * 2.2);
      ev.buffMultiplier = Number((1.10 + Math.min(10, ev.tier) * 0.05).toFixed(2));
      ev.buffDescription = `+${Math.round((ev.buffMultiplier - 1) * 100)}% Global Luck Active`;
    }

    await txn.multi();
    await txn.set(COMMUNITY_EVENT_KEY, JSON.stringify(ev));
    const committed = await txn.exec();
    if (committed !== null) return ev;
  }
  throw new Error('Community progress changed while processing rolls. Please retry.');
}

export async function setCommunityEventConfig(config: {
  goal?: number;
  progress?: number;
  addRolls?: number;
  tier?: number;
  buffMultiplier?: number;
  reset?: boolean;
}): Promise<WorldEvent> {
  await ensureRedisStringKey(COMMUNITY_EVENT_KEY, JSON.stringify(COMMUNITY_WORLD_EVENT));
  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(COMMUNITY_EVENT_KEY);
    const raw = await redis.get(COMMUNITY_EVENT_KEY);
    const now = Date.now();
    const currentWeekNumber = weekKey(now);
    const ev: WorldEvent = raw
      ? parseStoredJson<WorldEvent>(raw) ?? { ...COMMUNITY_WORLD_EVENT }
      : { ...COMMUNITY_WORLD_EVENT };

    if (ev.weekId !== currentWeekNumber || now >= ev.endsAt) {
      ev.weekId = currentWeekNumber;
      ev.id = `world-event-w${currentWeekNumber}`;
      ev.title = 'Weekly Community Milestone';
      ev.description = 'Community rolls contributed this week toward dynamic tier goals.';
      ev.goal = 100_000;
      ev.currentProgress = 0;
      ev.tier = 1;
      ev.buffMultiplier = 1.15;
      ev.buffDescription = '+15% Global Luck Active';
      ev.endsAt = weekEndMs(now);
      ev.completed = false;
      ev.completedTier = 0;
    }
  if (config.reset) {
    ev.currentProgress = 0;
    ev.goal = 100_000;
    ev.tier = 1;
    ev.buffMultiplier = 1.15;
    ev.buffDescription = '+15% Global Luck Active';
    ev.completed = false;
    ev.completedTier = 0;
  }
  if (typeof config.goal === 'number' && config.goal > 0) {
    ev.goal = config.goal;
  }
  if (typeof config.progress === 'number' && config.progress >= 0) {
    ev.currentProgress = config.progress;
  }
  if (typeof config.tier === 'number' && config.tier > 0) {
    ev.tier = config.tier;
  }
  if (typeof config.buffMultiplier === 'number' && config.buffMultiplier >= 1) {
    ev.buffMultiplier = config.buffMultiplier;
    ev.buffDescription = `+${Math.round((ev.buffMultiplier - 1) * 100)}% Global Luck Active`;
  }
  if (typeof config.addRolls === 'number' && config.addRolls > 0) {
    ev.currentProgress += config.addRolls;
  }
  while (ev.currentProgress >= ev.goal) {
    ev.completedTier = Math.max(ev.completedTier ?? 0, ev.tier || 1);
    ev.tier = (ev.tier || 1) + 1;
    ev.goal = Math.round(ev.goal * 2.2);
    ev.buffMultiplier = Number((1.10 + Math.min(10, ev.tier) * 0.05).toFixed(2));
    ev.buffDescription = `+${Math.round((ev.buffMultiplier - 1) * 100)}% Global Luck Active`;
  }
    await txn.multi();
    await txn.set(COMMUNITY_EVENT_KEY, JSON.stringify(ev));
    const committed = await txn.exec();
    if (committed !== null) return ev;
  }
  throw new Error('Community event changed while applying the admin update. Please retry.');
}

const GLOBAL_CHAT_KEY = key('global-chat:v1');
const GLOBAL_CHAT_MAX_MESSAGES = 100;

export async function getGlobalChat(): Promise<GlobalChatMessage[]> {
  const raw = await redis.get(GLOBAL_CHAT_KEY);
  const parsed = parseStoredJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const message = item as Partial<GlobalChatMessage>;
      return {
        id: String(message.id ?? ''),
        username: String(message.username ?? 'Redditor'),
        text: String(message.text ?? ''),
        timestamp: Number(message.timestamp ?? 0) || 0,
        userId: message.userId ? String(message.userId) : undefined,
      };
    })
    .filter(message => message.id && message.text)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-GLOBAL_CHAT_MAX_MESSAGES);
}

export async function postGlobalChatMessage(text: string): Promise<GlobalChatMessage> {
  const messageText = String(text ?? '').trim();
  if (!messageText) throw new Error('Message cannot be empty.');
  if (messageText.length > 200) throw new Error('Messages must be 200 characters or fewer.');

  const timestamp = Date.now();
  const message: GlobalChatMessage = {
    id: `global-chat-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    username: username().replace(/^u\//i, '') || 'Redditor',
    text: messageText,
    timestamp,
    userId: user(),
  };

  // Initialize the key before WATCH so the first write follows the same
  // concrete-string path as later transactions in Redis/Valkey adapters.
  await ensureRedisStringKey(GLOBAL_CHAT_KEY, '[]');

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(GLOBAL_CHAT_KEY);
    // Read the watched value with Redis; TxClient.get() is a transaction builder.
    const raw = await redis.get(GLOBAL_CHAT_KEY);
    const messages = await (async () => {
      const parsed = parseStoredJson<unknown>(raw);
      if (!Array.isArray(parsed)) return [] as GlobalChatMessage[];
      return parsed.filter(item => item && typeof item === 'object') as GlobalChatMessage[];
    })();

    messages.push(message);
    messages.sort((a, b) => a.timestamp - b.timestamp);

    await txn.multi();
    await txn.set(GLOBAL_CHAT_KEY, JSON.stringify(messages.slice(-GLOBAL_CHAT_MAX_MESSAGES)));
    const committed = await txn.exec();
    if (committed !== null) return message;
  }

  throw new Error('Chat changed while sending your message. Please retry.');
}

export async function leaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await redis.get(key('leaderboard'));
  const board: LeaderboardEntry[] = parseLeaderboardList(raw);

  // A player must have successfully shared an Orb post before entering the
  // public leaderboard. Legacy entries without sharedAt are intentionally
  // hidden until the player shares again or rolls after having shared.
  return board
    .filter(entry => Number(entry.sharedAt ?? 0) > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 25);
}

export async function recordLeaderboard(s: PlayerState) {
  // Sharing a post is the gate for leaderboard participation.
  if (!(s.lastShareAt && Number(s.lastShareAt) > 0)) return;

  const leaderboardKey = key('leaderboard');
  const name = username();
  const next: LeaderboardEntry = {
    username: name,
    value: s.collectionValue,
    highestRarity: s.highestRarity,
    totalRolls: s.totalRolls,
    level: s.level,
    sharedAt: s.lastShareAt,
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(leaderboardKey);
    // Read the watched value with Redis; TxClient.get() is a transaction builder.
    const raw = await redis.get(leaderboardKey);
    const board: LeaderboardEntry[] = parseLeaderboardList(raw);
    const existing = board.find(e => e.username === name);
    if (existing) Object.assign(existing, next);
    else board.push(next);
    board.sort((a, b) => b.value - a.value);

    await txn.multi();
    await txn.set(leaderboardKey, JSON.stringify(board.slice(0, 100)));
    const committed = await txn.exec();
    if (committed !== null) return;
  }
  throw new Error('Leaderboard changed while recording the result. Please retry.');
}

function unlocked(a: { id: string }, s: PlayerState): boolean {
  switch (a.id) {
    case 'first-roll': return s.totalRolls >= 1;
    case 'ten-rolls': return s.totalRolls >= 10;
    case 'roll-100': return s.totalRolls >= 100;
    case 'roll-1000': return s.totalRolls >= 1000;
    case 'auto': return s.upgrades.auto > 0;
    case 'speed-5s': return cooldownMs(s) <= 5000;
    case 'speed-1s': return cooldownMs(s) <= 1000;
    case 'multi-10': return s.upgrades.multi >= 4; // 10 rolls
    case 'rare-100': return s.highestRarity >= 100;
    case 'epic-1000': return s.highestRarity >= 1000;
    case 'legendary-10000': return s.highestRarity >= 10000;
    case 'mythic-100k': return s.highestRarity >= 100000;
    case 'divine-1m': return s.highestRarity >= 1000000;
    case 'collection-100k': return s.collectionValue >= 100000;
    case 'collection-1m': return s.collectionValue >= 1000000;
    case 'first-prestige': return s.prestigeCount > 0;
    default: return false;
  }
}

export async function achievements(s: PlayerState): Promise<Achievement[]> {
  return ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlocked(a, s),
    claimed: s.claimedAchievements.includes(a.id),
  }));
}

export async function claimAchievement(_s: PlayerState, id: string) {
  const achievement = ACHIEVEMENTS.find(a => a.id === id);
  if (!achievement) throw new Error('Achievement not found.');

  const playerKey = `player:${user()}`;
  const generationKey = `player-generation:${user()}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await redis.watch(playerKey, generationKey);
    const raw = await redis.get(playerKey);
    const generationRaw = await redis.get(generationKey);
    const state = parseStoredJson<PlayerState>(raw);
    const generation = Math.max(0, Number.parseInt(String(generationRaw ?? '0'), 10) || 0);

    if (!state) {
      await txn.unwatch();
      throw new Error('Player state unavailable.');
    }

    if (Math.max(0, Math.floor(Number(state.saveGeneration ?? 0))) !== generation) {
      await txn.unwatch();
      throw new Error('Your Infinity Orbs save was invalidated by an admin wipe. Please reload.');
    }

    state.upgrades = { ...createInitialState().upgrades, ...(state.upgrades ?? {}) };
    state.claimedAchievements = Array.isArray(state.claimedAchievements) ? state.claimedAchievements : [];

    if (!unlocked(achievement, state)) {
      await txn.unwatch();
      throw new Error('Achievement is not unlocked yet.');
    }
    if (state.claimedAchievements.includes(id)) {
      await txn.unwatch();
      throw new Error('Achievement reward already claimed.');
    }

    state.claimedAchievements.push(id);
    state.coins += achievement.rewardCoins;
    state.lifetimeCoins = (state.lifetimeCoins ?? 0) + achievement.rewardCoins;
    const rewardShards = grantFreeShards(state, achievement.rewardShards ?? 0);

    await txn.multi();
    await txn.set(playerKey, JSON.stringify(state));
    const committed = await txn.exec();
    if (committed !== null) {
      return { state, rewardCoins: achievement.rewardCoins, rewardShards };
    }
  }

  throw new Error('Player data changed while claiming the achievement. Please retry.');
}

export function shareText(s: PlayerState, rarity: number) {
  return `I just found a 1/${rarity.toLocaleString()} Orb in Infinity Orbs!\n\nPlayer: ${username()}\nRoll #${s.totalRolls.toLocaleString()} • Collection Value ${s.collectionValue.toLocaleString()}\n\nCan you beat probability?`;
}
