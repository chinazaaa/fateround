import { describe, it, expect } from 'vitest'
import {
  slugifyTitle,
  isPublicPost,
  sortPostsByPublished,
  sortPostsForAdmin,
  partitionFeatured,
  readingMinutes,
  type BlogPost,
} from '@/lib/blog'

function post(overrides: Partial<BlogPost>): BlogPost {
  return {
    id: overrides.id ?? 'id',
    slug: 'slug',
    title: 'Title',
    excerpt: 'Excerpt',
    body: 'Body',
    cover_image_url: null,
    author: 'FateRound',
    tags: [],
    status: 'published',
    pinned: false,
    published_at: '2026-07-01T00:00:00.000Z',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('slugifyTitle', () => {
  it('lowercases, hyphenates and trims', () => {
    expect(slugifyTitle('  The 12 Best Games!  ')).toBe('the-12-best-games')
  })

  it('does not split contractions on the apostrophe', () => {
    expect(slugifyTitle("Games that don't leave anyone out")).toBe('games-that-dont-leave-anyone-out')
  })

  it('collapses runs of punctuation to a single hyphen', () => {
    expect(slugifyTitle('Whot — rules & tips')).toBe('whot-rules-tips')
  })
})

describe('isPublicPost', () => {
  const now = Date.parse('2026-07-15T00:00:00.000Z')

  it('is true for a published, past-dated post', () => {
    expect(isPublicPost(post({ published_at: '2026-07-01T00:00:00.000Z' }), now)).toBe(true)
  })

  it('is false for a draft even with a past date', () => {
    expect(isPublicPost(post({ status: 'draft', published_at: '2026-07-01T00:00:00.000Z' }), now)).toBe(false)
  })

  it('is false for a published post with no date', () => {
    expect(isPublicPost(post({ published_at: null }), now)).toBe(false)
  })

  it('is false for a future-dated post (scheduled)', () => {
    expect(isPublicPost(post({ published_at: '2026-08-01T00:00:00.000Z' }), now)).toBe(false)
  })
})

describe('sorting', () => {
  it('sortPostsByPublished puts newest published first', () => {
    const a = post({ id: 'a', published_at: '2026-06-01T00:00:00.000Z' })
    const b = post({ id: 'b', published_at: '2026-07-01T00:00:00.000Z' })
    expect(sortPostsByPublished([a, b]).map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('sortPostsForAdmin puts most recently updated first', () => {
    const a = post({ id: 'a', updated_at: '2026-06-01T00:00:00.000Z' })
    const b = post({ id: 'b', updated_at: '2026-07-01T00:00:00.000Z' })
    expect(sortPostsForAdmin([a, b]).map((p) => p.id)).toEqual(['b', 'a'])
  })
})

describe('partitionFeatured', () => {
  it('features the pinned post even when it is not the newest', () => {
    const newest = post({ id: 'newest', published_at: '2026-07-10T00:00:00.000Z' })
    const pinned = post({ id: 'pinned', published_at: '2026-06-01T00:00:00.000Z', pinned: true })
    const { featured, rest } = partitionFeatured([newest, pinned])
    expect(featured?.id).toBe('pinned')
    expect(rest.map((p) => p.id)).toEqual(['newest'])
  })

  it('falls back to the newest (first) post when none is pinned', () => {
    const a = post({ id: 'a' })
    const b = post({ id: 'b' })
    const { featured, rest } = partitionFeatured([a, b])
    expect(featured?.id).toBe('a')
    expect(rest.map((p) => p.id)).toEqual(['b'])
  })

  it('returns null featured for an empty list', () => {
    expect(partitionFeatured([])).toEqual({ featured: null, rest: [] })
  })
})

describe('readingMinutes', () => {
  it('is at least 1 for a short post', () => {
    expect(readingMinutes('a few words')).toBe(1)
  })

  it('scales with length (~200 wpm)', () => {
    expect(readingMinutes(Array(600).fill('word').join(' '))).toBe(3)
  })
})
