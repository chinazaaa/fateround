import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Pure-logic tests run in the node environment (the default). Component/hook tests opt
// into jsdom with a `// @vitest-environment jsdom` directive at the top of the file.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
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
