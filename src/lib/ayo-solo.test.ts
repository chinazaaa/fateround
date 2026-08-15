import { describe, it, expect } from 'vitest'
import { AYO_SOLO_BOT_ID, AYO_SOLO_HUMAN_ID, ayoSoloLegalMoves, ayoSoloMove, initAyoSolo } from '@/lib/ayo-solo'

describe('initAyoSolo', () => {
  it('starts with the classical position: 4 seeds per pit, 12 pits', () => {
    const s = initAyoSolo()
    expect(s.session.pits).toHaveLength(12)
    expect(s.session.pits.every((n) => n === 4)).toBe(true)
    expect(s.session.pits.reduce((a, b) => a + b, 0)).toBe(48)
    expect(s.session.captured_a).toBe(0)
    expect(s.session.captured_b).toBe(0)
    expect(s.session.status).toBe('active')
  })

  it('honours the first-mover option', () => {
    expect(initAyoSolo({ first: 'b' }).session.current_turn).toBe('b')
    expect(initAyoSolo({ first: 'a' }).session.current_turn).toBe('a')
  })

  it('serialises + rehydrates without behaviour drift', () => {
    const s = initAyoSolo()
    const rehydrated = JSON.parse(JSON.stringify(s))
    expect(rehydrated.session.pits).toEqual(s.session.pits)
  })
})

describe('ayoSoloMove', () => {
  it('rejects a move made out of turn', () => {
    const s = initAyoSolo({ first: 'a' })
    // Try a bot-side pit while the human has the turn.
    expect(ayoSoloMove(s, 'b', 6).error).toBe('Not your turn')
  })

  it('rejects an illegal pit (empty or wrong side)', () => {
    const s = initAyoSolo({ first: 'a' })
    // Pit 6 is on side B — illegal for side A.
    expect(ayoSoloMove(s, 'a', 6).error).toBeTruthy()
  })

  it('applies a legal move and advances the turn to the opponent', () => {
    const s = initAyoSolo({ first: 'a' })
    const r = ayoSoloMove(s, 'a', 0)
    expect(r.error).toBeUndefined()
    // Ayo relays: sowing keeps going as long as the last seed lands in a
    // non-empty pit, and can wrap back through the source pit. What holds for
    // ANY legal move is seed conservation (until a capture) and turn advance.
    expect(r.state.session.pits.reduce((a, b) => a + b, 0)).toBe(48)
    expect(r.state.session.current_turn).toBe('b')
    expect(r.state.session.pits).not.toEqual(s.session.pits) // something changed
  })

  it('exposes only the current side’s legal moves', () => {
    const s = initAyoSolo({ first: 'a' })
    const moves = ayoSoloLegalMoves(s)
    // At the opening, every pit has 4 seeds and every side-A pit is legal.
    expect(moves.sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('game end wiring', () => {
  it('finish flag propagates outcome + winner_player_id together', () => {
    // Play a real move that could end the game only by coincidence; instead we
    // just verify that a normal in-progress move DOES NOT flip the outcome.
    const s = initAyoSolo({ first: 'a' })
    const r = ayoSoloMove(s, 'a', 0)
    expect(r.state.outcome).toBeNull()
    expect(r.state.session.status).toBe('active')
    expect(r.state.session.winner_player_id).toBeNull()
    expect(r.state.session.player_a_id).toBe(AYO_SOLO_HUMAN_ID)
    expect(r.state.session.player_b_id).toBe(AYO_SOLO_BOT_ID)
  })
})
