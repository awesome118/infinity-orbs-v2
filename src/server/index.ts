import { context, createServer, getServerPort, redis, reddit } from '@devvit/web/server';
import { createApp } from './app.js';
import { configureDevvitRuntime } from './devvit-mock.js';

configureDevvitRuntime({ redis, context, reddit });

const app = createApp();
const server = createServer(app);

server.on('error', (error: Error) => {
  console.error('[Devvit] Server error:', error.stack ?? error.message);
});

server.listen(getServerPort());
