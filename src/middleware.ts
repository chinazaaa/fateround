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

const DISALLOW_ALL_ROBOTS = 'User-agent: *\nDisallow: /\n'

export function middleware(req: NextRequest): NextResponse {
  // Production is untouched — the static /robots.txt route and normal metadata
  // apply exactly as before.
  if (isProductionHost(req.headers.get('host'))) {
    return NextResponse.next()
  }

  // Non-production host: serve a blanket "block everything" robots.txt instead
  // of the crawl-friendly one so bots that respect robots never enumerate pages.
  if (req.nextUrl.pathname === '/robots.txt') {
    return new NextResponse(DISALLOW_ALL_ROBOTS, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=86400',
        // Belt-and-suspenders: also tag the robots response itself.
        'x-robots-tag': 'noindex, nofollow',
      },
    })
  }

  // And set X-Robots-Tag on every other response so anything already indexed
  // (or crawled despite robots.txt) is dropped from the index.
  const res = NextResponse.next()
  res.headers.set('x-robots-tag', 'noindex, nofollow')
  return res
}

export const config = {
  // Skip Next.js internals and static asset requests — we only need this on
  // actual page/route responses that a crawler would index.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
