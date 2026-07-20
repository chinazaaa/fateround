import { describe, it, expect } from 'vitest'
import { createBlogPostSchema } from '@/lib/validation'

const valid = {
  slug: 'my-post',
  title: 'My Post',
  excerpt: 'A short summary.',
  body: '## Heading\n\nA paragraph with a [link](/games).',
}

describe('createBlogPostSchema', () => {
  it('accepts a minimal valid post and defaults tags to []', () => {
    const parsed = createBlogPostSchema.parse(valid)
    expect(parsed.slug).toBe('my-post')
    expect(parsed.tags).toEqual([])
  })

  it('rejects a slug with spaces or uppercase', () => {
    expect(createBlogPostSchema.safeParse({ ...valid, slug: 'Bad Slug' }).success).toBe(false)
  })

  it('keeps markdown angle brackets in the body (does NOT strip them like sanitizedString)', () => {
    const parsed = createBlogPostSchema.parse({ ...valid, body: 'if x < 10 and y > 5 then win' })
    expect(parsed.body).toContain('< 10')
    expect(parsed.body).toContain('> 5')
  })

  it('strips HTML from the title (which is a sanitizedString)', () => {
    const parsed = createBlogPostSchema.parse({ ...valid, title: 'Hi <script>alert(1)</script> there' })
    expect(parsed.title).not.toContain('<script>')
  })

  it('accepts an https cover image and a root-relative path', () => {
    expect(createBlogPostSchema.safeParse({ ...valid, coverImageUrl: 'https://x.com/a.png' }).success).toBe(true)
    expect(createBlogPostSchema.safeParse({ ...valid, coverImageUrl: '/og/whot.png' }).success).toBe(true)
  })

  it('rejects a cover image that is neither a URL nor a path', () => {
    expect(createBlogPostSchema.safeParse({ ...valid, coverImageUrl: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('normalises an empty cover image to undefined', () => {
    const parsed = createBlogPostSchema.parse({ ...valid, coverImageUrl: '' })
    expect(parsed.coverImageUrl).toBeUndefined()
  })

  it('rejects an invalid publishedAt', () => {
    expect(createBlogPostSchema.safeParse({ ...valid, publishedAt: 'not-a-date' }).success).toBe(false)
  })

  it('accepts an ISO publishedAt with offset', () => {
    expect(createBlogPostSchema.safeParse({ ...valid, publishedAt: '2026-07-01T00:00:00.000Z' }).success).toBe(true)
  })
})
