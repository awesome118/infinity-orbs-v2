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
