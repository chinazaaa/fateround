'use client'

import { useCallback, useRef, useState } from 'react'
import type { Tournament, TournamentPlayer } from '@/types/tournament'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob } from '@/lib/share-image'
import { appDomain } from '@/lib/site'
import { useToast } from '@/components/ui/Toast'

const MEDAL = ['🥇', '🥈', '🥉']
const RANK_COLOR = ['var(--marry)', '#64748b', '#b45309']

/** Plain-text fallback when image capture/share isn't available. */
function buildShareText(title: string, players: TournamentPlayer[]): string {
  const lines = [`🏆 ${title}`, '', 'Leaderboard:']
  players.slice(0, 8).forEach((p, i) => {
    const rank = i < 3 ? MEDAL[i] : `${i + 1}.`
    lines.push(`${rank} ${p.player_name} — ${p.total_points} pts`)
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
}: {
  tournament: Tournament
  players: TournamentPlayer[]
}) {
  const { success, error } = useToast()
  const captureRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const sharingLock = useRef(false)

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
        const text = buildShareText(tournament.title, players)
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
  }, [tournament.title, players, success, error])

  const isFinished = tournament.status === 'finished'

  return (
    <div className="glass-card p-5 space-y-3">
      {/* Everything inside captureRef becomes the shared image. */}
      <div ref={captureRef} className="space-y-3">
        <div className="text-center space-y-0.5">
          <p className="text-2xl leading-none">🏆</p>
          <p className="text-lg font-black gradient-title leading-tight">{tournament.title}</p>
          <p className="text-muted text-[10px] uppercase tracking-wider">
            {isFinished ? 'Final Standings' : 'Leaderboard'}
            {tournament.target_game_count ? ` · Best of ${tournament.target_game_count}` : ''}
          </p>
        </div>
        {players.length === 0 ? (
          <p className="text-faint text-sm text-center">No players yet</p>
        ) : (
          <div className="space-y-2">
            {players.map((p, i) => (
              <div
                key={p.id}
                className={`result-row flex items-center justify-between px-4 py-2.5 ${
                  i === 0 ? 'result-row-winner-amber' : ''
                } ${p.is_eliminated ? 'opacity-50' : ''}`}
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
                  <span className="font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                    {p.total_points}
                    <span className="text-xs font-semibold">pts</span>
                  </span>
                  <span className="text-faint text-xs ml-2">{p.games_played}g</span>
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
