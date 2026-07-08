import { buildRobotsTxt } from '@/lib/robots-txt'

export const dynamic = 'force-static'

export function GET(): Response {
  return new Response(buildRobotsTxt(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
