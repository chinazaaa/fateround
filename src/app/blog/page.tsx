import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import {
  PencilEdit02Icon,
  SparklesIcon,
  GameController01Icon,
  ChampionIcon,
  DicesIcon,
  Cards01Icon,
  PuzzleIcon,
  Quiz01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
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

const BLOG_ACCENTS: { accent: string; icon: IconSvgElement }[] = [
  { accent: '#f43f5e', icon: PencilEdit02Icon },
  { accent: '#8b5cf6', icon: SparklesIcon },
  { accent: '#0ea5e9', icon: GameController01Icon },
  { accent: '#10b981', icon: ChampionIcon },
  { accent: '#f59e0b', icon: DicesIcon },
  { accent: '#ec4899', icon: Cards01Icon },
  { accent: '#14b8a6', icon: PuzzleIcon },
  { accent: '#6366f1', icon: Quiz01Icon },
]

function getBlogTheme(index: number) {
  return BLOG_ACCENTS[index % BLOG_ACCENTS.length]
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
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          {/* ── Hero section ── */}
          <div className="mb-8 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={PencilEdit02Icon} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              Blog &amp; Guides
            </h1>
            <p className="mx-auto max-w-xl text-sm" style={{ color: 'var(--text-muted)' }}>
              How to run great game nights, tournaments, and party games — plus rules and how-tos for the games on{' '}
              {SITE_NAME}.
            </p>
          </div>

          <div className="mx-auto max-w-5xl space-y-8">
            {posts.length === 0 ? (
              <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No posts yet — check back soon.
              </p>
            ) : (
              <>
                {featured && <FeaturedCard post={featured} theme={getBlogTheme(0)} />}

                {rest.length > 0 && (
                  <section className="mt-10">
                    <h2 className="mb-4 text-xl font-bold tracking-tight" style={{ color: 'var(--primary, #f43f5e)' }}>
                      Recent articles
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {rest.map((post, idx) => (
                        <GridCard key={post.id} post={post} theme={getBlogTheme(idx + 1)} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}

/** Image if the post has one, otherwise a themed glyph cover so the layout stays even. */
function Cover({ post, icon, className }: { post: BlogPost; icon: IconSvgElement; className: string }) {
  if (post.cover_image_url) {
    return (
      <img
        src={post.cover_image_url}
        alt=""
        className={`object-cover ${className}`}
        style={{ border: '1px solid color-mix(in srgb, var(--accent) 16%, var(--border))' }}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        border: '1px solid color-mix(in srgb, var(--accent) 16%, var(--border))',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 5%, transparent))',
      }}
    >
      <span className="fr-glyph">
        <Glyph icon={icon} size={32} />
      </span>
    </div>
  )
}

function FeaturedBadge() {
  return <span className="fr-gamecard__players !bg-[var(--accent)] !text-white">Featured</span>
}

function FeaturedCard({ post, theme }: { post: BlogPost; theme: { accent: string; icon: IconSvgElement } }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="fr-gamecard !grid gap-6 md:grid-cols-2 md:items-center no-underline max-w-3xl mx-auto"
      style={{ '--accent': theme.accent } as React.CSSProperties}
    >
      <Cover post={post} icon={theme.icon} className="aspect-[4/3] w-full rounded-[12px]" />
      <div className="flex flex-col space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FeaturedBadge />
          {post.published_at && <span className="fr-gamecard__vibe">{formatPostDate(post.published_at)}</span>}
          <span className="fr-gamecard__vibe">· {readingMinutes(post.body)} min read</span>
        </div>
        <h2 className="fr-gamecard__title text-2xl sm:text-3xl">{post.title}</h2>
        <p className="fr-gamecard__tagline line-clamp-3 text-sm leading-relaxed">{post.excerpt}</p>
        <div className="fr-gamecard__meta mt-auto pt-2">
          <span className="fr-gamecard__players">{post.author}</span>
          <span className="fr-gamecard__vibe font-semibold" style={{ color: 'var(--accent)' }}>
            Read article →
          </span>
        </div>
      </div>
    </Link>
  )
}

function GridCard({ post, theme }: { post: BlogPost; theme: { accent: string; icon: IconSvgElement } }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="fr-gamecard no-underline"
      style={{ '--accent': theme.accent } as React.CSSProperties}
    >
      <Cover post={post} icon={theme.icon} className="aspect-[16/10] w-full rounded-[10px]" />
      <h3 className="fr-gamecard__title">{post.title}</h3>
      <p className="fr-gamecard__tagline line-clamp-2">{post.excerpt}</p>
      <div className="fr-gamecard__meta">
        <span className="fr-gamecard__players">{post.author}</span>
        {post.published_at && <span className="fr-gamecard__vibe">{formatPostDate(post.published_at)}</span>}
        <span className="fr-gamecard__vibe">· {readingMinutes(post.body)} min read</span>
      </div>
    </Link>
  )
}
