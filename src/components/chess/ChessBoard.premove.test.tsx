// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Chess } from 'chess.js'
import { ChessGamePanel } from './ChessBoard'
import type { ChessSession, Player } from '@/types'

// The panel plays a turn cue via the Audio API, which jsdom doesn't implement.
vi.mock('@/lib/sounds', () => ({ playRoundStartSound: vi.fn() }))

const START_FEN = new Chess().fen()
const AFTER_E4_FEN = (() => {
  const c = new Chess()
  c.move('e4')
  return c.fen()
})()

const players = [
  { id: 'p-white', name: 'Wendy' },
  { id: 'p-black', name: 'Blake' },
] as unknown as Player[]

function makeSession(overrides: Partial<ChessSession> = {}): ChessSession {
  return {
    id: 's1',
    game_id: 'GAME',
    player_white_id: 'p-white',
    player_black_id: 'p-black',
    fen: START_FEN,
    pgn: '',
    current_turn: 'w',
    white_time_ms: null,
    black_time_ms: null,
    turn_started_at: null,
    last_move_from: null,
    last_move_to: null,
    in_check: false,
    status: 'active',
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: null,
    turn_deadline_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const square = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) })

// Black's view while White is on the move.
const blackProps = (onMove: (from: string, to: string, promotion?: string) => void) => ({
  session: makeSession(),
  players,
  myPlayerId: 'p-black',
  isMyTurn: false,
  onMove,
})

describe('ChessGamePanel premove', () => {
  it('queues a move off-turn and auto-plays it when the turn arrives', () => {
    const onMove = vi.fn()
    const { rerender } = render(<ChessGamePanel {...blackProps(onMove)} />)

    fireEvent.click(square('e7'))
    fireEvent.click(square('e5'))
    expect(screen.getByText(/premove e7→e5 queued/)).toBeInTheDocument()
    expect(onMove).not.toHaveBeenCalled()

    // White plays e4 — the session update flips the turn to Black.
    rerender(
      <ChessGamePanel
        {...blackProps(onMove)}
        session={makeSession({ fen: AFTER_E4_FEN, current_turn: 'b', last_move_from: 'e2', last_move_to: 'e4' })}
        isMyTurn
      />
    )
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('e7', 'e5', undefined)
  })

  it('drops a queued premove on a same-turn rollback instead of auto-firing it', () => {
    const onMove = vi.fn()
    // We queued a premove off-turn (our own move was still posting), then that move
    // failed and the parent rolled the board back: isMyTurn returns to true but the
    // row is the very one we queued against — same updated_at, no opponent move.
    const rolledBack = makeSession({ fen: AFTER_E4_FEN, current_turn: 'b', updated_at: '2024-01-01T00:00:00.000Z' })
    const { rerender } = render(<ChessGamePanel {...blackProps(onMove)} session={rolledBack} />)

    fireEvent.click(square('e7'))
    fireEvent.click(square('e5'))
    expect(screen.getByText(/premove e7→e5 queued/)).toBeInTheDocument()

    rerender(<ChessGamePanel {...blackProps(onMove)} session={rolledBack} isMyTurn />)
    // Even though e7→e5 is legal in this position, no genuinely newer row arrived, so
    // the premove is dropped rather than fired into the reverted board.
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.queryByText(/premove .* queued/)).not.toBeInTheDocument()
  })

  it('fires a queued premove once a genuinely newer row arrives', () => {
    const onMove = vi.fn()
    const queued = makeSession({ updated_at: '2024-01-01T00:00:00.000Z' })
    const { rerender } = render(<ChessGamePanel {...blackProps(onMove)} session={queued} />)

    fireEvent.click(square('e7'))
    fireEvent.click(square('e5'))

    // The opponent's real move: a new position carrying a strictly newer updated_at.
    rerender(
      <ChessGamePanel
        {...blackProps(onMove)}
        session={makeSession({
          fen: AFTER_E4_FEN,
          current_turn: 'b',
          last_move_from: 'e2',
          last_move_to: 'e4',
          updated_at: '2024-01-01T00:00:01.000Z',
        })}
        isMyTurn
      />
    )
    expect(onMove).toHaveBeenCalledWith('e7', 'e5', undefined)
  })

  it('silently drops a premove that is illegal in the position it fires on', () => {
    const onMove = vi.fn()
    const { rerender } = render(<ChessGamePanel {...blackProps(onMove)} />)

    // Bf8–b4 is a valid premove shape (sliders ignore blockers), but the e7
    // pawn still blocks the diagonal when the turn actually arrives.
    fireEvent.click(square('f8'))
    fireEvent.click(square('b4'))
    expect(screen.getByText(/premove f8→b4 queued/)).toBeInTheDocument()

    rerender(
      <ChessGamePanel
        {...blackProps(onMove)}
        session={makeSession({ fen: AFTER_E4_FEN, current_turn: 'b', last_move_from: 'e2', last_move_to: 'e4' })}
        isMyTurn
      />
    )
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.queryByText(/premove .* queued/)).not.toBeInTheDocument()
  })

  it('cancels a queued premove when the board is tapped', () => {
    const onMove = vi.fn()
    render(<ChessGamePanel {...blackProps(onMove)} />)

    fireEvent.click(square('g8'))
    fireEvent.click(square('f6'))
    expect(screen.getByText(/premove g8→f6 queued/)).toBeInTheDocument()

    fireEvent.click(square('a1'))
    expect(screen.queryByText(/premove .* queued/)).not.toBeInTheDocument()
    expect(screen.getByText(/tap a piece to queue a premove/)).toBeInTheDocument()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does not offer premoves to viewers or when the game is over', () => {
    const onMove = vi.fn()
    // Viewer: no onMove handler at all.
    const { rerender } = render(
      <ChessGamePanel session={makeSession()} players={players} myPlayerId={null} isMyTurn={false} />
    )
    expect(square('e7')).toBeDisabled()

    // Finished game: handler present but the board is inert.
    rerender(<ChessGamePanel {...blackProps(onMove)} session={makeSession({ status: 'finished' })} />)
    expect(square('e7')).toBeDisabled()
  })
})
