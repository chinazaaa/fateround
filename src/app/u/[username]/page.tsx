import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicProfileCard } from '@/components/profile/PublicProfileCard'
import { getPublicProfileSummary } from '@/lib/profile/public-profile'
import { SITE_NAME } from '@/lib/seo'

type Props = { params: Promise<{ username: string }> }

// Render fresh on every request rather than ISR-caching. A profile changes as the player plays,
// and — the reason this isn't `revalidate` — a request that lands the instant BEFORE a username is
// claimed (or during a transient DB blip) returns notFound(); with ISR that 404 would be cached and
// served for the whole window even after the profile exists. force-dynamic never caches a 404.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const summary = await getPublicProfileSummary(username)
  if (!summary) return { title: `Profile not found | ${SITE_NAME}` }

  const title = `${summary.handle} on ${SITE_NAME}`
  const description = `${summary.handle} has earned ${summary.trophyCount} ${
    summary.trophyCount === 1 ? 'trophy' : 'trophies'
  } on ${SITE_NAME} — Level ${summary.level}. See their trophy case and beat their score.`

  return {
    title,
    description,
    alternates: { canonical: `/u/${summary.username}` },
    openGraph: { title, description, url: `/u/${summary.username}`, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params
  const summary = await getPublicProfileSummary(username)
  if (!summary) notFound()

  return (
    <div className="fr-site flex min-h-dvh flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <PublicProfileCard summary={summary} />
        <p className="text-faint mt-6 text-center text-xs">
          <Link href="/" className="font-semibold no-underline" style={{ color: 'var(--accent, #f43f5e)' }}>
            {SITE_NAME}
          </Link>{' '}
          — free party games, no download.
        </p>
      </div>
    </div>
  )
}
