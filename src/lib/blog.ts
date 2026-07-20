export type BlogStatus = 'draft' | 'published'

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  cover_image_url: string | null
  author: string
  tags: string[]
  status: BlogStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export const BLOG_STATUS_OPTIONS: BlogStatus[] = ['draft', 'published']

export const BLOG_STATUS_META: Record<BlogStatus, { label: string }> = {
  draft: { label: 'Draft' },
  published: { label: 'Published' },
}

/**
 * URL-safe slug from a title. Admins can override it, but this gives a sensible default and
 * is the same normalisation the API applies, so a hand-typed slug can't smuggle in bad chars.
 */
export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '') // don't turn "don't" into "don-t"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** A post is publicly visible only if it's published and not future-dated. */
export function isPublicPost(post: BlogPost, now: number = Date.now()): boolean {
  if (post.status !== 'published') return false
  if (!post.published_at) return false
  return new Date(post.published_at).getTime() <= now
}

/** Newest published first; used by both the public list and the API response. */
export function sortPostsByPublished(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => {
    const at = a.published_at ? new Date(a.published_at).getTime() : 0
    const bt = b.published_at ? new Date(b.published_at).getTime() : 0
    return bt - at
  })
}

/** Admin list ordering: newest touched first, so drafts you're working on float up. */
export function sortPostsForAdmin(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export function formatPostDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Rough read-time estimate from the markdown body (~200 words/min). */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
