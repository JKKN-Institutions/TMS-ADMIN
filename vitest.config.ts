import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Scoped to pure logic only — the rest of the app is verified via type-check +
// dev-server probes (see the plan's Global Constraints).
export default defineConfig({
  // Mirrors the "@/*": ["./*"] path mapping in tsconfig.json. Needed because
  // lib/fees/generate.ts imports @/lib/notifications/notify, whose own import
  // graph is written in @/ form too — without this the module cannot even load
  // under vitest, let alone be exercised.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
