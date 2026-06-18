import type { MetadataRoute } from 'next'
import { ALL_GAME_LANDING_SLUGS } from '@/lib/game-landing'
import { appOrigin } from '@/lib/site'

/** Indexable marketing/app pages (exclude noindex routes: /game, /host, /history, /admin). */
const STATIC_INDEXABLE_ROUTES = ['/', '/games', '/create', '/updates'] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin()
  const lastModified = new Date()

  const staticPages: MetadataRoute.Sitemap = STATIC_INDEXABLE_ROUTES.map((path) => ({
    url: `${origin}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: path === '/' || path === '/games' || path === '/updates' ? ('weekly' as const) : ('monthly' as const),
    priority: path === '/' ? 1 : path === '/games' ? 0.9 : path === '/updates' ? 0.75 : 0.8,
  }))

  const gamePages = ALL_GAME_LANDING_SLUGS.map((slug) => ({
    url: `${origin}/games/${slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }))

  return [...staticPages, ...gamePages]
}
