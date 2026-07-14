import { useMemo } from 'react'
import type { Player, ScrabblePlayerState, ScrabbleSession } from '@fateround/shared'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { DeadlineTimerBadge } from '@/components/ui/DeadlineTimerBadge'
import { ScrabbleScoreboard, type ScrabbleScoreRow } from '@/components/games/scrabble/ScrabbleScoreboard'
import { formatScrabbleClock, useScrabbleChessClock } from '@/components/games/scrabble/useScrabbleChessClock'

const NOOP = () => {}

/**
 * Active-turn timer badge for Scrabble. Owns BOTH clock sources internally — the
 * chess-clock tick (via {@link useScrabbleChessClock}) and the standard absolute
 * turn deadline — so the heavy board/rack parent no longer re-renders at 4Hz just
 * to advance a countdown (M1). Fires `onChessExpire` when the active bank hits
 * zero in chess mode; the standard-clock expiry is handled by the parent's
 * reconnect effect. Renders nothing when there is no live countdown.
 */
export function ScrabbleTurnBadge({
  session,
  playerStates,
  onChessExpire,
}: {
  session: ScrabbleSession | null
  playerStates: ScrabblePlayerState[]
  onChessExpire: () => void
}) {
  const isChess = session?.clock_mode === 'chess'
  const chess = useScrabbleChessClock(session, playerStates, onChessExpire)
  const standardActive = session?.clock_mode === 'standard' && session?.phase === 'playing'

  if (isChess) {
    return chess.activeSecondsLeft > 0 ? (
      <TimerBadge seconds={chess.activeSecondsLeft} urgentAt={15} />
    ) : null
  }
  return <DeadlineTimerBadge deadlineAt={session?.turn_deadline_at} active={!!standardActive} />
}

/**
 * Live scoreboard for Scrabble. In chess-clock mode it owns its own clock tick so
 * each seat's time bank stays current without re-rendering the parent board; the
 * onExpire is a no-op here ({@link ScrabbleTurnBadge} owns the authoritative one).
 * In standard mode the clock is inert and this never ticks.
 */
export function ScrabbleLiveScoreboard({
  session,
  playerStates,
  players,
  myPlayerId,
  turnPlayerId,
}: {
  session: ScrabbleSession | null
  playerStates: ScrabblePlayerState[]
  players: Player[]
  myPlayerId: string | null
  turnPlayerId: string | null
}) {
  const chess = useScrabbleChessClock(session, playerStates, NOOP)
  const isChess = chess.isChess

  const scoreRows = useMemo<ScrabbleScoreRow[]>(
    () =>
      playerStates
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((s) => {
          // In chess-clock mode surface each player's live time bank next to their score
          // (mirrors web BoardScores clockLabel). Timed-out seats are struck through.
          const clockText =
            isChess && !s.timed_out
              ? formatScrabbleClock(chess.clocksByPlayer.get(s.player_id) ?? (s.clock_ms_remaining ?? 0) / 1000)
              : null
          return {
            id: s.player_id,
            name: players.find((p) => p.id === s.player_id)?.name ?? 'Player',
            score: s.score,
            isTurn: s.player_id === turnPlayerId,
            isMe: s.player_id === myPlayerId,
            timedOut: !!s.timed_out,
            clockText,
          }
        }),
    [playerStates, players, myPlayerId, isChess, chess.clocksByPlayer, turnPlayerId]
  )

  return <ScrabbleScoreboard rows={scoreRows} />
}
