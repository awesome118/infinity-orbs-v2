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
  hGet: async (key: string, field: string): Promise<string | undefined> => {
    const raw = store.get(key);
    if (!raw) return undefined;
    const values = JSON.parse(raw) as Record<string, string>;
    return values[field];
  },
  hSet: async (key: string, fieldValues: Record<string, string>): Promise<number> => {
    const raw = store.get(key);
    const values = raw ? JSON.parse(raw) as Record<string, string> : {};
    let added = 0;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (!(field in values)) added++;
      values[field] = value;
    }
    store.set(key, JSON.stringify(values));
    return added;
  },
  hGetAll: async (key: string): Promise<Record<string, string>> => {
    const raw = store.get(key);
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  },
  mGet: async (keys: string[]): Promise<Array<string | null>> => keys.map(key => store.get(key) ?? null),
  set: async (key: string, value: string): Promise<string> => {
    store.set(key, value);
    return 'OK';
  },
  del: async (key: string): Promise<boolean> => store.delete(key),
  watch: async (...keys: string[]) => {
    const snapshot = new Map(keys.map(key => [key, store.get(key)]));
    const staged: Array<[string, string]> = [];
    return {
      get: async (key: string): Promise<string | null> => store.get(key) ?? null,
      multi: async () => undefined,
      set: async (key: string, value: string) => {
        staged.push([key, value]);
        return 'QUEUED';
      },
      exec: async () => {
        for (const key of keys) {
          if ((store.get(key) ?? null) !== (snapshot.get(key) ?? null)) return null;
        }
        for (const [key, value] of staged) store.set(key, value);
        return [];
      },
      unwatch: async () => undefined,
    };
  },
  incr: async (key: string): Promise<number> => {
    const value = Number.parseInt(store.get(key) ?? '0', 10) + 1;
    store.set(key, String(value));
    return value;
  },
  zAdd: async (key: string, ...entries: Array<{ member: string; score: number }>): Promise<number> => {
    const raw = store.get(key);
    const values: Record<string, number> = raw ? JSON.parse(raw) : {};
    let added = 0;
    for (const entry of entries) {
      if (!(entry.member in values)) added++;
      values[entry.member] = entry.score;
    }
    store.set(key, JSON.stringify(values));
    return added;
  },
  zRemRangeByScore: async (key: string, min: number, max: number): Promise<number> => {
    const raw = store.get(key);
    if (!raw) return 0;
    const values: Record<string, number> = JSON.parse(raw);
    let removed = 0;
    for (const [member, score] of Object.entries(values)) {
      if (score >= min && score <= max) {
        delete values[member];
        removed++;
      }
    }
    store.set(key, JSON.stringify(values));
    return removed;
  },
  zCard: async (key: string): Promise<number> => {
    const raw = store.get(key);
    return raw ? Object.keys(JSON.parse(raw)).length : 0;
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
