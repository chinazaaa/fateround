import { describe, it, expect } from 'vitest'
import { pickLudoBotMove } from '@/lib/ludo-bot'
import type { LudoMoveOption } from '@/lib/ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

const BOT = 'bot'

function botState(color: LudoColor = 'blue', pieces: LudoPiece[] = []): LudoPlayerState {
  return {
    id: 'state-bot',
    game_id: 'solo',
    player_id: BOT,
    color,
    pieces,
    player_order: 1,
    created_at: '',
  }
}

function move(overrides: Partial<LudoMoveOption> & Pick<LudoMoveOption, 'pieceId' | 'from' | 'to'>): LudoMoveOption {
  return {
    diceIndex: 0,
    diceValue: 3,
    captures: false,
    ...overrides,
  }
}

const base = (id: number): LudoPiece => ({ id, zone: 'base', pos: 0 })
const track = (id: number, pos: number): LudoPiece => ({ id, zone: 'track', pos })
const home = (id: number, pos: number): LudoPiece => ({ id, zone: 'home', pos })
const finished = (id: number): LudoPiece => ({ id, zone: 'finished', pos: 0 })

// ── Priority: capture > everything else ────────────────────────────────────

describe('pickLudoBotMove — capture priority', () => {
  it('always picks a capture over a non-capture, even when the non-capture progresses further', () => {
    const capMove = move({
      pieceId: 0,
      from: track(0, 5),
      to: track(0, 8),
      diceValue: 3,
      captures: true,
    })
    const progressMove = move({
      pieceId: 1,
      from: track(1, 20),
      to: track(1, 26),
      diceValue: 6,
      captures: false,
    })
    const picked = pickLudoBotMove([progressMove, capMove], botState())
    expect(picked?.pieceId).toBe(0)
    expect(picked?.captures).toBe(true)
  })
})

// ── Priority: finish > home-lane > bring-out > progress ────────────────────

describe('pickLudoBotMove — non-capture priorities', () => {
  it('prefers landing a piece on the FINISHED zone over any other move', () => {
    const finishMove = move({
      pieceId: 0,
      from: home(0, 4),
      to: finished(0),
      diceValue: 1,
    })
    const bringOut = move({
      pieceId: 1,
      from: base(1),
      to: track(1, 26),
      diceValue: 6,
    })
    const picked = pickLudoBotMove([bringOut, finishMove], botState())
    expect(picked?.pieceId).toBe(0)
  })

  it('prefers entering the home lane over a same-length track advance', () => {
    const enterHome = move({
      pieceId: 0,
      from: track(0, 25),
      to: home(0, 0),
      diceValue: 4,
    })
    const trackAdvance = move({
      pieceId: 1,
      from: track(1, 10),
      to: track(1, 14),
      diceValue: 4,
    })
    const picked = pickLudoBotMove([trackAdvance, enterHome], botState())
    expect(picked?.pieceId).toBe(0)
  })

  it('prefers bringing a piece out of base over a small track step (when nothing else scores)', () => {
    const bringOut = move({
      pieceId: 0,
      from: base(0),
      to: track(0, 26),
      diceValue: 6,
    })
    const smallStep = move({
      pieceId: 1,
      from: track(1, 3),
      to: track(1, 4),
      diceValue: 1,
    })
    const picked = pickLudoBotMove([bringOut, smallStep], botState())
    expect(picked?.pieceId).toBe(0)
  })

  it('when nothing scores, advances the leader — piece currently furthest along', () => {
    // Both moves are the same diceValue and neither captures/finishes/enters
    // home lane. Furthest-progress wins. Using green (START_POS = 0) so
    // track-position directly = steps-from-start; no modular gotchas.
    const laggard = move({
      pieceId: 0,
      from: track(0, 5),
      to: track(0, 8),
      diceValue: 3,
    })
    const leader = move({
      pieceId: 1,
      from: track(1, 40),
      to: track(1, 43),
      diceValue: 3,
    })
    const picked = pickLudoBotMove([laggard, leader], botState('green'))
    expect(picked?.pieceId).toBe(1)
  })
})

// ── Multi-capture beats single-capture via progress tiebreak ────────────────

describe('pickLudoBotMove — tiebreaks', () => {
  it('among two captures at the same score band, prefers the one from the further-along piece', () => {
    const capFromLaggard = move({
      pieceId: 0,
      from: track(0, 5),
      to: track(0, 8),
      diceValue: 3,
      captures: true,
    })
    const capFromLeader = move({
      pieceId: 1,
      from: track(1, 40),
      to: track(1, 43),
      diceValue: 3,
      captures: true,
    })
    const picked = pickLudoBotMove([capFromLaggard, capFromLeader], botState('green'))
    expect(picked?.pieceId).toBe(1)
  })
})

// ── Empty legal-moves list ─────────────────────────────────────────────────

describe('pickLudoBotMove — no moves', () => {
  it('returns null when the legal-moves list is empty', () => {
    expect(pickLudoBotMove([], botState())).toBeNull()
  })
})
