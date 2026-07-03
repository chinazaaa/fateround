'use client'

import { useCallback, useRef, useState } from 'react'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob } from '@/lib/share-image'
import { appDomain } from '@/lib/site'
import { gameTypeLabel } from '@/lib/game-types'
import { clampSchoolClassCount, schoolClassLabel, hasGraduated } from '@/lib/tournament-school'
import { useToast } from '@/components/ui/Toast'

const MEDAL = ['🥇', '🥈', '🥉']
const RANK_COLOR = ['var(--marry)', '#64748b', '#b45309']

/**
 * For each player, their placement (1 = best) in the most recent finished round
 * they played — the placements map of the highest-numbered finished game that
 * includes them. Since a knockout player appears in every round until they're cut,
 * this is their current-round rank for survivors and their final-round rank for the
 * eliminated. Used to order knockout standings by last-round performance instead of
 * join order (knockout awards no points, so points can't rank the field).
 */
export function buildLastRoundRank(games: TournamentGame[]): Map<string, number> {
  const byPlayer = new Map<string, number>()
  const finished = games
    .filter((g) => g.status === 'finished' && g.placements && g.round_number != null)
    .sort((a, b) => (a.round_number as number) - (b.round_number as number))
  // Ascending by round, so a later round overwrites an earlier one — each player
  // ends up mapped to their most recent placement.
  for (const g of finished) {
    for (const [playerId, rank] of Object.entries(g.placements as Record<string, number>)) {
      byPlayer.set(playerId, rank)
    }
  }
  return byPlayer
}

/**
 * Head-to-head and knockout have no points — rank by how far each player got: the
 * champion (not eliminated) first, then the most recently eliminated (they lost
 * latest, so they placed higher). For knockout, `lastRoundRank` breaks ties within
 * a group — survivors and players cut in the same round — by their placement in the
 * last round they played, so the board reflects the latest round rather than join
 * order. Round-robin keeps its incoming points order.
 */
export function orderForStandings(
  players: TournamentPlayer[],
  h2h: boolean,
  lastRoundRank?: Map<string, number>
): TournamentPlayer[] {
  if (!h2h) return players
  const rankOf = (id: string) => lastRoundRank?.get(id) ?? Number.POSITIVE_INFINITY
  return [...players].sort((a, b) => {
    if (a.is_eliminated !== b.is_eliminated) return a.is_eliminated ? 1 : -1
    if (a.is_eliminated) {
      // Both eliminated: whoever lasted longer (later elimination) ranks higher.
      const ta = a.eliminated_at ? Date.parse(a.eliminated_at) : 0
      const tb = b.eliminated_at ? Date.parse(b.eliminated_at) : 0
      if (tb !== ta) return tb - ta
    }
    // Both survivors, or eliminated in the same round: order by last-round placement.
    return rankOf(a.id) - rankOf(b.id)
  })
}

/** School standings: highest class first (eliminated last), then by name. */
export function orderSchoolStandings(players: TournamentPlayer[]): TournamentPlayer[] {
  return [...players].sort((a, b) => {
    if (a.is_eliminated !== b.is_eliminated) return a.is_eliminated ? 1 : -1
    return (b.school_level ?? 0) - (a.school_level ?? 0) || a.player_name.localeCompare(b.player_name)
  })
}

/** Plain-text fallback when image capture/share isn't available. */
function buildShareText(title: string, players: TournamentPlayer[], h2h: boolean, schoolClassCount?: number): string {
  const school = schoolClassCount != null
  const lines = [`🏆 ${title}`, '', h2h || school ? 'Standings:' : 'Leaderboard:']
  players.slice(0, 8).forEach((p, i) => {
    const rank = i < 3 ? MEDAL[i] : `${i + 1}.`
    const suffix = school
      ? ` — ${schoolClassLabel(p.school_level ?? 0, schoolClassCount)}`
      : h2h
        ? ''
        : ` — ${p.total_points} pts`
    lines.push(`${rank} ${p.player_name}${suffix}`)
  })
  if (players.length > 8) lines.push(`…and ${players.length - 8} more`)
  lines.push('', `Play at ${appDomain()}`)
  return lines.join('\n')
}

/**
 * Tournament leaderboard card with a "Share results" button that snapshots the
 * standings into a branded image — the same capture + share pipeline the per-game
 * final results use (captureElementAsImage → shareImageBlob).
 */
export function TournamentShareLeaderboard({
  tournament,
  players,
  games = [],
  highlightPlayerId,
}: {
  tournament: Tournament
  players: TournamentPlayer[]
  games?: TournamentGame[]
  /** Outline this player's row (e.g. "you") — cosmetic; ignored in the shared image. */
  highlightPlayerId?: string | null
}) {
  const { success, error } = useToast()
  const captureRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const sharingLock = useRef(false)

  // Head-to-head and knockout are both bracket-style: ranked by how far each
  // player got (no points), with the lone survivor crowned champion.
  const knockout = tournament.format === 'knockout'
  const h2h = tournament.format === 'head-to-head' || knockout
  const school = tournament.format === 'school'
  const schoolClassCount = clampSchoolClassCount(
    (tournament.game_config as { schoolClassCount?: number } | null)?.schoolClassCount
  )
  // Knockout stores a per-round placements map we can rank the field by; head-to-head
  // resolves rounds by match winners, so it keeps the elimination-time ordering only.
  const lastRoundRank = knockout ? buildLastRoundRank(games) : undefined
  const ranked = school ? orderSchoolStandings(players) : orderForStandings(players, h2h, lastRoundRank)

  const handleShare = useCallback(async () => {
    if (sharingLock.current) return
    const target = captureRef.current
    if (!target) {
      error('Nothing to share yet')
      return
    }
    sharingLock.current = true
    setSharing(true)
    try {
      const blob = await captureElementAsImage(target)
      const result = await shareImageBlob(blob, 'tournament-leaderboard.png')
      if (result === 'copied') success('Leaderboard copied — paste anywhere')
      else if (result === 'shared') success('Shared!')
      else success('Leaderboard image downloaded')
    } catch (err) {
      // User dismissed the native share sheet — not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Image capture failed (e.g. unsupported browser) — fall back to text.
      try {
        const text = buildShareText(tournament.title, ranked, h2h, school ? schoolClassCount : undefined)
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ text })
        } else {
          await navigator.clipboard.writeText(text)
          success('Leaderboard copied to clipboard')
        }
      } catch {
        error(err instanceof Error ? err.message : 'Could not share leaderboard')
      }
    } finally {
      sharingLock.current = false
      setSharing(false)
    }
  }, [tournament.title, ranked, h2h, school, schoolClassCount, success, error])

  const isFinished = tournament.status === 'finished'

  return (
    <div className="glass-card p-5 space-y-3">
      {/* Everything inside captureRef becomes the shared image. */}
      <div ref={captureRef} className="space-y-3">
        <div className="text-center space-y-0.5">
          <p className="text-2xl leading-none">🏆</p>
          <p className="text-lg font-black gradient-title leading-tight">{tournament.title}</p>
          <p className="text-muted text-[10px] uppercase tracking-wider">
            {tournament.game_type ? `${gameTypeLabel(tournament.game_type)} · ` : ''}
            {isFinished ? 'Final Standings' : 'Leaderboard'}
            {tournament.target_game_count ? ` · Best of ${tournament.target_game_count}` : ''}
          </p>
        </div>
        {players.length === 0 ? (
          <p className="text-faint text-sm text-center">No players yet</p>
        ) : (
          <div className="space-y-2">
            {ranked.map((p, i) => (
              <div
                key={p.id}
                className={`result-row flex items-center justify-between px-4 py-2.5 ${
                  i === 0 ? 'result-row-winner-amber' : ''
                } ${p.is_eliminated ? 'opacity-50' : ''}`}
                style={
                  highlightPlayerId && p.id === highlightPlayerId
                    ? { boxShadow: 'inset 0 0 0 1px var(--primary)' }
                    : undefined
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-6 text-center text-base font-black tabular-nums shrink-0"
                    style={{ color: i < 3 ? RANK_COLOR[i] : 'var(--faint)' }}
                  >
                    {i < 3 ? MEDAL[i] : i + 1}
                  </span>
                  <span className="font-medium text-body truncate">{p.player_name}</span>
                  {p.lives_remaining != null && !p.is_eliminated && (
                    <span className="text-xs shrink-0">{'❤️'.repeat(Math.max(0, p.lives_remaining))}</span>
                  )}
                  {p.is_eliminated && <span className="text-xs text-red-400 ml-1 shrink-0">Eliminated</span>}
                </div>
                <div className="text-right shrink-0">
                  {school ? (
                    // School: no points — show the class each player reached (the top
                    // surviving class is crowned Champion once the tournament ends).
                    !p.is_eliminated && isFinished && i === 0 ? (
                      <span className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--primary)' }}>
                        Champion
                      </span>
                    ) : (
                      <span
                        className="chip text-[0.6875rem]"
                        style={
                          hasGraduated(p.school_level ?? 0, schoolClassCount) ? { color: 'var(--primary)' } : undefined
                        }
                      >
                        {schoolClassLabel(p.school_level ?? 0, schoolClassCount)}
                      </span>
                    )
                  ) : h2h ? (
                    // No points in a bracket — the champion is the lone survivor.
                    !p.is_eliminated &&
                    isFinished && (
                      <span className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--primary)' }}>
                        Champion
                      </span>
                    )
                  ) : (
                    <>
                      <span className="font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                        {p.total_points}
                        <span className="text-xs font-semibold">pts</span>
                      </span>
                      <span className="text-faint text-xs ml-2">{p.games_played}g</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {players.length > 0 && (
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
          </svg>
          {sharing ? 'Creating image…' : isFinished ? 'Share final results' : 'Share leaderboard'}
        </button>
      )}
    </div>
  )
}
