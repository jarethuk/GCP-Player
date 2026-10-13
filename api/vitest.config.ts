import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node, not jsdom: this is a server.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
