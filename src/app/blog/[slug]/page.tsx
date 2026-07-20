import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteChrome } from '@/components/SiteChrome'
import { Markdown } from '@/components/blog/Markdown'
import { SITE_NAME, blogPostingJsonLd, breadcrumbJsonLd } from '@/lib/seo'
import { fetchPublishedPost, fetchPublishedSlugs } from '@/lib/blog-server'
import { formatPostDate, readingMinutes } from '@/lib/blog'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  try {
    const slugs = await fetchPublishedSlugs()
    return slugs.map((slug) => ({ slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await fetchPublishedPost(slug).catch(() => null)
  if (!post) return {}

  const image = post.cover_image_url ? [post.cover_image_url] : undefined
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      publishedTime: post.published_at ?? undefined,
      images: image,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      images: image,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await fetchPublishedPost(slug).catch(() => null)
  if (!post) notFound()

  return (
    <SiteChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: blogPostingJsonLd({
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            author: post.author,
            coverImageUrl: post.cover_image_url,
            publishedAt: post.published_at,
            updatedAt: post.updated_at,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        }}
      />

      <article className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <Link href="/blog" className="text-sm font-semibold text-[var(--muted)]">
          ← All posts
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          {post.published_at && <span>{formatPostDate(post.published_at)}</span>}
          <span aria-hidden>·</span>
          <span>{readingMinutes(post.body)} min read</span>
          <span aria-hidden>·</span>
          <span>{post.author}</span>
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-[1.1] tracking-tight text-[var(--foreground)] sm:text-4xl">
          {post.title}
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-[var(--muted)]">{post.excerpt}</p>

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt=""
            className="mt-6 w-full rounded-[16px] object-cover"
            style={{ border: '1px solid var(--border)' }}
          />
        )}

        <div className="mt-6">
          <Markdown>{post.body}</Markdown>
        </div>

        {post.tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
            {post.tags.map((tag) => (
              <span key={tag} className="fr-chip !text-[13px]">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="mt-8 rounded-[16px] p-6 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-lg font-bold tracking-tight text-[var(--foreground)]">Ready to play?</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create a room, share the code, everyone joins from their phone.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <Link href="/games" className="fr-btn fr-btn--primary">
              Browse games
            </Link>
            <Link href="/blog" className="fr-btn fr-btn--secondary">
              More posts
            </Link>
          </div>
        </div>
      </article>
    </SiteChrome>
  )
}
