import { defineConfig } from 'vite';

export default defineConfig({
  // Yandex Games serves the build from a sub-path, so asset URLs must be relative.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Phaser alone is ~1 MB minified; keep the warning for anything bigger.
    chunkSizeWarningLimit: 1600,
  },
});
