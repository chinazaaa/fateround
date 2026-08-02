import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import type { PublicProfileSummary } from '@/lib/profile/public-profile'

const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }
// Tinted tile behind each top-trophy medal.
const TIER_TILE: Record<string, string> = {
  bronze: 'linear-gradient(135deg, #cd7f32, #a86423)',
  silver: 'linear-gradient(135deg, #d8d8e0, #a8a8b8)',
  gold: 'linear-gradient(135deg, #f6d365, #f0b429)',
  platinum: 'linear-gradient(135deg, #e9e4ff, #c4b5fd)',
}

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
              <p className="mt-1 whitespace-nowrap text-sm font-semibold" style={{ color: 'var(--accent, #f43f5e)' }}>
                🔥 {plural(summary.currentStreak, 'day')} streak
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
          <div className="glass-card p-5">
            <p className="text-faint mb-3 text-xs font-bold uppercase tracking-wide">Top trophies</p>
            <div className="space-y-3">
              {summary.topTrophies.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ background: TIER_TILE[t.tier] ?? 'var(--surface-inset-bg)' }}
                    aria-hidden
                  >
                    {TIER_EMOJI[t.tier] ?? '🏅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{t.title}</p>
                    <p className="text-faint truncate text-xs">
                      {t.gameLabel}
                      {t.tier ? ` · ${t.tier[0].toUpperCase()}${t.tier.slice(1)}` : ''}
                      {t.rarityPct !== null ? ` · ${t.rarityPct}% of players` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {summary.trophyCount > 0 && (
              <Link
                href={`/u/${summary.username}/trophies`}
                className="mt-4 block text-center text-sm font-semibold no-underline"
                style={{ color: 'var(--accent, #f43f5e)' }}
              >
                See all {summary.trophyCount} {summary.trophyCount === 1 ? 'trophy' : 'trophies'} →
              </Link>
            )}
          </div>
        )}

        <div className="mx-auto max-w-sm pt-1">
          <Link href="/" className="btn-primary block w-full text-center no-underline">
            Beat {summary.handle}&apos;s score →
          </Link>
        </div>
      </div>
    </>
  )
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-card p-3 text-center">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">{label}</p>
    </div>
  )
}
