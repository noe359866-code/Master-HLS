import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * El cliente se sirve desde el mismo servidor que el addon Stremio, asi que
 * en desarrollo se hace proxy de /api y /hls al backend local.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8181', changeOrigin: true },
      '/hls': { target: 'http://127.0.0.1:8181', changeOrigin: true },
      '/manifest.json': { target: 'http://127.0.0.1:8181', changeOrigin: true },
      '/catalog': { target: 'http://127.0.0.1:8181', changeOrigin: true },
      '/meta': { target: 'http://127.0.0.1:8181', changeOrigin: true },
      '/stream': { target: 'http://127.0.0.1:8181', changeOrigin: true },
      '/subtitles': { target: 'http://127.0.0.1:8181', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
