import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Separate from vitest.config.ts on purpose. These are MEASUREMENTS, not tests: they take
 * minutes of real wall-clock time (a 3-minute polling window cannot be faked with fake timers
 * without measuring the fake timer instead of the code), they need a live Supabase, and they
 * must never run in CI alongside the unit suite.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    include: ['scripts/bench/**/*.bench.tsx'],
    setupFiles: ['./scripts/bench/setup.bench.ts', './vitest.setup.ts'],
    // One file at a time: the benches share one Supabase and one set of fixture rows, and
    // concurrent writers against this database have previously produced a day of false passes.
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
  },
})
