import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { PublicProfileCard } from '@/components/profile/PublicProfileCard'
import { getPublicProfileSummary } from '@/lib/profile/public-profile'
import { SITE_NAME } from '@/lib/seo'

type Props = { params: Promise<{ username: string }> }

// Fresh per request (not ISR): a request that lands the instant BEFORE a username is claimed (or
// during a transient DB blip) returns notFound(); ISR would cache that 404 and keep serving it even
// after the profile exists. force-dynamic never caches a 404, and keeps trophy counts current.
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
    <div className="fr-site flex min-h-dvh flex-col">
      <MarketingHeader hideBack />
      <main className="flex-1 pb-14">
        <PublicProfileCard summary={summary} />
      </main>
      <SiteFooter />
    </div>
  )
}
