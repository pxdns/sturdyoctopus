import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false
  },
  define: {
    global: 'globalThis'
  }
});
