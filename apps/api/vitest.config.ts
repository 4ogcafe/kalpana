import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests need a MongoDB; the database named here is dropped before each run.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'mongodb://127.0.0.1:27018/kalpana_test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
    fileParallelism: false,
  },
});
