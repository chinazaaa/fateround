// ---------------------------------------------------------------------------
// Daily Ludo Puzzle Engine
// Pre-validated puzzle bank. The only import is the dependency-free shared solver.
//
// Board model (mirrors src/lib/ludo.ts constants, duplicated here on purpose):
//   TRACK_LENGTH = 52, HOME_ENTRY_STEPS = 51, HOME_LANE_LENGTH = 5,
//   FINISH_STEPS = 56. Player is always 'green' (START_POS.green = 0), so a
//   piece's `steps` from start maps directly to board pos:
//     steps < 51  -> zone 'track', pos = steps
//     51<=steps<56 -> zone 'home',  pos = steps - 51
//     steps >= 56 -> zone 'finished'
//   `steps === -1` (internal only) represents a piece still in 'base'.
//
// NOTE: this puzzle has NO extra-roll-on-6 rule. The dice sequence is fixed
// and each roll is used exactly once, in order. A roll is skipped only when no
// piece can legally use it; the play UI forces a move whenever one exists.
// ---------------------------------------------------------------------------

import { solveLudoPuzzleSteps } from '@/lib/ludo-puzzle-solver'

export interface LudoPuzzlePiece {
  id: number
  zone: 'base' | 'track' | 'home' | 'finished'
  pos: number
}

export interface LudoObstacle {
  trackPos: number
}

export interface LudoPuzzleData {
  startingPieces: LudoPuzzlePiece[]
  diceSequence: number[]
  obstacles: LudoObstacle[]
  optimalRolls: number
  solution: { optimalRolls: number }
}

export interface LudoPuzzleResult {
  puzzleData: LudoPuzzleData
  config: {
    timer: number
    totalRolls: number
  }
}

export interface LudoPuzzleSubmission {
  // Player's choice for each roll, in sequence order. `null`/absent = skip
  // that roll. An illegal choice (piece can't legally use that roll) is
  // treated as a skip.
  moves: Array<number | null>
}

export interface LudoPuzzleVerification {
  score: number
  solved: boolean
  tokensHome: number
  rollsUsed: number
  captures: number
}

const TRACK_LENGTH = 52
const HOME_ENTRY_STEPS = 51
const HOME_LANE_LENGTH = 5
const FINISH_STEPS = 56
const PIECE_COUNT = 4

// -- Seeded PRNG (LCG) -------------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

// -- Zone <-> steps helpers ---------------------------------------------------

function stepsFromPiece(piece: { zone: 'base' | 'track' | 'home' | 'finished'; pos: number }): number {
  if (piece.zone === 'base') return -1
  if (piece.zone === 'track') return piece.pos
  if (piece.zone === 'home') return HOME_ENTRY_STEPS + piece.pos
  return FINISH_STEPS
}

function orderedSteps(pieces: LudoPuzzlePiece[]): number[] {
  const byId = [...pieces].sort((a, b) => a.id - b.id)
  return byId.map(stepsFromPiece)
}

// -- Solver ------------------------------------------------------------------------
// The target a player is scored against ("optimal rolls") MUST be reachable by playing the real
// game. The play UI (DailyLudoPuzzlePlay) forces a move whenever one is legal and only skips a roll
// when nothing can move, so the optimum is computed by the shared solver that models exactly that
// (src/lib/ludo-puzzle-solver.ts). This file used to carry its own BFS in which skipping was always
// allowed, which could report a lower optimum than any player can actually achieve.
function solveLudoPuzzle(
  startingPieces: LudoPuzzlePiece[],
  diceSequence: number[],
  obstacles: LudoObstacle[]
): { optimalRolls: number } | null {
  const steps = solveLudoPuzzleSteps(
    startingPieces.map(({ zone, pos }) => ({ zone, pos })),
    diceSequence,
    obstacles
  )
  return steps ? { optimalRolls: steps.length } : null
}

// -- Puzzle bank ---------------------------------------------------------------
// Steps are given as (zone, pos) starting positions per piece id 0-3.

interface BankPuzzle {
  startingPieces: LudoPuzzlePiece[]
  diceSequence: number[]
  obstacles: LudoObstacle[]
  difficulty: 'easy' | 'medium' | 'hard'
}

const RAW_PUZZLE_BANK: BankPuzzle[] = [
  // ---- EASY (3 puzzles) -------------------------------------------------
  {
    // #1 — All four pieces already in the closing stretch, no base piece.
    startingPieces: [
      { id: 0, zone: 'track', pos: 50 },
      { id: 1, zone: 'track', pos: 48 },
      { id: 2, zone: 'home', pos: 3 },
      { id: 3, zone: 'track', pos: 46 },
    ],
    diceSequence: [5, 4, 5, 2, 2, 1, 1, 4, 1, 1, 2, 6],
    obstacles: [],
    difficulty: 'easy',
  },
  {
    // #2 — Two already in the home lane, two just short of the entry.
    startingPieces: [
      { id: 0, zone: 'home', pos: 0 },
      { id: 1, zone: 'home', pos: 2 },
      { id: 2, zone: 'track', pos: 49 },
      { id: 3, zone: 'track', pos: 47 },
    ],
    diceSequence: [2, 3, 5, 4, 1, 4, 1, 1, 1, 1, 1, 6],
    obstacles: [],
    difficulty: 'easy',
  },
  {
    // #3 — Single obstacle for a bonus, otherwise a straightforward run-in.
    startingPieces: [
      { id: 0, zone: 'track', pos: 48 },
      { id: 1, zone: 'track', pos: 44 },
      { id: 2, zone: 'home', pos: 1 },
      { id: 3, zone: 'track', pos: 41 },
    ],
    diceSequence: [5, 3, 4, 2, 6, 1, 5, 2, 2, 1, 6, 2],
    obstacles: [{ trackPos: 44 }],
    difficulty: 'easy',
  },

  // ---- MEDIUM (4 puzzles) -------------------------------------------------
  {
    // #4 — Three on track at different spots plus one in the home lane.
    startingPieces: [
      { id: 0, zone: 'track', pos: 38 },
      { id: 1, zone: 'track', pos: 42 },
      { id: 2, zone: 'track', pos: 47 },
      { id: 3, zone: 'home', pos: 2 },
    ],
    diceSequence: [1, 1, 5, 3, 1, 6, 5, 1, 6, 4, 2, 5, 1, 3, 6, 3],
    obstacles: [{ trackPos: 44 }],
    difficulty: 'medium',
  },
  {
    // #5 — All four out already, spread across the closing stretch.
    startingPieces: [
      { id: 0, zone: 'track', pos: 40 },
      { id: 1, zone: 'track', pos: 44 },
      { id: 2, zone: 'track', pos: 47 },
      { id: 3, zone: 'track', pos: 50 },
    ],
    diceSequence: [4, 4, 1, 3, 6, 2, 4, 1, 4, 2, 1, 1, 3, 1, 5, 1, 6],
    obstacles: [{ trackPos: 45 }],
    difficulty: 'medium',
  },
  {
    // #6 — Two obstacles guarding the home stretch.
    startingPieces: [
      { id: 0, zone: 'track', pos: 38 },
      { id: 1, zone: 'track', pos: 45 },
      { id: 2, zone: 'track', pos: 48 },
      { id: 3, zone: 'home', pos: 0 },
    ],
    diceSequence: [5, 1, 2, 2, 3, 2, 1, 6, 3, 2, 2, 1, 5, 2, 1, 2, 1, 1, 2, 4],
    obstacles: [{ trackPos: 42 }, { trackPos: 49 }],
    difficulty: 'medium',
  },
  {
    // #7 — Tokens spread further apart, longer sequence, one obstacle.
    startingPieces: [
      { id: 0, zone: 'track', pos: 36 },
      { id: 1, zone: 'track', pos: 42 },
      { id: 2, zone: 'track', pos: 46 },
      { id: 3, zone: 'track', pos: 49 },
    ],
    diceSequence: [1, 4, 1, 1, 1, 3, 1, 4, 1, 2, 6, 6, 2, 3, 1, 2, 6, 6],
    obstacles: [{ trackPos: 40 }],
    difficulty: 'medium',
  },

  // ---- HARD (3 puzzles) -------------------------------------------------
  {
    // #8 — Tokens spread far apart, two obstacles, one piece already home.
    startingPieces: [
      { id: 0, zone: 'track', pos: 26 },
      { id: 1, zone: 'track', pos: 38 },
      { id: 2, zone: 'track', pos: 46 },
      { id: 3, zone: 'home', pos: 1 },
    ],
    diceSequence: [6, 2, 2, 3, 6, 3, 2, 6, 2, 1, 1, 1, 3, 4, 5, 3, 4, 6, 1, 1, 3, 6],
    obstacles: [{ trackPos: 30 }, { trackPos: 42 }],
    difficulty: 'hard',
  },
  {
    // #9 — Three obstacles clustered through the closing stretch.
    startingPieces: [
      { id: 0, zone: 'track', pos: 33 },
      { id: 1, zone: 'track', pos: 40 },
      { id: 2, zone: 'track', pos: 45 },
      { id: 3, zone: 'track', pos: 50 },
    ],
    diceSequence: [2, 6, 3, 4, 5, 1, 6, 3, 2, 1, 3, 5, 1, 5, 2, 1, 2, 4, 1],
    obstacles: [{ trackPos: 36 }, { trackPos: 43 }, { trackPos: 48 }],
    difficulty: 'hard',
  },
  {
    // #10 — One piece still in base, needing the full run to finish.
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'track', pos: 49 },
      { id: 2, zone: 'track', pos: 50 },
      { id: 3, zone: 'home', pos: 3 },
    ],
    diceSequence: [6, 1, 4, 3, 2, 4, 4, 1, 3, 6, 5, 5, 6, 5, 6, 2, 1, 3, 2, 1, 2, 4, 1, 3, 2],
    obstacles: [{ trackPos: 5 }, { trackPos: 46 }],
    difficulty: 'hard',
  },
]

interface CompiledPuzzle extends BankPuzzle {
  optimalRolls: number
}

function compileBank(bank: BankPuzzle[]): CompiledPuzzle[] {
  const compiled: CompiledPuzzle[] = []
  for (const puzzle of bank) {
    const solved = solveLudoPuzzle(puzzle.startingPieces, puzzle.diceSequence, puzzle.obstacles)
    // A puzzle nobody can win must never be served, so it is dropped here rather than given a
    // made-up target. (It used to be kept with `diceSequence.length` as its optimum.)
    if (solved) compiled.push({ ...puzzle, optimalRolls: solved.optimalRolls })
  }
  return compiled
}

const PUZZLE_BANK: CompiledPuzzle[] = compileBank(RAW_PUZZLE_BANK)

// -- Generation -----------------------------------------------------------------

function buildResult(puzzle: CompiledPuzzle, timer: number): LudoPuzzleResult {
  return {
    puzzleData: {
      startingPieces: puzzle.startingPieces.map((p) => ({ ...p })),
      diceSequence: [...puzzle.diceSequence],
      obstacles: puzzle.obstacles.map((o) => ({ ...o })),
      optimalRolls: puzzle.optimalRolls,
      solution: { optimalRolls: puzzle.optimalRolls },
    },
    config: {
      timer,
      totalRolls: puzzle.diceSequence.length,
    },
  }
}

export function generateLudoPuzzle(seed: number, timer: number): LudoPuzzleResult {
  const rng = createRng(seed)
  const index = Math.floor(rng() * PUZZLE_BANK.length)
  const puzzle = PUZZLE_BANK[index]
  return buildResult(puzzle, timer)
}

// -- Admin content generation -----------------------------------------------------

function isValidPiece(data: unknown): data is LudoPuzzlePiece {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (typeof obj.id !== 'number') return false
  if (obj.zone !== 'base' && obj.zone !== 'track' && obj.zone !== 'home' && obj.zone !== 'finished') return false
  if (typeof obj.pos !== 'number') return false
  if (obj.zone === 'track' && (obj.pos < 0 || obj.pos >= TRACK_LENGTH)) return false
  if (obj.zone === 'home' && (obj.pos < 0 || obj.pos >= HOME_LANE_LENGTH)) return false
  return true
}

function isValidObstacle(data: unknown): data is LudoObstacle {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return typeof obj.trackPos === 'number' && obj.trackPos >= 0 && obj.trackPos < TRACK_LENGTH
}

interface AdminLudoContent {
  startingPieces: LudoPuzzlePiece[]
  diceSequence: number[]
  obstacles: LudoObstacle[]
  optimalRolls?: number
}

function isValidAdminContent(data: unknown): data is AdminLudoContent {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>

  if (!Array.isArray(obj.startingPieces) || obj.startingPieces.length !== PIECE_COUNT) return false
  if (!obj.startingPieces.every(isValidPiece)) return false

  const ids = (obj.startingPieces as LudoPuzzlePiece[]).map((p) => p.id).sort((a, b) => a - b)
  if (ids.join(',') !== '0,1,2,3') return false

  if (!Array.isArray(obj.diceSequence) || obj.diceSequence.length === 0) return false
  if (!obj.diceSequence.every((n) => typeof n === 'number' && n >= 1 && n <= 6)) return false

  if (obj.obstacles !== undefined) {
    if (!Array.isArray(obj.obstacles)) return false
    if (!obj.obstacles.every(isValidObstacle)) return false
  }

  if (obj.optimalRolls !== undefined && typeof obj.optimalRolls !== 'number') return false

  return true
}

export function generateLudoFromContent(adminContent: unknown, seed: number, timer: number): LudoPuzzleResult | null {
  let raw: unknown = adminContent

  // Support both a single puzzle object and an array of puzzles (pick one by seed).
  if (Array.isArray(adminContent)) {
    if (adminContent.length === 0) return null
    const idx = ((seed % adminContent.length) + adminContent.length) % adminContent.length
    raw = adminContent[idx]
  }

  if (!isValidAdminContent(raw)) return null

  const startingPieces = raw.startingPieces
  const diceSequence = raw.diceSequence
  const obstacles = raw.obstacles ?? []

  // Curated content that cannot be won under the game's rules is rejected, so the caller falls
  // back to the built-in bank instead of serving an unwinnable puzzle with an invented target.
  const solved = solveLudoPuzzle(startingPieces, diceSequence, obstacles)
  if (!solved) return null
  const optimalRolls = solved.optimalRolls

  return {
    puzzleData: {
      startingPieces: startingPieces.map((p) => ({ ...p })),
      diceSequence: [...diceSequence],
      obstacles: obstacles.map((o) => ({ ...o })),
      optimalRolls,
      solution: { optimalRolls },
    },
    config: {
      timer,
      totalRolls: diceSequence.length,
    },
  }
}

// -- Verification -----------------------------------------------------------------

function simulateSubmission(
  puzzleData: LudoPuzzleData,
  submission: LudoPuzzleSubmission
): { tokensHome: number; rollsUsed: number; captures: number; solved: boolean } {
  const steps = orderedSteps(puzzleData.startingPieces)
  let obstacles = puzzleData.obstacles.map((o) => o.trackPos)
  let captures = 0
  let rollsUsed = 0
  let solved = steps.every((s) => s === FINISH_STEPS)

  const diceSequence = puzzleData.diceSequence
  const moves = submission.moves ?? []

  for (let i = 0; i < diceSequence.length && !solved; i++) {
    const roll = diceSequence[i]
    const choice = i < moves.length ? moves[i] : null
    rollsUsed = i + 1

    if (typeof choice === 'number' && choice >= 0 && choice < PIECE_COUNT) {
      const cur = steps[choice]
      let newSteps: number | null = null

      if (cur === -1) {
        if (roll === 6) newSteps = 0
      } else if (cur < FINISH_STEPS) {
        const candidate = cur + roll
        if (candidate <= FINISH_STEPS) newSteps = candidate
      }

      if (newSteps !== null) {
        steps[choice] = newSteps
        if (newSteps < HOME_ENTRY_STEPS && obstacles.includes(newSteps)) {
          obstacles = obstacles.filter((o) => o !== newSteps)
          captures++
        }
      }
      // An illegal choice (token can't legally use this roll) is treated
      // as a skip — the state simply doesn't change for this roll.
    }

    solved = steps.every((s) => s === FINISH_STEPS)
  }

  const tokensHome = steps.filter((s) => s === FINISH_STEPS).length
  return { tokensHome, rollsUsed, captures, solved }
}

export function verifyLudoPuzzleSubmission(
  puzzleData: LudoPuzzleData,
  submission: LudoPuzzleSubmission
): LudoPuzzleVerification {
  const { tokensHome, rollsUsed, captures, solved } = simulateSubmission(puzzleData, submission)

  const optimalRolls = puzzleData.optimalRolls

  if (!solved) {
    const partial = Math.max(0, captures * 50 + tokensHome * 100)
    return { score: partial, solved: false, tokensHome, rollsUsed, captures }
  }
  const raw = 1000 - (rollsUsed - optimalRolls) * 30 + captures * 50 + tokensHome * 100
  const score = Math.max(100, raw)

  return { score, solved: true, tokensHome, rollsUsed, captures }
}
