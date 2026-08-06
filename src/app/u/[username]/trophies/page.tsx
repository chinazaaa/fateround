import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { Glyph } from '@/components/icons/Glyph'
import { ArrowLeft01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getPublicProfileCabinet } from '@/lib/profile/public-profile'
import { GLOBAL_SCOPE } from '@/lib/trophies/criteria'
import { parseGameType } from '@/lib/game-types'
import { gameIcon, tierIcon, UI_ICONS } from '@/lib/game-glyphs'
import { SITE_NAME } from '@/lib/seo'

type Props = { params: Promise<{ username: string }> }

// Fresh per request (not ISR): see the note in ../page.tsx — a notFound() from a not-yet-claimed
// username must never be cached and served as a stale 404 once the profile exists.
export const dynamic = 'force-dynamic'

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function formatEarned(at: string): string {
  // Explicit locale: this renders on the server, where the runtime's default locale is arbitrary
  // and would otherwise format dates inconsistently between environments.
  const d = new Date(at)
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
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
    <div className="fr-site flex min-h-dvh flex-col">
      <MarketingHeader hideBack />
      <main className="flex-1 pb-14">
        {/* Hero band — a tinted header so the top reads as intentional on a wide desktop, not empty. */}
        <div
          className="border-b border-[var(--border)]"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--accent, #f43f5e) 9%, transparent), transparent)',
          }}
        >
          <div className="mx-auto max-w-2xl px-4 pt-6 pb-9 sm:px-6">
            <Link
              href={`/u/${cabinet.username}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-muted no-underline hover:text-[var(--foreground)]"
            >
              <Glyph icon={ArrowLeft01Icon} size={16} />
              {cabinet.handle}
            </Link>
            <div className="mt-5 flex flex-col items-center text-center">
              <Avatar name={cabinet.handle} photoUrl={cabinet.avatarUrl} size="lg" className="!h-20 !w-20 !text-2xl" />
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{cabinet.handle}’s trophies</h1>
              <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3">
                <Tile value={`${cabinet.trophyCount}`} label={cabinet.trophyCount === 1 ? 'Trophy' : 'Trophies'} />
                <Tile value={`${cabinet.level}`} label="Level" />
                <Tile value={cabinet.points.toLocaleString()} label="Points" />
              </div>
            </div>
          </div>
        </div>

        {/* Games */}
        <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
          {cabinet.groups.length === 0 ? (
            <p className="fr-card p-6 text-center text-sm text-muted">No trophies earned yet.</p>
          ) : (
            // Collapsible per game so a profile with many games stays scannable — native
            // <details>/<summary>, so it needs no client JS. The first (most-decorated) game opens by
            // default; the rest start collapsed.
            <div className="space-y-3">
              {cabinet.groups.map((group, index) => (
                <details key={group.gameType} className="group fr-card overflow-hidden" open={index === 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    {/* No `--accent` is set on this page, so `.fr-glyph` falls back to `--primary`. */}
                    <span className="fr-glyph fr-glyph--xs">
                      <Glyph
                        icon={
                          group.gameType === GLOBAL_SCOPE
                            ? UI_ICONS.tournament
                            : gameIcon(parseGameType(group.gameType))
                        }
                        size={18}
                      />
                    </span>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--primary)]">{group.label}</h2>
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-faint)' }}>
                      {group.trophies.length} {group.trophies.length === 1 ? 'trophy' : 'trophies'}
                    </span>
                    <span
                      className="shrink-0 transition-transform group-open:rotate-180"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      <Glyph icon={ArrowDown01Icon} size={16} />
                    </span>
                  </summary>
                  <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
                    <p className="text-faint mb-3 text-xs">
                      {plural(group.gamesPlayed, 'game')} played
                      {group.gamesWon ? ` · ${group.gamesWon} won` : ''}
                    </p>
                    <ul className="space-y-3">
                      {group.trophies.map((t) => (
                        <li key={t.id} className="flex items-start gap-3">
                          <span className="fr-glyph fr-glyph--sm shrink-0">
                            <Glyph icon={tierIcon(t.tier)} size={20} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{t.title}</p>
                            <p className="text-sm text-muted">{t.description}</p>
                            <div
                              className="mt-1 flex flex-wrap items-center gap-x-2 text-xs"
                              style={{ color: 'var(--text-faint)' }}
                            >
                              <span>{plural(t.points, 'pt')}</span>
                              {t.rarityPct !== null && <span>· {t.rarityPct}% of players</span>}
                              {t.earnedAt && <span className="ml-auto">{formatEarned(t.earnedAt)}</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="fr-card p-3 text-center">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
        {label}
      </p>
    </div>
  )
}
