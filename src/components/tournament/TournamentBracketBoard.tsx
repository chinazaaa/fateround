'use client'

import type { TournamentGame } from '@/types/tournament'

interface TournamentBracketBoardProps {
  /** Matches for the round to display (current round). */
  matches: TournamentGame[]
  roundNumber: number
  roundLabel: string
  /** Resolve a tournament player's id to their display name. */
  nameOf: (id: string | null) => string
  /** Open a match room as a viewer. */
  onWatch: (gameId: string) => void
}

/**
 * Spectator's view of a head-to-head round: a tile per match (plus byes) showing
 * the pairing and live status, with a Watch button for live or finished games.
 * Clicking Watch opens the match room as a viewer; the game page's "Back to
 * Tournament" banner returns here, so the board doubles as the game switcher.
 */
export function TournamentBracketBoard({
  matches,
  roundNumber,
  roundLabel,
  nameOf,
  onWatch,
}: TournamentBracketBoardProps) {
  if (matches.length === 0) return null

  let gameNo = 0

  return (
    <div className="glass-card p-5 space-y-3">
      <p className="label-caps">
        Round {roundNumber} · {roundLabel}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {matches.map((m) => {
          const isBye = m.is_bye
          if (!isBye) gameNo++
          const aWon = m.winner_player_id != null && m.winner_player_id === m.player_a_id
          const bWon = m.winner_player_id != null && m.winner_player_id === m.player_b_id
          const canWatch = !isBye && Boolean(m.game_id) && (m.status === 'active' || m.status === 'finished')

          return (
            <div key={m.id} className="surface-inset p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-faint">{isBye ? 'Bye' : `Game ${gameNo}`}</span>
                {isBye ? (
                  <span className="chip text-[0.6875rem]">Advances</span>
                ) : m.status === 'active' ? (
                  <span
                    className="text-[0.6875rem] font-semibold flex items-center gap-1.5"
                    style={{ color: 'var(--primary)' }}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span
                        className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                        style={{ background: 'var(--primary)' }}
                      />
                      <span
                        className="relative inline-flex h-1.5 w-1.5 rounded-full"
                        style={{ background: 'var(--primary)' }}
                      />
                    </span>
                    Live
                  </span>
                ) : m.status === 'finished' ? (
                  <span className="chip text-[0.6875rem]">Final</span>
                ) : (
                  <span className="text-[0.6875rem] text-faint">Waiting</span>
                )}
              </div>

              {isBye ? (
                <p className="text-sm font-medium text-body">{nameOf(m.player_a_id)}</p>
              ) : (
                <div className="space-y-0.5">
                  <p className={`text-sm ${aWon ? 'font-bold text-body' : 'text-body'}`}>
                    {aWon && <span aria-hidden="true">✓ </span>}
                    {nameOf(m.player_a_id)}
                  </p>
                  <p className="text-[0.625rem] text-faint uppercase tracking-wide">vs</p>
                  <p className={`text-sm ${bWon ? 'font-bold text-body' : 'text-body'}`}>
                    {bWon && <span aria-hidden="true">✓ </span>}
                    {nameOf(m.player_b_id)}
                  </p>
                </div>
              )}

              {canWatch && (
                <button onClick={() => onWatch(m.game_id!)} className="btn-secondary w-full text-sm">
                  {m.status === 'active' ? '👁 Watch live' : 'View result'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
