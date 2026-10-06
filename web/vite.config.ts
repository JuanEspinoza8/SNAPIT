import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/preparar.ts'],
    env: {
      // En los tests no hay proxy de Vite: fetch necesita una URL absoluta.
      VITE_API_URL: 'http://localhost:3000/api',
    },
  },
});
