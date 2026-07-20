import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { SITE_NAME, breadcrumbJsonLd } from '@/lib/seo'
import { fetchPublishedPosts } from '@/lib/blog-server'
import { formatPostDate, readingMinutes, type BlogPost } from '@/lib/blog'

// Posts are admin-managed; revalidate so new/edited posts appear without a redeploy.
export const revalidate = 300

export const metadata: Metadata = {
  title: 'Blog',
  description: `Guides, tips and game rules from ${SITE_NAME} — how to run game nights, school championships, and party games that work over a video call.`,
  alternates: { canonical: '/blog' },
}

export default async function BlogIndexPage() {
  let posts: BlogPost[] = []
  try {
    posts = await fetchPublishedPosts()
  } catch {
    // Table missing or DB unreachable — render the empty state rather than 500.
  }

  const [featured, ...rest] = posts

  return (
    <SiteChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
          ]),
        }}
      />
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Blog</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Guides & game tips
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
          How to run great game nights, tournaments, and party games — plus rules and how-tos for the games on{' '}
          {SITE_NAME}.
        </p>

        {posts.length === 0 ? (
          <p className="mt-12 text-[15px] text-[var(--muted)]">No posts yet — check back soon.</p>
        ) : (
          <div className="mt-10 space-y-4">
            {featured && <PostCard post={featured} featured />}
            {rest.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </SiteChrome>
  )
}

function PostCard({ post, featured }: { post: BlogPost; featured?: boolean }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block rounded-[16px] p-5 transition-colors sm:p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {post.cover_image_url && (
        <img
          src={post.cover_image_url}
          alt=""
          className={`mb-4 w-full rounded-[12px] object-cover ${featured ? 'aspect-[2/1]' : 'aspect-[3/1]'}`}
          style={{ border: '1px solid var(--border)' }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        {post.published_at && <span>{formatPostDate(post.published_at)}</span>}
        <span aria-hidden>·</span>
        <span>{readingMinutes(post.body)} min read</span>
      </div>
      <h2 className={`mt-2 font-bold tracking-tight text-[var(--foreground)] ${featured ? 'text-2xl' : 'text-xl'}`}>
        {post.title}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">{post.excerpt}</p>
      <span className="mt-3 inline-block text-sm font-semibold text-[var(--primary)]">Read more →</span>
    </Link>
  )
}
