import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use real filesystem, no mocks!
    globals: true,
    environment: 'node',

    // Show test progress
    reporters: ['verbose'],

    // Timeout for filesystem operations
    testTimeout: 10000,

    // No coverage for now, just make it work
    coverage: {
      enabled: false
    },

    // Watch mode settings
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/plans/**', '**/manifest/**']
  }
});