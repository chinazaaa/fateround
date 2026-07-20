import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { SITE_NAME, breadcrumbJsonLd } from '@/lib/seo'
import { fetchPublishedPosts } from '@/lib/blog-server'
import { formatPostDate, partitionFeatured, readingMinutes, type BlogPost } from '@/lib/blog'

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

  const { featured, rest } = partitionFeatured(posts)

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
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
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
          <>
            {featured && <FeaturedCard post={featured} />}

            {rest.length > 0 && (
              <section className="mt-14">
                <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Recent articles</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Fresh guides and how-tos from the team.</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post) => (
                    <GridCard key={post.id} post={post} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </SiteChrome>
  )
}

/** Image if the post has one, otherwise a themed placeholder so the layout stays even. */
function Cover({ post, className }: { post: BlogPost; className: string }) {
  if (post.cover_image_url) {
    return (
      <img
        src={post.cover_image_url}
        alt=""
        className={`object-cover ${className}`}
        style={{ border: '1px solid var(--border)' }}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        border: '1px solid var(--border)',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, transparent), color-mix(in srgb, var(--primary) 5%, transparent))',
      }}
    >
      <span className="text-3xl opacity-70" aria-hidden>
        🎲
      </span>
    </div>
  )
}

function FeaturedBadge() {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
    >
      Featured
    </span>
  )
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group mt-10 grid gap-6 rounded-[20px] p-5 transition-colors sm:p-6 md:grid-cols-2 md:items-center"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <Cover post={post} className="aspect-[16/10] w-full rounded-[14px]" />
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <FeaturedBadge />
          {post.published_at && <span>{formatPostDate(post.published_at)}</span>}
          <span aria-hidden>·</span>
          <span>{readingMinutes(post.body)} min read</span>
        </div>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{post.title}</h2>
        <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-[var(--muted)]">{post.excerpt}</p>
        <span className="mt-4 inline-block text-sm font-semibold text-[var(--primary)]">Read more →</span>
      </div>
    </Link>
  )
}

function GridCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col rounded-[16px] p-4 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <Cover post={post} className="aspect-[16/10] w-full rounded-[12px]" />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--primary)]">{post.author}</span>
        {post.published_at && <span className="text-[var(--muted)]">{formatPostDate(post.published_at)}</span>}
      </div>
      <h3 className="mt-1.5 text-lg font-bold leading-snug tracking-tight text-[var(--foreground)]">{post.title}</h3>
      <p className="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--muted)]">{post.excerpt}</p>
      <span className="mt-3 inline-block text-sm font-semibold text-[var(--primary)]">Read more →</span>
    </Link>
  )
}
