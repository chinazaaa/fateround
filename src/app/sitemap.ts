import type { MetadataRoute } from 'next'
import { ALL_GAME_LANDING_SLUGS } from '@/lib/game-landing'
import { ALL_MARKETING_SLUGS } from '@/lib/marketing-landing'
import { DAILY_GAME_TYPE_TO_SLUG, DAILY_CHALLENGE_GAME_TYPES } from '@/lib/daily-challenge'
import { appOrigin } from '@/lib/site'
import { fetchPublishedPosts } from '@/lib/blog-server'
import { fetchActiveCollections } from '@/lib/collections-server'
import { SOLO_PLAY_INDEX } from '@/lib/solo-play'

// Regenerate periodically so admin-published blog posts appear in the sitemap without a
// redeploy. Matches the 5-minute revalidate on the /blog pages themselves.
export const revalidate = 300

/**
 * Indexable marketing/app pages (exclude noindex routes: /game, /host, /history, /admin —
 * see ROBOTS_DISALLOW in src/lib/robots-txt.ts).
 *
 * Anything crawlable and linked from SiteFooter belongs here: `scripts/submit-indexnow.mjs`
 * builds its submission list from this sitemap, so a page missing here is never announced
 * to IndexNow either. `sitemap.test.ts` fails when a footer link has no sitemap entry.
 */
const STATIC_INDEXABLE_ROUTES: {
  path: string
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority: number
}[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/games', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/create', changeFrequency: 'monthly', priority: 0.8 },
  // Live lobbies turn over constantly; the hub itself is the indexable surface.
  { path: '/browse', changeFrequency: 'daily', priority: 0.8 },
  { path: '/rooms', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/tournament', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/leaderboard', changeFrequency: 'daily', priority: 0.75 },
  { path: '/leaderboard/daily', changeFrequency: 'daily', priority: 0.7 },
  { path: '/leaderboard/trophies', changeFrequency: 'daily', priority: 0.7 },
  { path: '/leaderboard/community', changeFrequency: 'daily', priority: 0.7 },
  { path: '/collections', changeFrequency: 'weekly', priority: 0.75 },
  { path: '/library', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/shop', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/updates', changeFrequency: 'weekly', priority: 0.75 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.75 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/feedback', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = appOrigin()
  const lastModified = new Date()

  const staticPages: MetadataRoute.Sitemap = STATIC_INDEXABLE_ROUTES.map((route) => ({
    url: `${origin}${route.path === '/' ? '' : route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const gamePages = ALL_GAME_LANDING_SLUGS.map((slug) => ({
    url: `${origin}/games/${slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }))

  const marketingPages = ALL_MARKETING_SLUGS.map((slug) => ({
    url: `${origin}/${slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // Blog posts are admin-managed; failing to fetch them must not break the sitemap.
  let blogPages: MetadataRoute.Sitemap = []
  try {
    const posts = await fetchPublishedPosts()
    blogPages = posts.map((post) => ({
      url: `${origin}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  } catch {
    // Blog table missing or DB unreachable — omit blog URLs rather than breaking the sitemap.
  }

  // Solo-play surfaces — the hub index plus one page per game. Driven by the same
  // SOLO_PLAY_INDEX registry the footer renders from, so adding a /play-solo/<slug>
  // route lights up both in one place (this used to be a second hand-kept literal).
  const soloPages: MetadataRoute.Sitemap = [
    {
      url: `${origin}/play-solo`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    ...SOLO_PLAY_INDEX.map((game) => ({
      url: `${origin}/play-solo/${game.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]

  const dailyPages: MetadataRoute.Sitemap = [
    {
      url: `${origin}/daily-challenges`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...DAILY_CHALLENGE_GAME_TYPES.map((gt) => ({
      url: `${origin}/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[gt]}`,
      lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.85,
    })),
    ...DAILY_CHALLENGE_GAME_TYPES.map((gt) => ({
      url: `${origin}/daily-challenges/${DAILY_GAME_TYPE_TO_SLUG[gt]}/leaderboard`,
      lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]

  // Collections are admin-managed themed packs, each with its own canonical + breadcrumb
  // JSON-LD. Like the blog, a DB blip must degrade to "no collection URLs", not a 500.
  let collectionPages: MetadataRoute.Sitemap = []
  try {
    const collections = await fetchActiveCollections()
    collectionPages = collections.map((collection) => ({
      url: `${origin}/collections/${collection.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  } catch {
    // Collections table missing or DB unreachable — omit rather than breaking the sitemap.
  }

  return [
    ...staticPages,
    ...gamePages,
    ...soloPages,
    ...dailyPages,
    ...marketingPages,
    ...collectionPages,
    ...blogPages,
  ]
}
