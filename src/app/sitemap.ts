import type { MetadataRoute } from 'next'
import { ALL_GAME_LANDING_SLUGS } from '@/lib/game-landing'
import { appOrigin } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin()
  const lastModified = new Date()

  const gamePages = ALL_GAME_LANDING_SLUGS.map((slug) => ({
    url: `${origin}/games/${slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }))

  return [
    {
      url: origin,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${origin}/games`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...gamePages,
    {
      url: `${origin}/create`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
