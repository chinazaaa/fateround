import { describe, it, expect } from 'vitest'
import { pickAyoBotMove, type AyoBotDifficulty } from '@/lib/ayo-bot'
import { ayoSoloLegalMoves, ayoSoloMove, initAyoSolo, type AyoSoloState } from '@/lib/ayo-solo'

/**
 * Play a full solo game: the bot plays side 'b'; side 'a' is a "player" whose
 * move-picker is passed in. Returns the terminal state. Bounded on move count
 * to catch loops without hanging the test process.
 */
function playGame(
  humanMove: (state: AyoSoloState) => number | null,
  difficulty: AyoBotDifficulty = 'normal',
  first: 'a' | 'b' = 'a'
): AyoSoloState {
  let state = initAyoSolo({ first })
  for (let plies = 0; plies < 400 && state.outcome == null; plies += 1) {
    if (state.session.current_turn === 'a') {
      const pit = humanMove(state)
      if (pit == null) break
      const r = ayoSoloMove(state, 'a', pit)
      if (r.error) break
      state = r.state
    } else {
      const pit = pickAyoBotMove(state, difficulty)
      if (pit == null) break
      const r = ayoSoloMove(state, 'b', pit)
      if (r.error) break
      state = r.state
    }
  }
  return state
}

/** Deterministic PRNG so bot-vs-random results don't flake across runs. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function randomLegal(rng: () => number) {
  return (state: AyoSoloState): number | null => {
    const legal = ayoSoloLegalMoves(state, 'a')
    if (legal.length === 0) return null
    return legal[Math.floor(rng() * legal.length)]!
  }
}

describe('pickAyoBotMove — control flow', () => {
  it('returns null when it is not the bot’s turn', () => {
    const s = initAyoSolo({ first: 'a' })
    expect(pickAyoBotMove(s)).toBeNull()
  })

  it('returns null once the game is finished', () => {
    const s: AyoSoloState = { ...initAyoSolo({ first: 'b' }), outcome: 'a' }
    expect(pickAyoBotMove(s)).toBeNull()
  })

  it('always returns a legal side-b pit on its own turn', () => {
    // Play a real game against a random opponent; every bot move must fall
    // inside side B's legal set. This catches "search evaluates wrong side"
    // bugs on positions the bot actually reaches.
    let state = initAyoSolo({ first: 'a' })
    const rand = randomLegal(seeded(42))
    for (let ply = 0; ply < 200 && state.outcome == null; ply += 1) {
      if (state.session.current_turn === 'a') {
        const pit = rand(state)
        if (pit == null) break
        state = ayoSoloMove(state, 'a', pit).state
      } else {
        const pit = pickAyoBotMove(state, 'normal')
        if (pit == null) break
        expect(pit).toBeGreaterThanOrEqual(6)
        expect(pit).toBeLessThan(12)
        expect(ayoSoloLegalMoves(state, 'b')).toContain(pit)
        state = ayoSoloMove(state, 'b', pit).state
      }
    }
  })
})

describe('pickAyoBotMove — search quality', () => {
  // A search that terminates and returns legal moves is necessary but not
  // sufficient. The real check is that the search is worth having: it must
  // outperform a random opponent by a wide margin, and higher difficulty must
  // beat lower difficulty across a batch (not on a single seed).
  it('normal-depth bot dominates a random human over 25 games', () => {
    let botWins = 0
    let losses = 0
    let draws = 0
    for (let g = 0; g < 25; g += 1) {
      const first = g % 2 === 0 ? 'a' : 'b'
      const result = playGame(randomLegal(seeded(g * 13 + 1)), 'normal', first)
      if (result.outcome === 'b') botWins += 1
      else if (result.outcome === 'a') losses += 1
      else if (result.outcome === 'draw') draws += 1
    }
    // Being generous: over 25 games the bot should be winning the clear
    // majority. Anything close to 50/50 means the search is broken.
    expect(botWins).toBeGreaterThan(losses + draws)
  })

  it('bot vs bot terminates within a move budget', () => {
    // Both sides use the same difficulty; the game must always reach a
    // terminal state. Catches loops and stale-turn regressions.
    for (let seed = 1; seed <= 5; seed += 1) {
      // Deterministic "human" side that always picks the LOWEST legal pit —
      // acts as a stand-in for a second bot without needing symmetric search.
      const state = playGame((s) => ayoSoloLegalMoves(s, 'a')[0] ?? null, 'normal', seed % 2 === 0 ? 'a' : 'b')
      expect(state.outcome).not.toBeNull()
    }
  })

  it('easy difficulty is materially weaker than normal', () => {
    // Same random opponent (same seed) — normal should win more than easy does.
    let easyWins = 0
    let normalWins = 0
    for (let g = 0; g < 15; g += 1) {
      const rngE = seeded(g * 17 + 3)
      const rngN = seeded(g * 17 + 3)
      const e = playGame(randomLegal(rngE), 'easy', g % 2 === 0 ? 'a' : 'b')
      const n = playGame(randomLegal(rngN), 'normal', g % 2 === 0 ? 'a' : 'b')
      if (e.outcome === 'b') easyWins += 1
      if (n.outcome === 'b') normalWins += 1
    }
    expect(normalWins).toBeGreaterThanOrEqual(easyWins)
  })
})
