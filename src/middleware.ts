import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Only the canonical production hostnames may be indexed. Every other host that
// serves this app — dev.fateround.com, Vercel preview URLs (*.vercel.app), etc.
// — must be kept out of search results so it doesn't split ranking authority
// with the real site or compete with production pages.
const PRODUCTION_HOSTS = new Set(['fateround.com', 'www.fateround.com'])

function isProductionHost(host: string | null): boolean {
  if (!host) return false
  const bare = host.split(':')[0].toLowerCase()
  return PRODUCTION_HOSTS.has(bare)
}

// Deliberately crawl-permissive, with NO sitemap line. Dev pages are already
// indexed, so we must keep them crawlable — a blanket `Disallow: /` would stop
// Google re-fetching them and it would never see the `noindex` header below,
// leaving them stuck in the index. Letting bots crawl + serving `noindex` is the
// fast path to getting the dev URLs removed. (Omitting the sitemap avoids
// actively feeding dev URLs to crawlers in the meantime.)
const NONPROD_ROBOTS = 'User-agent: *\nAllow: /\n'

export function middleware(req: NextRequest): NextResponse {
  // Production is untouched — the static /robots.txt route and normal metadata
  // apply exactly as before.
  if (isProductionHost(req.headers.get('host'))) {
    return NextResponse.next()
  }

  if (req.nextUrl.pathname === '/robots.txt') {
    return new NextResponse(NONPROD_ROBOTS, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=86400',
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }

  // The real de-indexing signal: tag every non-production response `noindex` so
  // crawlers drop anything they've already indexed once they re-crawl it.
  const res = NextResponse.next()
  res.headers.set('x-robots-tag', 'noindex, nofollow')
  return res
}

export const config = {
  // Skip Next.js internals and static asset requests — we only need this on
  // actual page/route responses that a crawler would index.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
