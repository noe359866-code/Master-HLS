import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * El cliente se sirve desde el mismo servidor que el addon Stremio, asi que
 * en desarrollo se hace proxy de /api y /hls al backend local.
 *
 * En produccion el objetivo es arrancar rapido en una TV: por eso se parte el
 * bundle en trozos estables (react, hls.js, player-core, i18n) y cada pantalla
 * se carga bajo demanda con `React.lazy`. `hls.js` (~400 KB) solo se descarga
 * cuando se entra al reproductor, que es donde hace falta.
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
      '/configure': { target: 'http://127.0.0.1:8181', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    cssCodeSplit: true,
    // Calcular el tamano gzip de cada chunk ralentiza el build sin aportar nada
    // en CI; el servidor ya comprime al servir.
    reportCompressedSize: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('hls.js')) return 'hls';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) {
              return 'react';
            }
            return 'vendor';
          }
          if (id.includes('/packages/player-core/')) return 'player-core';
          if (id.includes('/packages/i18n/')) return 'i18n';
          return undefined;
        },
      },
    },
  },
});
