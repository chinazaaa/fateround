import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSessionToken } from '@/lib/admin-session'

// Next.js supports exactly ONE middleware file per app, so the admin auth gate
// and the crawler-blocking logic have to live together here.

// Only the canonical production hostnames may be indexed. Every other host that
// serves this app — dev.fateround.com, Vercel preview URLs (*.vercel.app), etc.
// — is kept out of search results so it doesn't split ranking authority with
// the real site or compete with production pages.
const PRODUCTION_HOSTS = new Set(['fateround.com', 'www.fateround.com'])

function isProductionHost(host: string | null): boolean {
  if (!host) return false
  const bare = host.split(':')[0].toLowerCase()
  return PRODUCTION_HOSTS.has(bare)
}

const DISALLOW_ALL_ROBOTS = 'User-agent: *\nDisallow: /\n'

function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // --- Admin auth gate (runs on every host) ---
  if (isAdminRoute(pathname) && pathname !== '/admin/login') {
    const token = request.cookies.get('admin_session')?.value
    const session = await verifyAdminSessionToken(token)
    if (!session) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // --- Crawler blocking (non-production hosts only) ---
  // Production is untouched: the static /robots.txt route and normal metadata
  // apply exactly as before, with no X-Robots-Tag added.
  if (!isProductionHost(request.headers.get('host'))) {
    if (pathname === '/robots.txt') {
      return new NextResponse(DISALLOW_ALL_ROBOTS, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600, s-maxage=86400',
          'x-robots-tag': 'noindex, nofollow',
        },
      })
    }
    const res = NextResponse.next()
    res.headers.set('x-robots-tag', 'noindex, nofollow')
    return res
  }

  return NextResponse.next()
}

export const config = {
  // Broad matcher so crawler blocking covers every indexable page; the admin
  // gate above narrows itself to /admin routes. Skip Next.js internals and
  // static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
