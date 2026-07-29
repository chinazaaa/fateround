import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'

// The middleware verifies admin sessions via this helper; stub it so we can drive
// the authed / unauthed branches without real crypto or env.
const verifyAdminSessionToken = vi.fn()
vi.mock('@/lib/admin-session', () => ({
  verifyAdminSessionToken: (token?: string) => verifyAdminSessionToken(token),
}))

const { middleware } = await import('./middleware')

function req(host: string, path = '/', cookie?: string): NextRequest {
  const headers: Record<string, string> = { host }
  if (cookie) headers.cookie = cookie
  return new NextRequest(`http://localhost${path}`, { headers })
}

beforeEach(() => {
  verifyAdminSessionToken.mockReset()
})

describe('middleware — file placement', () => {
  // Next.js only picks up middleware that sits beside the app directory. This project keeps
  // its app at `src/app`, so the file MUST be `src/middleware.ts`; a root-level
  // `middleware.ts` is silently ignored — no error, no warning, it just never runs.
  //
  // That is exactly what happened between 2026-07-20 and 2026-07-29: the file was moved from
  // `src/middleware.ts` to the repo root, which disabled BOTH the crawler blocking and the
  // admin auth gate in every deployed environment. The suite below stayed green the whole
  // time because every test imports the module by path, which Next's resolution never
  // consults. Hence this test, which asserts placement rather than behaviour.
  it('lives beside src/app, not at the repo root', () => {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url))
    expect(existsSync(join(repoRoot, 'src', 'app'))).toBe(true)
    expect(existsSync(join(repoRoot, 'src', 'middleware.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'middleware.ts'))).toBe(false)
  })
})

describe('middleware — admin auth gate', () => {
  it('redirects unauthenticated /admin requests to the login page', async () => {
    verifyAdminSessionToken.mockResolvedValue(null)
    const res = await middleware(req('fateround.com', '/admin/blog'))
    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    expect(location).toContain('/admin/login')
    expect(location).toContain('next=%2Fadmin%2Fblog')
  })

  it('lets authenticated /admin requests through', async () => {
    verifyAdminSessionToken.mockResolvedValue({ sub: 'admin' })
    const res = await middleware(req('fateround.com', '/admin/blog', 'admin_session=tok'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('never gates /admin/login itself', async () => {
    const res = await middleware(req('fateround.com', '/admin/login'))
    expect(res.headers.get('location')).toBeNull()
    expect(verifyAdminSessionToken).not.toHaveBeenCalled()
  })
})

describe('middleware — crawler blocking', () => {
  it('leaves production hosts fully indexable', async () => {
    for (const host of ['fateround.com', 'www.fateround.com', 'fateround.com:443']) {
      const res = await middleware(req(host, '/games/whot'))
      expect(res.headers.get('x-robots-tag')).toBeNull()
    }
  })

  it('serves a crawl-permissive, sitemap-free robots.txt on non-production hosts', async () => {
    // Crawlable on purpose so bots re-fetch and see the noindex header; no
    // sitemap line so we don't actively feed dev URLs to crawlers.
    const res = await middleware(req('dev.fateround.com', '/robots.txt'))
    const body = await res.text()
    expect(body).toBe('User-agent: *\nAllow: /\n')
    expect(body).not.toContain('Sitemap')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('passes the production robots.txt through untouched', async () => {
    const res = await middleware(req('fateround.com', '/robots.txt'))
    expect(res.headers.get('x-robots-tag')).toBeNull()
  })

  it('sets X-Robots-Tag: noindex on pages from non-production hosts', async () => {
    for (const host of ['dev.fateround.com', 'fateround-git-dev.vercel.app', 'localhost']) {
      const res = await middleware(req(host, '/games/whot'))
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })
})
