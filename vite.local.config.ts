import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { createApp } from './src/server/app.js';

export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'api-server',
      configureServer(server) {
        server.middlewares.use(createApp());
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || '.', '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
}));
