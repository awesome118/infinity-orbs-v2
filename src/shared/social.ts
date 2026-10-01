export type GuildRole = 'owner' | 'officer' | 'member';
export type ChallengeType = 'rolls' | 'value' | 'rare';

export interface GuildMember {
  username: string;
  contribution: number;
  role: GuildRole;
  joinedAt?: number;
}

export interface GuildChallenge {
  type: ChallengeType;
  target: number;
  progress: number;
  reward: number;
  label: string;
}

export interface GuildMessage {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface GuildPerks {
  luckRank: number; // +2% luck per rank for all guild members
  speedRank: number; // -40ms roll cooldown for all guild members
  vaultRank: number; // +100 offline capacity for all guild members
  shardRank?: number; // +0.2% shard drop chance for all members
  critRank?: number; // +1.5% critical roll chance for all members
  coinRank?: number; // +10% coins earned for all members
}

export type GuildPerkId = 'luckRank' | 'speedRank' | 'vaultRank' | 'shardRank' | 'critRank' | 'coinRank';

export interface GuildBoss {
  id: string;
  name: string;
  tier: number;
  maxHp: number;
  currentHp: number;
  rewardTokens: number;
  rewardShards: number;
  defeated: boolean;
  contributors: Record<string, number>; // username -> damage
}

export interface Guild {
  id: string;
  name: string;
  tag: string;
  level: number;
  xp: number;
  tokens: number;
  members: GuildMember[];
  createdAt: number;
  challenge: GuildChallenge;
  boss?: GuildBoss;
  perks?: GuildPerks;
  chat?: GuildMessage[];
  bannerEffect?: string;
}

export interface LeaderboardEntry {
  username: string;
  value: number;
  highestRarity: number;
  totalRolls: number;
  level?: number;
  title?: string;
  guildTag?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  rewardCoins: number;
  rewardShards?: number;
  unlocked: boolean;
  claimed: boolean;
  category?: 'rolling' | 'rarity' | 'upgrades' | 'prestige';
}

export interface WorldEvent {
  id: string;
  title: string;
  description: string;
  goal: number;
  currentProgress: number;
  buffDescription: string;
  buffMultiplier: number;
  endsAt: number;
  tier: number;
  completed: boolean;
  weekId?: number;
}

export const ACHIEVEMENTS: Omit<Achievement, 'unlocked' | 'claimed'>[] = [
  { id: 'first-roll', name: 'First Roll', description: 'Perform 1 roll.', rewardCoins: 50, category: 'rolling' },
  { id: 'ten-rolls', name: 'Getting Started', description: 'Perform 10 rolls.', rewardCoins: 150, category: 'rolling' },
  { id: 'roll-100', name: 'Roll 100', description: 'Perform 100 rolls.', rewardCoins: 500, rewardShards: 2, category: 'rolling' },
  { id: 'roll-1000', name: 'Roll 1,000', description: 'Perform 1,000 rolls.', rewardCoins: 2500, rewardShards: 10, category: 'rolling' },
  { id: 'auto', name: 'Auto Roll', description: 'Unlock Auto Roll.', rewardCoins: 300, category: 'upgrades' },
  { id: 'speed-5s', name: 'Speed I', description: 'Reach a 5-second or lower cooldown.', rewardCoins: 400, category: 'upgrades' },
  { id: 'speed-1s', name: 'Speed II', description: 'Reach a 1-second cooldown.', rewardCoins: 2000, rewardShards: 5, category: 'upgrades' },
  { id: 'multi-10', name: 'Multi Roll ×10', description: 'Unlock Multi Roll ×10.', rewardCoins: 1500, rewardShards: 5, category: 'upgrades' },
  { id: 'rare-100', name: 'Find 1/100', description: 'Find a 1/100 or higher orb.', rewardCoins: 250, category: 'rarity' },
  { id: 'epic-1000', name: 'Find 1/1,000', description: 'Find a 1/1,000 or higher orb.', rewardCoins: 1000, rewardShards: 5, category: 'rarity' },
  { id: 'legendary-10000', name: 'Find 1/10,000', description: 'Find a 1/10,000 or higher orb.', rewardCoins: 3500, rewardShards: 15, category: 'rarity' },
  { id: 'mythic-100k', name: 'Find 1/100,000', description: 'Find a 1/100,000 or higher orb.', rewardCoins: 12000, rewardShards: 35, category: 'rarity' },
  { id: 'divine-1m', name: 'Find 1/1,000,000', description: 'Find a 1/1,000,000 or higher orb.', rewardCoins: 50000, rewardShards: 100, category: 'rarity' },
  { id: 'collection-100k', name: '100k Value', description: 'Reach 100,000 Collection Value.', rewardCoins: 3000, rewardShards: 10, category: 'rarity' },
  { id: 'collection-1m', name: '1M Value', description: 'Reach 1,000,000 Collection Value.', rewardCoins: 15000, rewardShards: 50, category: 'rarity' },
  { id: 'first-prestige', name: 'Prestige I', description: 'Complete your first Prestige.', rewardCoins: 10000, rewardShards: 25, category: 'prestige' },
];

export const CHALLENGE_POOL: GuildChallenge[] = [
  { type: 'rolls', target: 500, progress: 0, reward: 250, label: 'Perform 500 guild rolls' },
  { type: 'value', target: 50_000, progress: 0, reward: 500, label: 'Accumulate 50,000 collection value' },
  { type: 'rare', target: 5, progress: 0, reward: 750, label: 'Find five 1/100+ orbs' },
];

export function createInitialGuildBoss(tier = 1): GuildBoss {
  const names = [
    'Chronos Leviathan',
    'Void Behemoth',
    'Supernova Titan',
    'Astral Colossus',
    'Infinite Eclipse',
  ];
  const name = names[(tier - 1) % names.length];
  const maxHp = 500_000 * Math.pow(2, tier - 1);
  return {
    id: `boss-t${tier}-${Date.now()}`,
    name,
    tier,
    maxHp,
    currentHp: maxHp,
    rewardTokens: 100 * tier,
    rewardShards: 10 * tier,
    defeated: false,
    contributors: {},
  };
}

export function challengeForWeek() {
  const week = Math.floor(Date.now() / 604_800_000);
  return { ...CHALLENGE_POOL[week % CHALLENGE_POOL.length] };
}

const currentWeekNumber = Math.floor(Date.now() / 604_800_000);

export const COMMUNITY_WORLD_EVENT: WorldEvent = {
  id: 'world-event-1',
  title: 'Weekly Community Milestone',
  description: 'Community rolls contributed this week toward dynamic tier goals.',
  goal: 100_000,
  currentProgress: 14_250,
  buffDescription: '+15% Global Luck Active',
  buffMultiplier: 1.15,
  endsAt: (currentWeekNumber + 1) * 604_800_000,
  tier: 1,
  completed: false,
  weekId: currentWeekNumber,
};
