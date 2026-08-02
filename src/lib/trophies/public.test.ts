import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The game landing pages are STATICALLY built, and the build environment has no service-role key.
 * `getPublicTrophiesForGame` runs there, and `getSupabaseAdmin` fail-louds when the key is absent
 * in a production build. This test locks in that a public marketing page degrades to no trophies
 * rather than failing the whole `next build` — the exact regression that broke the #743 build.
 */
describe('getPublicTrophiesForGame under a keyless production build', () => {
  beforeEach(() => vi.resetModules())

  it('returns [] instead of throwing when the service key is absent', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

    const { getPublicTrophiesForGame } = await import('@/lib/trophies/public')
    await expect(getPublicTrophiesForGame('trivia')).resolves.toEqual([])

    vi.unstubAllEnvs()
  })
})
