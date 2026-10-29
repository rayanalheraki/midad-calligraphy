import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Headers that are safe to apply in dev. The strict CSP is applied by server.mjs
// in production only, because the React dev preamble relies on an inline script.
const devHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

export default defineConfig({
  plugins: [react()],
  // harfbuzzjs locates its .wasm via `new URL(..., import.meta.url)`; pre-bundling would break that path.
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  server: { headers: devHeaders },
  preview: { headers: devHeaders },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
