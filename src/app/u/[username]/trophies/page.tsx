import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { getPublicProfileCabinet } from '@/lib/profile/public-profile'
import { SITE_NAME } from '@/lib/seo'

type Props = { params: Promise<{ username: string }> }

export const revalidate = 300

const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function formatEarned(at: string): string {
  const d = new Date(at)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const cabinet = await getPublicProfileCabinet(username)
  if (!cabinet) return { title: `Profile not found | ${SITE_NAME}` }
  const title = `${cabinet.handle}’s trophies on ${SITE_NAME}`
  return {
    title,
    description: `Every trophy ${cabinet.handle} has earned on ${SITE_NAME}, game by game.`,
    alternates: { canonical: `/u/${cabinet.username}/trophies` },
  }
}

/** The full trophy cabinet — everything earned, grouped by game. Earned only (see public-profile.ts). */
export default async function PublicTrophiesPage({ params }: Props) {
  const { username } = await params
  const cabinet = await getPublicProfileCabinet(username)
  if (!cabinet) notFound()

  return (
    <div className="fr-site mx-auto min-h-dvh max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      <Link
        href={`/u/${cabinet.username}`}
        className="text-sm font-semibold text-muted no-underline hover:text-[var(--foreground)]"
      >
        ← {cabinet.handle}
      </Link>

      <div className="flex items-center gap-3">
        <Avatar name={cabinet.handle} photoUrl={cabinet.avatarUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight">{cabinet.handle}’s trophies</h1>
          <p className="mt-0.5 text-sm text-muted">
            {cabinet.trophyCount} {cabinet.trophyCount === 1 ? 'trophy' : 'trophies'} · Level {cabinet.level} ·{' '}
            {cabinet.points.toLocaleString()} points
          </p>
        </div>
      </div>

      {cabinet.groups.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">No trophies earned yet.</p>
      ) : (
        cabinet.groups.map((group) => (
          <section key={group.gameType} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                <span aria-hidden>{group.emoji}</span>
                {group.label}
              </h2>
              <span className="text-faint text-xs">
                {plural(group.gamesPlayed, 'game')} played
                {group.gamesWon ? ` · ${group.gamesWon} won` : ''}
              </span>
            </div>
            <ul className="space-y-2">
              {group.trophies.map((t) => (
                <li key={t.id} className="glass-card flex items-start gap-3 p-4">
                  <span className="text-2xl" aria-hidden>
                    {TIER_EMOJI[t.tier] ?? '🏅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.title}</p>
                    <p className="text-sm text-muted">{t.description}</p>
                    <div className="text-faint mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                      <span>{plural(t.points, 'pt')}</span>
                      {t.rarityPct !== null && <span>· {t.rarityPct}% of players</span>}
                      {t.earnedAt && <span className="ml-auto">{formatEarned(t.earnedAt)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="text-faint pt-2 text-center text-xs">
        <Link href="/" className="font-semibold no-underline" style={{ color: 'var(--accent, #f43f5e)' }}>
          {SITE_NAME}
        </Link>{' '}
        — free party games, no download.
      </p>
    </div>
  )
}
