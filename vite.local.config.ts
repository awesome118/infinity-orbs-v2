import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'api-server',
      configureServer(server) {
        // Local-only API harness. Production Reddit hosting uses src/server/index.ts.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // The server middleware is attached through the existing game app.
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
