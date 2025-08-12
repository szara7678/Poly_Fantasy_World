import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Poly_Fantasy_World/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    globals: true,
    css: true,
  },
});


