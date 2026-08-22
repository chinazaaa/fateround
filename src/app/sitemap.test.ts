import { describe, it, expect, vi } from 'vitest'
import { ROBOTS_DISALLOW } from '@/lib/robots-txt'
import { SOLO_PLAY_INDEX } from '@/lib/solo-play'

// The sitemap reads the blog + collections tables. Stub both so this stays a pure
// structure test: the DB-backed URLs have their own graceful-degradation paths.
vi.mock('@/lib/blog-server', () => ({ fetchPublishedPosts: async () => [] }))
vi.mock('@/lib/collections-server', () => ({
  fetchActiveCollections: async () => [{ id: '1', slug: 'church-youth', name: 'Church & youth' }],
}))

const { default: sitemap } = await import('./sitemap')
const { PRIMARY_LINKS } = await import('@/components/SiteFooter')

/**
 * Guard for the "crawlable, internally linked, never in the sitemap" gap.
 *
 * `scripts/submit-indexnow.mjs` builds its IndexNow submission list by fetching the live
 * sitemap, so a page missing here is not just absent from the sitemap — it is never
 * announced to Bing/Yandex either. /browse, /rooms, /leaderboard, /library, /collections
 * and /tournament were all in that state: full metadata, footer-linked, allowed by
 * robots.txt, invisible to the sitemap.
 */
describe('sitemap', () => {
  it('includes every footer-linked page that robots.txt allows', async () => {
    const entries = await sitemap()
    const paths = new Set(entries.map((entry) => new URL(entry.url).pathname || '/'))

    const shouldBeListed = PRIMARY_LINKS.map((link) => link.href).filter(
      (href) => !ROBOTS_DISALLOW.some((blocked) => href.startsWith(blocked))
    )
    const missing = shouldBeListed.filter((href) => !paths.has(href))
    expect(missing, 'footer-linked, crawlable pages with no sitemap entry — they never reach IndexNow either').toEqual(
      []
    )
  })

  it('lists no path that robots.txt disallows', async () => {
    const entries = await sitemap()
    const disallowed = entries
      .map((entry) => new URL(entry.url).pathname)
      .filter((path) => ROBOTS_DISALLOW.some((blocked) => path.startsWith(blocked)))
    expect(disallowed, 'sitemap advertises a URL robots.txt blocks').toEqual([])
  })

  it('derives the solo pages from SOLO_PLAY_INDEX rather than a second hand-kept list', async () => {
    const entries = await sitemap()
    const paths = new Set(entries.map((entry) => new URL(entry.url).pathname))
    expect(paths.has('/play-solo')).toBe(true)
    for (const game of SOLO_PLAY_INDEX) {
      expect(paths.has(`/play-solo/${game.slug}`), `/play-solo/${game.slug}`).toBe(true)
    }
  })

  it('includes admin-managed collection detail pages', async () => {
    const entries = await sitemap()
    const paths = entries.map((entry) => new URL(entry.url).pathname)
    expect(paths).toContain('/collections')
    expect(paths).toContain('/collections/church-youth')
  })

  it('emits absolute URLs and no duplicates', async () => {
    const entries = await sitemap()
    for (const entry of entries) expect(() => new URL(entry.url)).not.toThrow()
    const urls = entries.map((entry) => entry.url)
    expect(urls.length - new Set(urls).size, 'duplicate sitemap URLs').toBe(0)
  })
})
