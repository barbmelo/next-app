import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve('./test/mocks/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
  },
})
