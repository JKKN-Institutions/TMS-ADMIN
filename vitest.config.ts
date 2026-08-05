import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Scoped to pure logic only — the rest of the app is verified via type-check +
// dev-server probes (see the plan's Global Constraints).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    // Mirrors tsconfig's "@/*" -> "./*" so source files that import via the
    // '@/' alias (as lib/booking/roster.ts now does) resolve under vitest too.
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
