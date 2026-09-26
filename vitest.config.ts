import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Pure-logic tests run in the node environment (the default). Component/hook tests opt
// into jsdom with a `// @vitest-environment jsdom` directive at the top of the file.
export default defineConfig({
  // `projects` pins the plugin to the ONE tsconfig that defines an alias we use (the root
  // `@/*` -> `./src/*`). Left unset, vite-tsconfig-paths crawls the whole working tree for
  // tsconfig files on every run. Two costs, both avoidable:
  //   1. `apps/mobile/tsconfig.json` extends `expo/tsconfig.base`, which is not resolvable from
  //      the pnpm workspace root (mobile installs separately with npm), so every `vitest run`
  //      prints a `[tsconfig-paths] An error occurred while parsing ...` block for it — in CI
  //      too. It is noise: mobile is not in this suite's `include` and defines no alias src/
  //      tests use.
  //   2. Locally the crawl also walks nested git worktrees under `.claude/` and `.worktrees/`,
  //      repeating that warning once per worktree (14 blocks on one machine with 25 registered)
  //      and stat-ing tens of thousands of files before a single test runs.
  // Pinning changes no resolution: the root tsconfig is the only one contributing paths here.
  plugins: [tsconfigPaths({ projects: ['tsconfig.json'] }), react()],
  test: {
    environment: 'node',
    // `packages/shared` is mobile's copy of the game logic, but a few engines (Troll Run's
    // physics and level generator, the Monopoly board) live there as the single source and are
    // re-exported into `src/`. Their tests sit next to the code, so they have to be included or
    // they silently never run.
    include: ['src/**/*.test.{ts,tsx}', 'packages/shared/src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    // Dummy Supabase env so modules that construct a client at import time (many of our
    // components do) don't throw "supabaseUrl is required" when imported under test.
    //
    // Real credentials, when the environment supplies them, take precedence — otherwise these
    // placeholders would clobber them and `rls-boundaries.integration.test.ts` could never
    // reach a real project. That test asserts the anon key cannot write anything; a security
    // gate pointed at `placeholder.supabase.co` passes while proving nothing.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    },
  },
})
