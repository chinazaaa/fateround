'use client'

import { checkOverallWinner, currentTurnPlayerId, markForPlayer, subBoardCells } from '@/lib/tic-tac-toe'
import type { Player, TicTacToeBoardResult, TicTacToeSession } from '@/types'
import { TicTacToeCard, TicTacToeTurnBar } from '@/components/tic-tac-toe/TicTacToeChrome'

function markGlyph(value: 'X' | 'O' | null): string {
  return value === 'X' ? '✕' : value === 'O' ? '○' : ''
}

function Cell({
  globalIndex,
  value,
  onClick,
  disabled,
  dim,
}: {
  globalIndex: number
  value: 'X' | 'O' | null
  onClick?: (index: number) => void
  disabled: boolean
  dim: boolean
}) {
  const clickable = !value && !disabled
  return (
    <button
      type="button"
      onClick={() => clickable && onClick?.(globalIndex)}
      disabled={!clickable}
      className={[
        'aspect-square rounded-md flex items-center justify-center text-base sm:text-xl font-black transition-colors',
        'bg-[var(--surface-inset-bg)]',
        clickable ? 'hover:bg-[var(--primary)]/15 cursor-pointer active:scale-[0.94]' : '',
        value === 'X' ? 'text-sky-500' : value === 'O' ? 'text-orange-500' : '',
        dim ? 'opacity-40' : '',
      ].join(' ')}
    >
      {markGlyph(value)}
    </button>
  )
}

function SubBoard({
  boardIndex,
  board,
  result,
  inPlay,
  highlightWin,
  disabled,
  onMove,
}: {
  boardIndex: number
  board: ('X' | 'O' | null)[]
  result: TicTacToeBoardResult
  inPlay: boolean
  highlightWin: boolean
  disabled: boolean
  onMove?: (index: number) => void
}) {
  const cells = subBoardCells(board, boardIndex)
  const decided = result != null

  return (
    <div
      className={[
        'relative rounded-xl border-2 p-1 sm:p-1.5 transition-colors',
        highlightWin
          ? 'border-amber-400 bg-amber-400/15'
          : inPlay
            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
            : 'border-[var(--border-strong)]',
      ].join(' ')}
    >
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {cells.map((value, pos) => (
          <Cell
            key={pos}
            globalIndex={boardIndex * 9 + pos}
            value={value}
            onClick={onMove}
            disabled={disabled || decided || !inPlay}
            dim={decided}
          />
        ))}
      </div>

      {decided && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--background)]/30">
          {result === 'draw' ? (
            <span className="text-2xl sm:text-3xl">🤝</span>
          ) : (
            <span
              className={[
                'text-5xl sm:text-6xl font-black drop-shadow',
                result === 'X' ? 'text-sky-500' : 'text-orange-500',
              ].join(' ')}
            >
              {markGlyph(result)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function TicTacToeGamePanel({
  session,
  players,
  myPlayerId,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
  onMove,
  acting,
}: {
  session: TicTacToeSession
  players: Player[]
  myPlayerId: string | null
  isMyTurn: boolean
  secondsLeft: number
  hasTimer: boolean
  urgent: boolean
  onMove?: (cellIndex: number) => void
  acting?: boolean
}) {
  const turnPlayerId = currentTurnPlayerId(session)
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const myMark = myPlayerId ? markForPlayer(session, myPlayerId) : null
  const board = session.board as ('X' | 'O' | null)[]
  const boardWinners = session.board_winners ?? []
  const overallWin = checkOverallWinner(boardWinners)
  const winLine = new Set(overallWin?.line ?? [])
  const winnerName = players.find((p) => p.id === session.winner_player_id)?.name
  const playerX = players.find((p) => p.id === session.player_x_id)
  const playerO = players.find((p) => p.id === session.player_o_id)

  const finished = session.status === 'finished'
  const activeBoard = session.active_board
  const boardInPlay = (boardIndex: number): boolean => {
    if (finished) return false
    if (boardWinners[boardIndex] != null) return false
    return activeBoard == null || activeBoard === boardIndex
  }

  const movesDisabled = !isMyTurn || !myMark || finished || !!acting

  return (
    <div className="space-y-4">
      {session.status === 'active' && (
        <TicTacToeTurnBar
          turnPlayerName={turnPlayer?.name}
          isMyTurn={isMyTurn}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      )}

      <TicTacToeCard className="p-3 flex items-center justify-between text-sm">
        <span className="font-bold text-sky-500">✕ {playerX?.name ?? 'Player 1'}</span>
        <span className="text-faint">vs</span>
        <span className="font-bold text-orange-500">○ {playerO?.name ?? 'Player 2'}</span>
      </TicTacToeCard>

      {finished && (
        <TicTacToeCard className="p-4 text-center space-y-1">
          <p className="text-2xl">{overallWin ? '🏆' : '🤝'}</p>
          <p className="text-lg font-black">{winnerName ? `${winnerName} wins!` : "It's a draw!"}</p>
        </TicTacToeCard>
      )}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 max-w-md mx-auto w-full">
        {Array.from({ length: 9 }, (_, boardIndex) => (
          <SubBoard
            key={boardIndex}
            boardIndex={boardIndex}
            board={board}
            result={boardWinners[boardIndex] ?? null}
            inPlay={boardInPlay(boardIndex)}
            highlightWin={winLine.has(boardIndex)}
            disabled={movesDisabled}
            onMove={onMove}
          />
        ))}
      </div>

      {myMark && session.status === 'active' && (
        <p className="text-center text-faint text-xs">
          You are <span className="font-bold">{myMark === 'X' ? '✕' : '○'}</span> ·{' '}
          {isMyTurn
            ? activeBoard == null
              ? 'play in any open board'
              : 'play in the highlighted board'
            : 'waiting for your opponent'}
        </p>
      )}
    </div>
  )
}
