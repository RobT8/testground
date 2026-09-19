import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The data layer runs against node:sqlite, so tests need Node, not a DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
