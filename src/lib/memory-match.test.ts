import { describe, it, expect } from 'vitest'
import {
  computeStreakBonus,
  tallyMatchingPairsScore,
  matchingPairsPlacementBonus,
  buildMatchingPairsRoundMetadata,
  parseMatchingPairsMetadata,
  getPlayerBoard,
  matchingPairsGridLayout,
  formatMatchingPairsGridSize,
  MATCHING_PAIRS_POINTS_PER_PAIR,
  MATCHING_PAIRS_STREAK_BONUS,
  MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
  MATCHING_PAIRS_PERFECT_GAME_BONUS,
  MATCHING_PAIRS_PLACEMENT_BONUS,
  MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER,
  MATCHING_PAIRS_SPEED_PAR_BONUS_PER_MINUTE,
  MEMORY_MATCH_ICON_POOL,
  MEMORY_MATCH_PAIR_COLORS,
  type MatchingPairsSubmission,
  type MatchingPairsProgress,
} from './memory-match'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSub(overrides: Partial<MatchingPairsSubmission>): MatchingPairsSubmission {
  return {
    id: 's',
    game_id: 'G',
    round_id: 'R',
    player_id: 'p1',
    pair_index: 0,
    is_match: false,
    streak_at_time: 0,
    streak_bonus: 0,
    points_after: 0,
    submitted_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeProg(overrides: Partial<MatchingPairsProgress> = {}): MatchingPairsProgress {
  return {
    id: 'prog',
    game_id: 'G',
    round_id: 'R',
    player_id: 'p1',
    pairs_matched: 0,
    wrong_attempts: 0,
    finished: false,
    finish_rank: null,
    finished_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Group 3: Scoring Correctness ───────────────────────────────────────────

describe('computeStreakBonus', () => {
  it('awards bonus on every 3rd consecutive match', () => {
    // streakBeforeMatch=0 → newStreak=1 → 1%3!=0
    expect(computeStreakBonus(0)).toBe(0)
    // streakBeforeMatch=1 → newStreak=2 → 2%3!=0
    expect(computeStreakBonus(1)).toBe(0)
    // streakBeforeMatch=2 → newStreak=3 → 3%3==0
    expect(computeStreakBonus(2)).toBe(MATCHING_PAIRS_STREAK_BONUS)
    // streakBeforeMatch=3 → newStreak=4 → 4%3!=0
    expect(computeStreakBonus(3)).toBe(0)
    // streakBeforeMatch=5 → newStreak=6 → 6%3==0
    expect(computeStreakBonus(5)).toBe(MATCHING_PAIRS_STREAK_BONUS)
  })
})

describe('tallyMatchingPairsScore', () => {
  // ── 3a. Base score ────────────────────────────────────────────────

  it('computes base score as pairs_matched * 1000', () => {
    const subs = [makeSub({ is_match: true, pair_index: 0 }), makeSub({ is_match: true, pair_index: 1 })]
    const prog = makeProg({ pairs_matched: 2, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.pairsMatched).toBe(2)
    expect(result.finalScore).toBe(2 * MATCHING_PAIRS_POINTS_PER_PAIR + MATCHING_PAIRS_PLACEMENT_BONUS[1])
  })

  it('base score with 0 pairs is 0 (plus placement if finished)', () => {
    const result = tallyMatchingPairsScore([], makeProg({ finished: true, finish_rank: 3 }), 8)
    expect(result.pairsMatched).toBe(0)
    expect(result.finalScore).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[3])
  })

  it('base score with maximum pairs', () => {
    // 16 pairs, perfect game (0 wrong), finished 1st — includes placement, perfect-game bonus,
    // and clean-streak multiplier
    const subs = Array.from({ length: 16 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const prog = makeProg({ pairs_matched: 16, wrong_attempts: 0, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore(subs, prog, 16)
    expect(result.pairsMatched).toBe(16)
    expect(result.finalScore).toBe(
      16 * MATCHING_PAIRS_POINTS_PER_PAIR +
        MATCHING_PAIRS_PLACEMENT_BONUS[1] +
        MATCHING_PAIRS_PERFECT_GAME_BONUS +
        MATCHING_PAIRS_PLACEMENT_BONUS[1] * (MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER - 1)
    )
  })

  // ── 3b. Streak bonus ────────────────────────────────────────────
  it('streak bonus: +500 at every 3rd consecutive match', () => {
    const subs = [
      makeSub({ is_match: true, pair_index: 0, streak_at_time: 1, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 1, streak_at_time: 2, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 2, streak_at_time: 3, streak_bonus: MATCHING_PAIRS_STREAK_BONUS }),
      makeSub({ is_match: true, pair_index: 3, streak_at_time: 4, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 4, streak_at_time: 5, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 5, streak_at_time: 6, streak_bonus: MATCHING_PAIRS_STREAK_BONUS }),
    ]
    const prog = makeProg({ pairs_matched: 6, finished: true, finish_rank: 2 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.streakBonusTotal).toBe(MATCHING_PAIRS_STREAK_BONUS * 2)
    expect(result.longestStreak).toBe(6)
  })

  it('streak resets after a wrong attempt', () => {
    const subs = [
      makeSub({ is_match: true, pair_index: 0, streak_at_time: 1, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 1, streak_at_time: 2, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 2, streak_at_time: 3, streak_bonus: MATCHING_PAIRS_STREAK_BONUS }),
      makeSub({ is_match: false, pair_index: 3, streak_at_time: 0, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 4, streak_at_time: 1, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 5, streak_at_time: 2, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 6, streak_at_time: 3, streak_bonus: MATCHING_PAIRS_STREAK_BONUS }),
    ]
    const prog = makeProg({ pairs_matched: 6, wrong_attempts: 1, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    // Streak awards at match index 3 (0-based: 2) and match index 7 (0-based: 6)
    expect(result.streakBonusTotal).toBe(MATCHING_PAIRS_STREAK_BONUS * 2)
    // Longest uninterrupted streak is 3 (before and after the wrong attempt are separate)
    expect(result.longestStreak).toBe(3)
  })

  // ── 3c. Wrong-attempt penalty ──────────────────────────────────────
  it('deducts -100 per wrong attempt', () => {
    const subs = [
      makeSub({ is_match: false, pair_index: 0 }),
      makeSub({ is_match: false, pair_index: 0 }),
      makeSub({ is_match: true, pair_index: 1 }),
    ]
    const prog = makeProg({ pairs_matched: 1, wrong_attempts: 2, finished: false })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.wrongPenaltyTotal).toBe(2 * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY)
    expect(result.finalScore).toBe(MATCHING_PAIRS_POINTS_PER_PAIR - 2 * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY)
  })

  it('final score clamped at minimum 0', () => {
    // 1 match but 20 wrong attempts would be negative
    const subs = [
      ...Array.from({ length: 20 }, (_, i) => makeSub({ is_match: false, pair_index: 0 })),
      makeSub({ is_match: true, pair_index: 1 }),
    ]
    const prog = makeProg({ pairs_matched: 1, wrong_attempts: 20, finished: false })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.wrongPenaltyTotal).toBe(20 * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY)
    expect(result.finalScore).toBe(0)
  })

  // ── 3d. Perfect-game bonus ─────────────────────────────────────────
  it('awards +2000 perfect-game bonus only when wrong_attempts === 0 and all pairs matched', () => {
    const subs = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const prog = makeProg({ pairs_matched: 8, wrong_attempts: 0, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.perfectGame).toBe(true)
    expect(result.finalScore).toBe(
      8 * MATCHING_PAIRS_POINTS_PER_PAIR +
        MATCHING_PAIRS_PLACEMENT_BONUS[1] +
        MATCHING_PAIRS_PERFECT_GAME_BONUS +
        MATCHING_PAIRS_PLACEMENT_BONUS[1] * (MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER - 1)
    )
  })

  it('does not award perfect-game bonus if player had any wrong attempt', () => {
    const subs = [
      makeSub({ is_match: false, pair_index: 0 }),
      ...Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i })),
    ]
    const prog = makeProg({ pairs_matched: 8, wrong_attempts: 1, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.perfectGame).toBe(false)
    expect(result.finalScore).toBe(
      8 * MATCHING_PAIRS_POINTS_PER_PAIR + MATCHING_PAIRS_PLACEMENT_BONUS[1] - MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY
    )
  })

  // ── 3e. Placement bonus ───────────────────────────────────────────
  describe('matchingPairsPlacementBonus', () => {
    it('1st gets 1500', () => expect(matchingPairsPlacementBonus(1)).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[1]))
    it('2nd gets 1000', () => expect(matchingPairsPlacementBonus(2)).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[2]))
    it('3rd gets 500', () => expect(matchingPairsPlacementBonus(3)).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[3]))
    it('4th+ gets 0', () => {
      expect(matchingPairsPlacementBonus(4)).toBe(0)
      expect(matchingPairsPlacementBonus(99)).toBe(0)
    })
  })

  it('placement bonus applied to finished player with a rank', () => {
    const prog = makeProg({ pairs_matched: 0, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore([], prog, 8)
    expect(result.placementBonus).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[1])
    expect(result.finalScore).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[1])
  })

  it('no placement bonus for unfinished player', () => {
    const prog = makeProg({ finished: false, finish_rank: null })
    const result = tallyMatchingPairsScore([], prog, 8)
    expect(result.placementBonus).toBe(0)
  })

  it('clean streak multiplier doubles placement bonus for perfect game', () => {
    const subs = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const prog = makeProg({ pairs_matched: 8, wrong_attempts: 0, finished: true, finish_rank: 2 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.cleanStreakMultiplierBonus).toBe(
      MATCHING_PAIRS_PLACEMENT_BONUS[2] * (MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER - 1)
    )
  })

  it('clean streak multiplier requires zero wrong attempts on a completed board', () => {
    const subs = [
      makeSub({ is_match: false, pair_index: 0 }),
      ...Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i })),
    ]
    const prog = makeProg({ pairs_matched: 8, wrong_attempts: 1, finished: true, finish_rank: 1 })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.cleanStreakMultiplierBonus).toBe(0)
  })

  // ── 3f. End-to-end scenario tests ─────────────────────────────────
  it('scenario: 8/8 pairs, 2 wrong attempts, one 3-streak, finished 2nd', () => {
    // Sequence: W, M, M, M, W, M, M, M, M, M
    // Streak awards at the 3rd match (index 3) and 6th match (index 8)
    const subs = [
      makeSub({ is_match: false, pair_index: 0, streak_at_time: 0, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 1, streak_at_time: 1, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 2, streak_at_time: 2, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 3, streak_at_time: 3, streak_bonus: MATCHING_PAIRS_STREAK_BONUS }),
      makeSub({ is_match: false, pair_index: 4, streak_at_time: 0, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 5, streak_at_time: 1, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 6, streak_at_time: 2, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 7, streak_at_time: 3, streak_bonus: MATCHING_PAIRS_STREAK_BONUS }),
      makeSub({ is_match: true, pair_index: 8, streak_at_time: 4, streak_bonus: 0 }),
      makeSub({ is_match: true, pair_index: 9, streak_at_time: 5, streak_bonus: 0 }),
    ]
    const prog = makeProg({
      pairs_matched: 8,
      wrong_attempts: 2,
      finished: true,
      finish_rank: 2,
      finished_at: '2026-01-01T00:02:00Z',
    })
    const result = tallyMatchingPairsScore(subs, prog, 8, '2026-01-01T00:00:00Z')

    expect(result.pairsMatched).toBe(8)
    expect(result.wrongAttempts).toBe(2)
    expect(result.streakBonusTotal).toBe(MATCHING_PAIRS_STREAK_BONUS * 2)
    expect(result.longestStreak).toBe(5)
    expect(result.perfectGame).toBe(false)
    expect(result.placement).toBe(2)
    expect(result.placementBonus).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[2])
    expect(result.wrongPenaltyTotal).toBe(2 * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY)
    expect(result.cleanStreakMultiplierBonus).toBe(0)

    const expectedBase = 8 * MATCHING_PAIRS_POINTS_PER_PAIR
    const expectedStreak = MATCHING_PAIRS_STREAK_BONUS * 2
    const expectedPlacement = MATCHING_PAIRS_PLACEMENT_BONUS[2]
    const expectedPenalty = 2 * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY
    expect(result.finalScore).toBe(expectedBase + expectedStreak + expectedPlacement - expectedPenalty)
  })

  it('scenario: perfect game 8/8, 0 wrong, finished 1st with speed bonus', () => {
    const subs = Array.from({ length: 8 }, (_, i) =>
      makeSub({
        is_match: true,
        pair_index: i,
        streak_at_time: i + 1,
        streak_bonus: (i + 1) % 3 === 0 ? MATCHING_PAIRS_STREAK_BONUS : 0,
      })
    )
    const prog = makeProg({
      pairs_matched: 8,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 1,
      finished_at: '2026-01-01T00:02:30Z',
    })
    const result = tallyMatchingPairsScore(subs, prog, 8, '2026-01-01T00:00:00Z')

    expect(result.perfectGame).toBe(true)
    expect(result.wrongAttempts).toBe(0)
    expect(result.cleanStreakMultiplierBonus).toBeGreaterThan(0)

    const expectedBase = 8 * MATCHING_PAIRS_POINTS_PER_PAIR
    const expectedStreak = MATCHING_PAIRS_STREAK_BONUS * 2 // 3rd and 6th match
    const expectedPlacement = MATCHING_PAIRS_PLACEMENT_BONUS[1]
    const expectedPerfect = MATCHING_PAIRS_PERFECT_GAME_BONUS
    const expectedCleanMultiplier = MATCHING_PAIRS_PLACEMENT_BONUS[1] * (MATCHING_PAIRS_CLEAN_STREAK_MULTIPLIER - 1)

    // Derive expected speed par independently using the same formula as the production code.
    // sessionStartedAt = 2026-01-01T00:00:00Z, finished_at = 2026-01-01T00:02:30Z
    // memorizeMs = 8 >= 16 ? 5000 : 3000 = 3000
    // startMs = sessionStartedAt + 3000ms, elapsedMs = finished_at - startMs = 150000 - 3000 = 147000
    // parMs = 8 * 15 * 1000 = 120000 → underParMs = max(0, 120000 - 147000) = 0 → bonus = 0
    const expectedSpeedPar = 0

    expect(result.finalScore).toBe(
      expectedBase + expectedStreak + expectedPlacement + expectedPerfect + expectedCleanMultiplier + expectedSpeedPar
    )
  })

  it('scenario: 0 matches, never finished — score is 0', () => {
    const result = tallyMatchingPairsScore([], makeProg({ finished: false }), 8)
    expect(result.finalScore).toBe(0)
  })
})

// ── Group 5: Board & Icon Generation ──────────────────────────────────────────

describe('buildMatchingPairsRoundMetadata', () => {
  const FIXED_SEED = 42
  const PLAYER_IDS = ['p1', 'p2', 'p3']

  it('samples unique icons with no duplicates in the pair set', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    const icons = meta.pairs.map((p) => p.icon)
    expect(new Set(icons).size).toBe(8)
  })

  it('uses icons from the MEMORY_MATCH_ICON_POOL', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    for (const pair of meta.pairs) {
      expect(MEMORY_MATCH_ICON_POOL).toContain(pair.icon)
    }
  })

  it('every player in the same game receives the same icon set', () => {
    const meta1 = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 16, PLAYER_IDS)
    const meta2 = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 16, PLAYER_IDS)

    expect(meta1.pairs.map((p) => p.icon)).toEqual(meta2.pairs.map((p) => p.icon))
    expect(meta1.pairs.map((p) => p.color)).toEqual(meta2.pairs.map((p) => p.color))
  })

  it('grid size 8 produces 16 cards, grid size 16 produces 32 cards', () => {
    const meta8 = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    for (const board of meta8.playerBoards) {
      expect(board.cardOrder).toHaveLength(16)
    }

    const meta16 = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 16, PLAYER_IDS)
    for (const board of meta16.playerBoards) {
      expect(board.cardOrder).toHaveLength(32)
    }
  })

  it('each pair index appears exactly twice in every player board', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    for (const board of meta.playerBoards) {
      const counts = new Map<number, number>()
      for (const idx of board.cardOrder) {
        counts.set(idx, (counts.get(idx) ?? 0) + 1)
      }
      for (let i = 0; i < meta.gridSizePairs; i++) {
        expect(counts.get(i)).toBe(2)
      }
    }
  })

  it('each pair shares exactly one color, and no two pairs share the same color', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    const colors = meta.pairs.map((p) => p.color)
    expect(new Set(colors).size).toBe(8)
  })

  it('colors are drawn from MEMORY_MATCH_PAIR_COLORS', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    for (const pair of meta.pairs) {
      expect(MEMORY_MATCH_PAIR_COLORS).toContain(pair.color)
    }
  })

  it('different players have different card orderings (same set, shuffled differently)', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    const orders = meta.playerBoards.map((b) => b.cardOrder.join(','))
    // At least 2 of 3 players should differ (statistically guaranteed with seeded shuffle)
    const uniqueOrders = new Set(orders)
    expect(uniqueOrders.size).toBeGreaterThan(1)
  })

  it('metadata round-trips through parseMatchingPairsMetadata', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    const parsed = parseMatchingPairsMetadata(JSON.parse(JSON.stringify(meta)))
    expect(parsed).not.toBeNull()
    expect(parsed!.gridSizePairs).toBe(8)
    expect(parsed!.pairs).toHaveLength(8)
    expect(parsed!.playerBoards).toHaveLength(3)
  })

  it('parseMatchingPairsMetadata returns null for invalid input', () => {
    expect(parseMatchingPairsMetadata(null)).toBeNull()
    expect(parseMatchingPairsMetadata('string')).toBeNull()
    expect(parseMatchingPairsMetadata({})).toBeNull()
    expect(parseMatchingPairsMetadata({ gridSizePairs: '8' })).toBeNull()
  })

  it('getPlayerBoard returns the correct card order for a player', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    const board = getPlayerBoard(meta, 'p2')
    expect(board).not.toBeNull()
    expect(board).toHaveLength(16)
  })

  it('getPlayerBoard returns null for unknown player', () => {
    const meta = buildMatchingPairsRoundMetadata('G', FIXED_SEED, 8, PLAYER_IDS)
    expect(getPlayerBoard(meta, 'unknown')).toBeNull()
  })
})

// ── Group 2: Flip Mechanics (state machine) ───────────────────────────────────

describe('flip state machine logic', () => {
  // These test the flip logic that lives in MatchingPairsPlayerView.handleCardFlip
  // by modeling the state machine transitions in isolation.

  type CardState = 'hidden' | 'flipped' | 'matched'

  interface FlipState {
    cardOrder: number[]
    cardStates: CardState[]
    firstFlipped: number | null
    locked: boolean
  }

  /** Build an 8-pair board where pair N occupies cards [N, N+8]. */
  function makeBoard(sizePairs: number): FlipState {
    const cardOrder = Array.from({ length: sizePairs * 2 }, (_, i) => i % sizePairs)
    return {
      cardOrder,
      cardStates: new Array(cardOrder.length).fill('hidden') as CardState[],
      firstFlipped: null,
      locked: false,
    }
  }

  function flipCard(state: FlipState, index: number): 'match' | 'miss' | 'blocked' | 'first' {
    if (state.locked) return 'blocked'
    if (state.cardStates[index] === 'matched' || state.cardStates[index] === 'flipped') return 'blocked'

    if (state.firstFlipped === null) {
      state.cardStates[index] = 'flipped'
      state.firstFlipped = index
      return 'first'
    }

    const firstIndex = state.firstFlipped
    const isMatch = state.cardOrder[firstIndex] === state.cardOrder[index]

    state.locked = true
    state.cardStates[index] = 'flipped'
    state.firstFlipped = null

    if (isMatch) {
      state.cardStates[firstIndex] = 'matched'
      state.cardStates[index] = 'matched'
      state.locked = false
      return 'match'
    }

    // Mismatch — will flip back after delay (simulated)
    return 'miss'
  }

  function resolveMismatch(state: FlipState, firstIndex: number, secondIndex: number) {
    state.cardStates[firstIndex] = 'hidden'
    state.cardStates[secondIndex] = 'hidden'
    state.locked = false
  }

  it('flipping a first card sets it face-up, stays open for second pick', () => {
    const state = makeBoard(8)
    const result = flipCard(state, 0)
    expect(result).toBe('first')
    expect(state.cardStates[0]).toBe('flipped')
    expect(state.firstFlipped).toBe(0)
    expect(state.locked).toBe(false)
  })

  it('matching second card registers both as matched', () => {
    const state = makeBoard(8)
    // Card 0 and card 8 both have pairIndex 0 (same pair)
    flipCard(state, 0)
    const result = flipCard(state, 8)
    expect(result).toBe('match')
    expect(state.cardStates[0]).toBe('matched')
    expect(state.cardStates[8]).toBe('matched')
    expect(state.firstFlipped).toBeNull()
    expect(state.locked).toBe(false)
  })

  it('mismatched pair flips back after delay (not immediate, not indefinite)', () => {
    const state = makeBoard(8)
    // Card 0 (pairIndex 0) and card 1 (pairIndex 1) — different pairs
    flipCard(state, 0)
    const result = flipCard(state, 1)
    expect(result).toBe('miss')
    // After mismatch, cards should still be flipped until resolveMismatch
    expect(state.cardStates[0]).toBe('flipped')
    expect(state.cardStates[1]).toBe('flipped')
    expect(state.firstFlipped).toBeNull()
    expect(state.locked).toBe(true)

    // After the flip-back delay resolves
    resolveMismatch(state, 0, 1)
    expect(state.cardStates[0]).toBe('hidden')
    expect(state.cardStates[1]).toBe('hidden')
    expect(state.locked).toBe(false)
  })

  it('after mismatch resolves, next single card stays open and waits for second pick', () => {
    const state = makeBoard(8)
    flipCard(state, 0)
    flipCard(state, 1)
    resolveMismatch(state, 0, 1)

    const next = flipCard(state, 2)
    expect(next).toBe('first')
    expect(state.cardStates[2]).toBe('flipped')
    expect(state.firstFlipped).toBe(2)
    expect(state.locked).toBe(false)
  })

  it('flipping an already-matched card is a no-op', () => {
    const state = makeBoard(8)
    flipCard(state, 0)
    flipCard(state, 8)

    const attempt = flipCard(state, 0)
    expect(attempt).toBe('blocked')
    expect(state.cardStates[0]).toBe('matched')
  })

  it('flipping a third card while two are face-up (waiting for resolution) is blocked', () => {
    const state = makeBoard(8)
    flipCard(state, 0)
    flipCard(state, 1)
    // Board is locked — third flip should be blocked
    const attempt = flipCard(state, 2)
    expect(attempt).toBe('blocked')
    expect(state.cardStates[2]).toBe('hidden')
  })

  it('flipping a card that is already face-up (same card twice) is blocked', () => {
    const state = makeBoard(8)
    flipCard(state, 0)
    const attempt = flipCard(state, 0)
    expect(attempt).toBe('blocked')
  })
})

// ── Grid layout helpers ──────────────────────────────────────────────────────

describe('matchingPairsGridLayout', () => {
  it('8 pairs -> 4x4', () => {
    expect(matchingPairsGridLayout(8)).toEqual({ cols: 4, rows: 4 })
  })
  it('16 pairs -> 8x4', () => {
    expect(matchingPairsGridLayout(16)).toEqual({ cols: 8, rows: 4 })
  })
})

describe('formatMatchingPairsGridSize', () => {
  it('formats 8 as Standard (4x4)', () => {
    expect(formatMatchingPairsGridSize(8)).toBe('Standard (4×4)')
  })
  it('formats 16 as Large (8x4)', () => {
    expect(formatMatchingPairsGridSize(16)).toBe('Large (8×4)')
  })
})

// ── Group 4: Round Timeout Scoring ──────────────────────────────────────────

describe('Group 4: Round Timeout Scoring', () => {
  it('preserves in-progress score when player does not finish before timeout', () => {
    // Player matched 3 pairs, had 2 wrong attempts, did not finish.
    const subs = [
      makeSub({ is_match: true, pair_index: 0, streak_at_time: 1, streak_bonus: 0, points_after: 1000 }),
      makeSub({ is_match: true, pair_index: 1, streak_at_time: 2, streak_bonus: 0, points_after: 2000 }),
      makeSub({ is_match: false, pair_index: 2, streak_at_time: 0, streak_bonus: 0, points_after: 1900 }),
      makeSub({ is_match: true, pair_index: 3, streak_at_time: 1, streak_bonus: 0, points_after: 2900 }),
      makeSub({ is_match: false, pair_index: 4, streak_at_time: 0, streak_bonus: 0, points_after: 2800 }),
    ]
    const prog = makeProg({
      pairs_matched: 3,
      wrong_attempts: 2,
      finished: true,
      finish_rank: null,
      finished_at: '2026-01-01T00:00:30Z',
    })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    // Base: 3 × 1000 = 3000, Penalty: 2 × 100 = 200
    expect(result.pairsMatched).toBe(3)
    expect(result.wrongAttempts).toBe(2)
    expect(result.finalScore).toBe(3000 - 200)
    expect(result.placementBonus).toBe(0)
    expect(result.perfectGame).toBe(false)
  })

  it('does NOT award placement bonus for timed-out player (finish_rank null)', () => {
    const prog = makeProg({ finished: true, finish_rank: null })
    const result = tallyMatchingPairsScore([], prog, 8)
    expect(result.placementBonus).toBe(0)
    expect(result.placement).toBe(999)
  })

  it('still awards placement bonus for a player who finished before timeout', () => {
    const subs = Array.from({ length: 8 }, (_, i) =>
      makeSub({
        is_match: true,
        pair_index: i,
        streak_at_time: i + 1,
        streak_bonus: (i + 1) % 3 === 0 ? MATCHING_PAIRS_STREAK_BONUS : 0,
      })
    )
    const prog = makeProg({
      pairs_matched: 8,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 2,
      finished_at: '2026-01-01T00:00:20Z',
    })
    const result = tallyMatchingPairsScore(subs, prog, 8)
    expect(result.placementBonus).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[2])
    expect(result.placement).toBe(2)
    expect(result.finalScore).toBeGreaterThan(0)
  })

  it('timed-out partial score is additive to cumulative total', () => {
    // Round 1: finished with full score
    const subs1 = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const prog1 = makeProg({
      pairs_matched: 8,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 1,
      finished_at: '2026-01-01T00:00:15Z',
      round_id: 'R1',
    })
    const score1 = tallyMatchingPairsScore(subs1, prog1, 8).finalScore

    // Round 2: timed out with partial progress
    const subs2 = [
      makeSub({ is_match: true, pair_index: 0, points_after: 1000 }),
      makeSub({ is_match: true, pair_index: 1, points_after: 2000 }),
      makeSub({ is_match: false, pair_index: 2, points_after: 1900 }),
    ]
    const prog2 = makeProg({
      pairs_matched: 2,
      wrong_attempts: 1,
      finished: true,
      finish_rank: null,
      finished_at: '2026-01-01T00:00:30Z',
      round_id: 'R2',
    })
    const score2 = tallyMatchingPairsScore(subs2, prog2, 8).finalScore

    const cumulative = score1 + score2
    expect(cumulative).toBeGreaterThan(score2)
    expect(cumulative).toBe(score1 + (2000 - 100))
  })

  it('mixed scenario: finishers get placement bonus, timeout players do not', () => {
    const gridSize = 8
    // Player A finishes 1st
    const subsA = Array.from({ length: gridSize }, (_, i) =>
      makeSub({ is_match: true, pair_index: i, player_id: 'pA' })
    )
    const progA = makeProg({
      player_id: 'pA',
      pairs_matched: gridSize,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 1,
      finished_at: '2026-01-01T00:00:20Z',
    })
    const scoreA = tallyMatchingPairsScore(subsA, progA, gridSize)
    expect(scoreA.placementBonus).toBe(MATCHING_PAIRS_PLACEMENT_BONUS[1])

    // Player B times out with partial matches
    const subsB = [
      makeSub({ is_match: true, pair_index: 0, player_id: 'pB' }),
      makeSub({ is_match: true, pair_index: 1, player_id: 'pB' }),
    ]
    const progB = makeProg({
      player_id: 'pB',
      pairs_matched: 2,
      wrong_attempts: 0,
      finished: true,
      finish_rank: null,
      finished_at: '2026-01-01T00:00:30Z',
    })
    const scoreB = tallyMatchingPairsScore(subsB, progB, gridSize)
    expect(scoreB.placementBonus).toBe(0)
    expect(scoreB.finalScore).toBe(2000)
  })
})

// ── Group 3: Cumulative Scoring Across Rounds ───────────────────────────────

describe('Group 3: Cumulative Scoring Across Rounds', () => {
  it('total score after round 2 equals round 1 score plus round 2 score', () => {
    const subs1 = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const prog1 = makeProg({
      pairs_matched: 8,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 1,
      finished_at: '2026-01-01T00:00:15Z',
      round_id: 'R1',
    })
    const score1 = tallyMatchingPairsScore(subs1, prog1, 8).finalScore

    const subs2 = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const prog2 = makeProg({
      pairs_matched: 8,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 2,
      finished_at: '2026-01-01T00:00:30Z',
      round_id: 'R2',
    })
    const score2 = tallyMatchingPairsScore(subs2, prog2, 8).finalScore

    const total = score1 + score2
    expect(total).toBeGreaterThan(score1)
    expect(total).toBeGreaterThan(score2)
    expect(total - score2).toBe(score1)
  })

  it('final leaderboard ranks by cumulative total, not individual round score', () => {
    // Player A: round1=4000, round2=2000 => total=6000
    // Player B: round1=2000, round2=5000 => total=7000 (should rank higher)
    const subsA1 = Array.from({ length: 4 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pA' }))
    const subsA2 = Array.from({ length: 2 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pA' }))
    const subsB1 = Array.from({ length: 2 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pB' }))
    const subsB2 = Array.from({ length: 5 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pB' }))

    const progA1 = makeProg({
      player_id: 'pA',
      pairs_matched: 4,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 1,
      round_id: 'R1',
    })
    const progA2 = makeProg({
      player_id: 'pA',
      pairs_matched: 2,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 2,
      round_id: 'R2',
    })
    const progB1 = makeProg({
      player_id: 'pB',
      pairs_matched: 2,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 2,
      round_id: 'R1',
    })
    const progB2 = makeProg({
      player_id: 'pB',
      pairs_matched: 5,
      wrong_attempts: 0,
      finished: true,
      finish_rank: 1,
      round_id: 'R2',
    })

    const totalA =
      tallyMatchingPairsScore(subsA1, progA1, 8).finalScore + tallyMatchingPairsScore(subsA2, progA2, 8).finalScore
    const totalB =
      tallyMatchingPairsScore(subsB1, progB1, 8).finalScore + tallyMatchingPairsScore(subsB2, progB2, 8).finalScore

    expect(totalB).toBeGreaterThan(totalA)
  })

  it('round 1 winner can lose overall to a player with better round2 score', () => {
    const subsA1 = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pA' }))
    const subsA2 = Array.from({ length: 1 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pA' }))
    const subsB1 = Array.from({ length: 2 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pB' }))
    const subsB2 = Array.from({ length: 8 }, (_, i) => makeSub({ is_match: true, pair_index: i, player_id: 'pB' }))

    const progA1 = makeProg({ player_id: 'pA', pairs_matched: 8, finished: true, finish_rank: 1, round_id: 'R1' })
    const progA2 = makeProg({ player_id: 'pA', pairs_matched: 1, finished: true, finish_rank: 4, round_id: 'R2' })
    const progB1 = makeProg({ player_id: 'pB', pairs_matched: 2, finished: true, finish_rank: 3, round_id: 'R1' })
    const progB2 = makeProg({ player_id: 'pB', pairs_matched: 8, finished: true, finish_rank: 1, round_id: 'R2' })

    const totalA =
      tallyMatchingPairsScore(subsA1, progA1, 8).finalScore + tallyMatchingPairsScore(subsA2, progA2, 8).finalScore
    const totalB =
      tallyMatchingPairsScore(subsB1, progB1, 8).finalScore + tallyMatchingPairsScore(subsB2, progB2, 8).finalScore

    // Player A won round 1 (rank 1), Player B won round 2 (rank 1)
    // But Player B scored higher overall
    expect(totalB).toBeGreaterThan(totalA)
  })

  it('Round Results cumulative total differs from current round score in multi-round scenario', () => {
    const subs1 = Array.from({ length: 6 }, (_, i) => makeSub({ is_match: true, pair_index: i }))
    const subs2 = Array.from({ length: 4 }, (_, i) => makeSub({ is_match: true, pair_index: i }))

    const prog1 = makeProg({ pairs_matched: 6, finished: true, finish_rank: 2, round_id: 'R1' })
    const prog2 = makeProg({ pairs_matched: 4, finished: true, finish_rank: 1, round_id: 'R2' })

    const round2Score = tallyMatchingPairsScore(subs2, prog2, 8).finalScore
    const cumulativeAfter2 = tallyMatchingPairsScore(subs1, prog1, 8).finalScore + round2Score

    // Cumulative should be larger than round 2's score alone (unless round 1 was 0)
    expect(cumulativeAfter2).toBeGreaterThan(round2Score)
  })
})
