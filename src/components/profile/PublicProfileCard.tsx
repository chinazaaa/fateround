import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Glyph } from '@/components/icons/Glyph'
import { FireIcon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import type { PublicProfileSummary } from '@/lib/profile/public-profile'
import { tierIcon, TIER_COLORS } from '@/lib/game-glyphs'

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * The public profile view shown on /u/[username]. Presentational — a visitor views it; the owner
 * shares it from their own /profile dashboard. Laid out as a full-width hero band + content column
 * to match /u/[username]/trophies, so the two public pages read as one design.
 */
export function PublicProfileCard({ summary }: { summary: PublicProfileSummary }) {
  return (
    <>
      {/* Hero band — full-bleed tinted header so the top reads as intentional on desktop. */}
      <div
        className="border-b border-[var(--border)]"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--accent, #f43f5e) 9%, transparent), transparent)',
        }}
      >
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-9 sm:px-6">
          <div className="flex flex-col items-center text-center">
            <Avatar name={summary.handle} photoUrl={summary.avatarUrl} size="lg" className="!h-24 !w-24 !text-3xl" />
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{summary.handle}</h1>
            <p className="mt-1 text-sm text-muted">
              Level {summary.level} · {summary.points.toLocaleString()} points
            </p>
            {summary.currentStreak > 0 && (
              <p
                className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold"
                style={{ color: 'var(--accent, #f43f5e)' }}
              >
                <Glyph icon={FireIcon} size={16} />
                {plural(summary.currentStreak, 'day')} streak
              </p>
            )}
            <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3">
              <Tile value={`${summary.trophyCount}`} label="Trophies" />
              <Tile value={`${summary.gamesPlayed}`} label="Games played" />
              <Tile value={summary.winRate === null ? '—' : `${summary.winRate}%`} label="Win rate" />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-6 sm:px-6">
        {summary.topTrophies.length > 0 && (
          <div className="fr-card p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)] mb-3">Top trophies</p>
            <div className="space-y-3">
              {summary.topTrophies.map((t) => {
                const tierColor = TIER_COLORS[t.tier] ?? '#a8a8b8'
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    {/* Tinted plate rather than `.fr-glyph`: that plate derives every colour from
                        `--accent`, which would paint all four tiers the same rose. Tinting the tier's
                        own metal keeps bronze/silver/gold/platinum distinguishable at a glance, and a
                        12% wash behind the stroke stays legible in both themes. */}
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: `color-mix(in srgb, ${tierColor} 16%, transparent)`,
                        color: tierColor,
                      }}
                    >
                      <Glyph icon={tierIcon(t.tier)} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight">{t.title}</p>
                      <p className="truncate text-xs" style={{ color: 'var(--text-faint)' }}>
                        {t.gameLabel}
                        {t.tier ? ` · ${t.tier[0].toUpperCase()}${t.tier.slice(1)}` : ''}
                        {t.rarityPct !== null ? ` · ${t.rarityPct}% of players` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            {summary.trophyCount > 0 && (
              <Link
                href={`/u/${summary.username}/trophies`}
                className="mt-4 flex items-center justify-center gap-1 text-sm font-semibold text-[var(--primary)] no-underline hover:underline"
              >
                See all {summary.trophyCount} {summary.trophyCount === 1 ? 'trophy' : 'trophies'}
                <Glyph icon={ArrowRight01Icon} size={16} />
              </Link>
            )}
          </div>
        )}

        <div className="mx-auto max-w-sm pt-1">
          <Link
            href="/"
            className="fr-btn fr-btn--primary flex w-full items-center justify-center gap-1.5 no-underline"
          >
            Beat {summary.handle}&apos;s score
            <Glyph icon={ArrowRight01Icon} size={16} />
          </Link>
        </div>
      </div>
    </>
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
