import type { MetadataRoute } from 'next'
import { appOrigin } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/game/', '/host/', '/history/'],
    },
    sitemap: `${appOrigin()}/sitemap.xml`,
  }
}
