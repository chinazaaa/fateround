'use client'

import type { TournamentGame } from '@/types/tournament'

interface TournamentBracketBoardProps {
  /** Matches for the round to display (current round). */
  matches: TournamentGame[]
  roundNumber: number
  roundLabel: string
  /** Resolve a tournament player's id to their display name. */
  nameOf: (id: string | null) => string
  /** Optional secondary label under each player (e.g. their School class). */
  subOf?: (id: string | null) => string
  /** Whether a player has been removed/eliminated from the tournament — shown as
   *  "Removed" on the tile (dimmed, no presence dot, not removable) so a member the
   *  host already took out isn't still listed as if the room is waiting on them. */
  isEliminated?: (id: string | null) => boolean
  /** Open a match room as a viewer. */
  onWatch: (gameId: string) => void
  /** Host only: remove a player from a not-yet-decided match (e.g. a no-show).
   *  The opponent then walks over. Omit to hide the remove controls. */
  onRemovePlayer?: (playerId: string) => void
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
  subOf,
  isEliminated,
  onWatch,
  onRemovePlayer,
}: TournamentBracketBoardProps) {
  if (matches.length === 0) return null

  let gameNo = 0

  const RemoveBtn = ({ id }: { id: string | null }) =>
    onRemovePlayer && id ? (
      <button
        type="button"
        onClick={() => onRemovePlayer(id)}
        title={`Remove ${nameOf(id)}`}
        aria-label={`Remove ${nameOf(id)}`}
        className="shrink-0 rounded px-1 text-xs text-faint transition-colors hover:text-red-500"
      >
        ✕
      </button>
    ) : null

  return (
    <div className="glass-card p-5 space-y-3">
      <p className="label-caps">
        Round {roundNumber} · {roundLabel}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {matches.map((m) => {
          const isBye = m.is_bye
          if (!isBye) gameNo++
          // Group room (Whot/Scrabble) vs 1v1 duel (chess): a room lists all its
          // seated members; a duel is the classic A-vs-B pair.
          const memberIds = m.member_ids?.length
            ? m.member_ids
            : [m.player_a_id, m.player_b_id].filter((id): id is string => Boolean(id))
          // Any match carrying member_ids is a group room (even a 2-member remainder
          // room, or one down to 2 after removals) — so it labels as "Room", not a duel.
          const isRoom = Boolean(m.member_ids?.length)
          const canWatch = !isBye && Boolean(m.game_id) && (m.status === 'active' || m.status === 'finished')
          // Before a room goes final, show who's actually in it — a green dot for
          // members who've joined to play, a hollow one for those still on their way.
          const showPresence = !isBye && Boolean(m.game_id) && m.status !== 'finished'
          const joinedIds = new Set(m.joined_member_ids ?? [])

          return (
            <div key={m.id} className="surface-inset p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-faint">{isBye ? 'Bye' : `${isRoom ? 'Room' : 'Game'} ${gameNo}`}</span>
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
                  {memberIds.map((pid, i) => {
                    const won = m.winner_player_id != null && m.winner_player_id === pid
                    const joined = joinedIds.has(pid)
                    // A member the host already removed stays in the room's member_ids,
                    // but shouldn't read as "waiting" — the room no longer needs them.
                    const removed = isEliminated?.(pid) === true
                    return (
                      <div key={pid}>
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-sm flex items-center gap-1.5 ${removed ? 'text-faint line-through' : won ? 'font-bold text-body' : 'text-body'}`}
                          >
                            {showPresence && !removed && (
                              <span
                                title={joined ? 'In the room' : 'Not in the room yet'}
                                aria-label={joined ? 'In the room' : 'Not in the room yet'}
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={
                                  joined
                                    ? { background: 'var(--primary)' }
                                    : { border: '1px solid var(--faint)', background: 'transparent' }
                                }
                              />
                            )}
                            {won && <span aria-hidden="true">✓ </span>}
                            {nameOf(pid)}
                            {subOf?.(pid) ? (
                              <span className="ml-1.5 text-[0.6875rem] font-normal text-faint no-underline">
                                {subOf(pid)}
                              </span>
                            ) : null}
                            {removed ? (
                              <span className="ml-1 text-[0.6875rem] font-normal text-red-400 no-underline">
                                Removed
                              </span>
                            ) : (
                              showPresence &&
                              !joined && <span className="ml-1 text-[0.6875rem] font-normal text-faint">waiting…</span>
                            )}
                          </p>
                          {m.status !== 'finished' && !removed && <RemoveBtn id={pid} />}
                        </div>
                        {/* Only a duel gets the "vs" divider; a room is just a list. */}
                        {!isRoom && memberIds.length === 2 && i === 0 && (
                          <p className="text-[0.625rem] text-faint uppercase tracking-wide">vs</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {canWatch && (
                <button onClick={() => onWatch(m.game_id!)} className="btn-secondary w-full text-sm">
                  {m.status === 'active' ? '👁 Watch live' : 'View final board'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
