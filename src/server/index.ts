import { context, createServer, getServerPort, redis, reddit } from '@devvit/web/server';
import { createApp } from './app.js';
import { configureDevvitRuntime } from './devvit-mock.js';
import { mGetInChunks } from './redis-batch.js';
import { instrumentRedisClient } from './server-monitor.js';
import { createRedisCompressionProxy } from './redis-compression.js';

// Compress large string and hash values before both direct and transactional writes.
// This keeps player saves, Guilds, and leaderboards below Devvit's Redis request-size
// ceiling while preserving legacy plain-JSON reads. MGet remains separately bounded.
const compressedRedis = createRedisCompressionProxy(redis);
const boundedRedis = new Proxy(compressedRedis, {
  get(target, property, receiver) {
    if (property === 'mGet') {
      return (keys: string[]) => mGetInChunks(keys, batch => target.mGet(batch));
    }
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

configureDevvitRuntime({ redis: instrumentRedisClient(boundedRedis), context, reddit });

const app = createApp();
const server = createServer(app);

server.on('error', (error: Error) => {
  console.error('[Devvit] Server error:', error.stack ?? error.message);
});

server.listen(getServerPort());
