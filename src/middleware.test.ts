import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

function req(host: string, path = '/'): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers: { host } })
}

describe('crawler-blocking middleware', () => {
  it('leaves production hosts fully indexable', async () => {
    for (const host of ['fateround.com', 'www.fateround.com', 'fateround.com:443']) {
      const res = middleware(req(host))
      expect(res.headers.get('x-robots-tag')).toBeNull()
    }
  })

  it('serves a crawl-permissive, sitemap-free robots.txt on non-production hosts', async () => {
    // Crawlable on purpose so bots re-fetch and see the noindex header; no
    // sitemap line so we don't actively feed dev URLs to crawlers.
    const res = middleware(req('dev.fateround.com', '/robots.txt'))
    const body = await res.text()
    expect(body).toBe('User-agent: *\nAllow: /\n')
    expect(body).not.toContain('Sitemap')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('leaves the real robots.txt untouched on production', () => {
    // Production robots.txt is handled by the static route, so middleware must
    // pass it through (no body override).
    const res = middleware(req('fateround.com', '/robots.txt'))
    expect(res.headers.get('x-robots-tag')).toBeNull()
  })

  it('sets X-Robots-Tag: noindex on pages served from non-production hosts', () => {
    for (const host of ['dev.fateround.com', 'fateround-git-dev.vercel.app', 'localhost']) {
      const res = middleware(req(host, '/games/whot'))
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })
})
