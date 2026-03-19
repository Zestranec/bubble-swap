import { defineConfig } from 'vite';

export default defineConfig({
  base: '/bubble-swap/',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: {
    open: true,
  },
});
