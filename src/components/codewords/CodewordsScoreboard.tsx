'use client'

import { countRevealedTeamCells, countTeamCells, roleLabel, teamLabel } from '@/lib/codewords'
import { CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import type { CodewordsBoard, CodewordsPlayerRole, Player } from '@/types'

export function CodewordsScoreboard({
  board,
  players,
  roles,
  highlightPlayerId,
}: {
  board: CodewordsBoard
  players: Player[]
  roles: CodewordsPlayerRole[]
  highlightPlayerId?: string | null
}) {
  // Operatives hold a MASKED key (null at unrevealed indices), so counting it would under-report
  // the totals — prefer the explicit counts the API sends. Spymasters/host have the real key and
  // either path agrees. See audit finding H2.
  const redTotal = board.key_totals?.red ?? countTeamCells(board.key, 'red')
  const blueTotal = board.key_totals?.blue ?? countTeamCells(board.key, 'blue')
  const redFound = countRevealedTeamCells(board.key, board.revealed_indices, 'red')
  const blueFound = countRevealedTeamCells(board.key, board.revealed_indices, 'blue')
  const redLeft = redTotal - redFound
  const blueLeft = blueTotal - blueFound

  const teamPlayers = (team: 'red' | 'blue') =>
    roles
      .filter((r) => r.team === team)
      .map((r) => {
        const player = players.find((p) => p.id === r.player_id)
        return player ? { ...r, name: player.name } : null
      })
      .filter(Boolean) as (CodewordsPlayerRole & { name: string })[]

  return (
    <div className="glass-card p-4 space-y-4">
      <p className="label-caps">Scoreboard</p>

      <div className="space-y-3">
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CodewordsTeamBadge team="red" />
            <span className="text-sm font-black text-red-800 dark:text-red-100">{redLeft} left</span>
          </div>
          <div className="h-2 rounded-full bg-red-950/10 dark:bg-red-950/30 overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${redTotal > 0 ? (redFound / redTotal) * 100 : 0}%` }}
            />
          </div>
          <p className="text-faint text-xs">
            {redFound}/{redTotal} found
          </p>
          <ul className="space-y-1">
            {teamPlayers('red').map((r) => (
              <li
                key={r.player_id}
                className={[
                  'text-xs font-medium',
                  r.player_id === highlightPlayerId ? 'text-red-900 dark:text-red-100' : 'text-muted',
                ].join(' ')}
              >
                {r.name} · {roleLabel(r.role)}
                {board.current_turn === 'red' && r.player_id === highlightPlayerId ? ' · your turn' : ''}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CodewordsTeamBadge team="blue" />
            <span className="text-sm font-black text-blue-800 dark:text-blue-100">{blueLeft} left</span>
          </div>
          <div className="h-2 rounded-full bg-blue-950/10 dark:bg-blue-950/30 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${blueTotal > 0 ? (blueFound / blueTotal) * 100 : 0}%` }}
            />
          </div>
          <p className="text-faint text-xs">
            {blueFound}/{blueTotal} found
          </p>
          <ul className="space-y-1">
            {teamPlayers('blue').map((r) => (
              <li
                key={r.player_id}
                className={[
                  'text-xs font-medium',
                  r.player_id === highlightPlayerId ? 'text-blue-900 dark:text-blue-100' : 'text-muted',
                ].join(' ')}
              >
                {r.name} · {roleLabel(r.role)}
                {board.current_turn === 'blue' && r.player_id === highlightPlayerId ? ' · your turn' : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {board.winner && (
        <p className="text-center text-sm font-bold text-amber-600 dark:text-amber-200">
          {teamLabel(board.winner)} wins!
        </p>
      )}
    </div>
  )
}

export function CodewordsTimerBar({
  label,
  secondsLeft,
  urgent = false,
}: {
  label: string
  secondsLeft: number
  urgent?: boolean
}) {
  return (
    <div
      className={[
        'glass-card p-3 text-center border',
        urgent ? 'border-amber-500/50' : 'border-[var(--border-strong)]',
      ].join(' ')}
    >
      <p className="text-faint text-xs uppercase tracking-wider">{label}</p>
      <p className={['text-2xl font-black tabular-nums', urgent ? 'text-amber-600 dark:text-amber-200' : ''].join(' ')}>
        {secondsLeft}s
      </p>
    </div>
  )
}
