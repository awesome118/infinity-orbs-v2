// Local in-memory implementation of the small Devvit service surface used by the game.
// In production, src/server/index.ts swaps these live bindings for Devvit's real services.

const store = new Map<string, string>();

const initialGuilds = [
  {
    id: 'guild-1',
    name: 'Astral Knights',
    tag: 'STAR',
    level: 12,
    xp: 1250,
    tokens: 42,
    createdAt: Date.now() - 86400000 * 5,
    challenge: { type: 'rolls', target: 500, progress: 140, reward: 250, label: 'Roll Together: 500 guild rolls' },
    members: [
      { username: 'Celestia', contribution: 540000, role: 'owner' },
      { username: 'Starlight', contribution: 320000, role: 'member' },
    ],
  },
  {
    id: 'guild-2',
    name: 'Void Walkers',
    tag: 'VOID',
    level: 8,
    xp: 820,
    tokens: 18,
    createdAt: Date.now() - 86400000 * 3,
    challenge: { type: 'value', target: 50_000, progress: 12400, reward: 500, label: 'Treasure Hunt: 50,000 collection value' },
    members: [{ username: 'NullPointer', contribution: 410000, role: 'owner' }],
  },
];

const initialLeaderboard = [
  { username: 'Celestia', value: 540000, highestRarity: 100000, totalRolls: 840 },
  { username: 'NullPointer', value: 410000, highestRarity: 10000, totalRolls: 620 },
  { username: 'Starlight', value: 320000, highestRarity: 10000, totalRolls: 510 },
  { username: 'NebulaRider', value: 180000, highestRarity: 1000, totalRolls: 340 },
  { username: 'OrbMaster', value: 0, highestRarity: 2, totalRolls: 0 },
];

store.set('io:guilds', JSON.stringify(initialGuilds));
store.set('io:leaderboard', JSON.stringify(initialLeaderboard));

const localRedis = {
  get: async (key: string): Promise<string | null> => store.get(key) ?? null,
  set: async (key: string, value: string): Promise<string> => {
    store.set(key, value);
    return 'OK';
  },
  del: async (key: string): Promise<boolean> => store.delete(key),
  incr: async (key: string): Promise<number> => {
    const value = Number.parseInt(store.get(key) ?? '0', 10) + 1;
    store.set(key, String(value));
    return value;
  },
};

const localContext = {
  userId: 'local-player-1',
  username: 'OrbMaster',
  subredditName: 'infinityorbs',
};

const localReddit = {
  submitCustomPost: async (options: {
    runAs?: string;
    subredditName?: string;
    title: string;
    entry?: string;
    userGeneratedContent?: { text?: string };
  }) => {
    console.log('[Reddit Mock] Custom post submitted:', options.title);
    return { id: `reddit-post-${Date.now()}` };
  },
};

export let redis: any = localRedis;
export let context: any = localContext;
export let reddit: any = localReddit;

export function configureDevvitRuntime(runtime: {
  redis: unknown;
  context: unknown;
  reddit: unknown;
}) {
  redis = runtime.redis;
  context = runtime.context;
  reddit = runtime.reddit;
}
