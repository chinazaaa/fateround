'use client'

import { CodewordsBoardGrid } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsScoreboard } from '@/components/codewords/CodewordsScoreboard'
import { guessAttributionMap, waitingTurnMessage } from '@/lib/codewords'
import type { CodewordsBoard, CodewordsGuess, CodewordsPlayerRole, Player } from '@/types'

/**
 * Read-only live board for a host-only (spectator) host, or a host + play host who is not
 * on a team yet. Lives in the Watch tab — the Manage tab never renders a board.
 *
 * The key card is NOT revealed here: a spectating host should watch the game like anyone
 * else, not see the secret assignment. A spymaster sees the key through CodewordsActiveRound
 * instead (their role gates it there). Everyone learns the whole key on the finish screen,
 * which is a different code path.
 */
export function CodewordsSpectatorBoard({
  board,
  players,
  roles,
  guesses,
}: {
  board: CodewordsBoard
  players: Player[]
  roles: CodewordsPlayerRole[]
  guesses: CodewordsGuess[]
}) {
  const playerNameById = new Map(players.map((p) => [p.id, p.name]))
  const cellAttribution = guessAttributionMap(guesses, playerNameById)
  const turnStatus = waitingTurnMessage(board, roles, playerNameById)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
      <div className="glass-card p-4 space-y-3">
        <p className="label-caps">Live board (host view)</p>
        <p className="text-center text-sm text-muted">{turnStatus}</p>
        {board.current_clue_word && (
          <p className="text-center text-sm">
            Clue: <strong>{board.current_clue_word}</strong> {board.current_clue_number}
          </p>
        )}
        <CodewordsBoardGrid board={board} cellAttribution={cellAttribution} />
      </div>
      <aside className="space-y-3">
        <CodewordsScoreboard board={board} players={players} roles={roles} />
      </aside>
    </div>
  )
}
