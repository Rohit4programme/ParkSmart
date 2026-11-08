import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // NOTE: only the browser-required Maps key is exposed to the client.
      // GEMINI_API_KEY must NEVER be defined here — it would be embedded in
      // the client bundle and shipped to every browser. The server reads it
      // from process.env directly.
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // Large media assets (videos, screen recordings) must never be watched:
      // a locked/busy file makes chokidar throw EBUSY and crash the dev server.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/*.mp4',
                '**/*.mov',
                '**/*.m4v',
                '**/*.mkv',
                '**/*.avi',
                '**/*.webm',
                '**/*.wmv',
                '**/*.flv',
                '**/*.mpg',
                '**/*.mpeg',
              ],
            },
    },
  };
});
