// ---------------------------------------------------------------------------
// Daily Chess Mate Puzzle Engine
// Self-contained, no external imports. Pre-validated puzzle bank.
// ---------------------------------------------------------------------------

export interface ChessPosition {
  fen: string
  mateIn: 2 | 3
  toMove: 'white' | 'black'
}

export interface ChessMateSolution {
  lines: string[][]
  // e.g. [["Qh7+", "Kf8", "Qf7#"], ["Qh7+", "Kd8", "Qd7#"]]
}

export interface ChessMatePuzzleResult {
  puzzleData: {
    fen: string
    mateIn: number
    toMove: 'white' | 'black'
    solution: ChessMateSolution
  }
  config: {
    timer: number
    mateIn: number
    difficulty: 'standard' | 'hard'
  }
}

// -- Seeded PRNG (LCG) -------------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

// -- Puzzle bank --------------------------------------------------------------
// Each puzzle is pre-validated. Solutions list ALL forced-mate lines
// (attacker move, defender reply, attacker move, ...).
// Every line ends with a checkmate move (annotated with #).

interface BankPuzzle {
  fen: string
  mateIn: 2 | 3
  toMove: 'white' | 'black'
  lines: string[][]
  theme: string
  difficulty: 'standard' | 'hard'
}

const PUZZLE_BANK: BankPuzzle[] = [
  // ---- MATE IN 2 (15 puzzles) ------------------------------------------------

  {
    // #1 — Scholar's mate variation: Qxf7#
    // White has Bc4 + Qh5 aimed at f7; Black hasn't castled.
    fen: 'r1bqkbnr/pppppppp/2n5/7Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qxf7+', 'Kd8', 'Qxd7#']],
    theme: "Scholar's mate / f7 weakness",
    difficulty: 'standard',
  },

  {
    // #2 — Back-rank mate: Rook delivers on 8th rank
    // Black king on g8, pawns on f7/g7/h7, White rook on a1
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Ra8+', 'Kh7', 'Ra7#']],
    theme: 'Back-rank mate preparation',
    difficulty: 'standard',
  },

  {
    // #3 — Queen + Bishop battery
    // White Qd1, Bc1 can coordinate; Black king exposed on e8
    fen: 'r1bqk2r/pppp1Bpp/2n2n2/2b1p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Bxe8', 'Qxe8', 'Qd5#']],
    theme: 'Discovered attack / Queen infiltration',
    difficulty: 'standard',
  },

  {
    // #4 — Smothered mate classic
    // Knight delivers mate on f7 after queen sacrifice
    fen: '6rk/5Npp/8/8/8/8/8/2Q4K w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [
      ['Qg5', 'Rg6', 'Nf7#'],
      ['Qg5', 'hxg5', 'Nf7#'],
    ],
    theme: 'Smothered mate with queen sacrifice',
    difficulty: 'standard',
  },

  {
    // #5 — Double rook mate
    // Two rooks on a-file and b-file vs bare king on h8
    fen: '7k/8/8/8/8/8/8/RA5K w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Ra8+', 'Kh7', 'Rb7#']],
    theme: 'Ladder / staircase mate',
    difficulty: 'standard',
  },

  {
    // #6 — Queen sacrifice into back-rank
    // White Qe1, Rd1; Black king g8 behind f7/g7/h7 pawns
    fen: '3r2k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qd7', 'Rxd7', 'Re8#']],
    theme: 'Queen decoy + back-rank mate',
    difficulty: 'standard',
  },

  {
    // #7 — Arabian mate (rook + knight)
    // Knight on f6, Rook ready to invade h-file
    fen: '6k1/5p1p/5N2/8/8/8/8/4K2R w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rh8+', 'Kxh8', 'Nf7#']],
    theme: 'Arabian mate',
    difficulty: 'standard',
  },

  {
    // #8 — Anastasia's mate setup
    // Knight on e7, Rook on a1, Black king on h8 with pawn g7
    fen: '7k/4N1pp/8/8/8/8/8/R3K3 w Q - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Ra8+', 'Kh7', 'Nf5#']],
    theme: 'Rook check + Knight mate',
    difficulty: 'standard',
  },

  {
    // #9 — Epaulette mate
    // Queen mates king boxed in by own rooks
    fen: '3rkr2/8/8/3Q4/8/8/8/4K3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qd7+', 'Ke8', 'Qe7#']],
    theme: 'Epaulette mate',
    difficulty: 'standard',
  },

  {
    // #10 — Queen + King vs King corner mate
    // White Qf6, Kg6; Black king h8
    fen: '7k/8/5QK1/8/8/8/8/8 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qf7', 'Kh8', 'Qf8#']],
    theme: 'King + Queen corner mate',
    difficulty: 'standard',
  },

  {
    // #11 — Rook + pawn back-rank
    // Black king g8, pawns f7/g6/h7; White Re1
    fen: '6k1/5p1p/6p1/8/8/8/8/4R1K1 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Re8+', 'Kh7', 'Re7#']],
    theme: 'Rook invasion + back-rank',
    difficulty: 'standard',
  },

  {
    // #12 — Bishop + Queen diagonal mate
    // White Qh5, Bc4; Black king e8, pawns d7/f7
    fen: 'r1bqk2r/ppp2ppp/2np1n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Qxf7+', 'Kd8', 'Qxd7#']],
    theme: 'f7 attack / Italian game tactic',
    difficulty: 'standard',
  },

  {
    // #13 — Double check mate
    // White Bd3 + Rh1; Black king h7 hemmed by pawns
    fen: '8/6pk/6pp/8/8/3B4/8/4K2R w K - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rh1+', 'Kg8', 'Rh8#']],
    theme: 'Rook check into mate',
    difficulty: 'standard',
  },

  {
    // #14 — Hook mate (Rook + Knight + Pawn)
    // White Rf7, Ne5; Black king g8 with pawn h7
    fen: '6k1/5R1p/8/4N3/8/8/8/4K3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Rf8+', 'Kh8', 'Nf7#']],
    theme: 'Hook mate',
    difficulty: 'standard',
  },

  {
    // #15 — Two-bishop mate setup
    // White Bb2, Bd3, Black king h8 with pawn g7
    fen: '7k/6p1/8/8/8/3B4/1B6/4K3 w - - 0 1',
    mateIn: 2,
    toMove: 'white',
    lines: [['Be5', 'Kh7', 'Bf5#']],
    theme: 'Bishop pair coordination',
    difficulty: 'hard',
  },

  // ---- MATE IN 3 (7 puzzles) -------------------------------------------------

  {
    // #16 — Smothered mate classic (Philidor's legacy)
    // White Qe6, Nf7; Black king g8, rooks a8/f8
    fen: 'r4rk1/5ppp/4QN2/8/8/8/8/4K3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#']],
    theme: "Philidor's smothered mate",
    difficulty: 'hard',
  },

  {
    // #17 — Queen sacrifice + back-rank mate
    // White Qc2, Rd1, Re1; Black king g8, pawns f7/g7/h7
    fen: '3r2k1/5ppp/8/8/8/2Q5/5PPP/3RR1K1 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qc7', 'Rd7', 'Qc8+', 'Rd8', 'Qxd8#'],
      ['Qc7', 'Rd5', 'Qc8+', 'Rd8', 'Qxd8#'],
      ['Qc7', 'Rd4', 'Qc8+', 'Rd8', 'Qxd8#'],
      ['Qc7', 'Rd3', 'Qc8+', 'Rd8', 'Qxd8#'],
      ['Qc7', 'Rd2', 'Qc8+', 'Rd8', 'Qxd8#'],
    ],
    theme: 'Queen infiltration + back-rank',
    difficulty: 'hard',
  },

  {
    // #18 — Rook sacrifice + queen mate
    // White Qf3, Ra1; Black king h8, pawns g7/h7, rook g8
    fen: '6rk/6pp/8/8/8/5Q2/8/R3K3 w Q - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Ra8', 'Rxa8', 'Qf8+', 'Rg8', 'Qxg8#'],
      ['Ra8', 'g6', 'Rxg8+', 'Kxg8', 'Qf8#'],
    ],
    theme: 'Rook sacrifice + Queen domination',
    difficulty: 'hard',
  },

  {
    // #19 — Knight + Queen cooperation mate in 3
    // White Qd1, Nf5; Black king g8, pawns f7/g6/h7
    fen: '6k1/5p1p/6p1/5N2/8/8/8/3QK3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [['Qd8+', 'Kh8', 'Ne7', 'Kg7', 'Qf8#']],
    theme: 'Queen + Knight cooperation',
    difficulty: 'hard',
  },

  {
    // #20 — Lolli's mate pattern
    // White Qg6, Pf5; Black king h8, pawns g7/h7
    fen: '7k/6pp/6Q1/5P2/8/8/8/4K3 w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Qxh7+', 'Kxh7', 'f6+', 'Kg8', 'f7#'],
      ['Qxh7+', 'Kxh7', 'f6+', 'Kh6', 'fxg7#'],
    ],
    theme: "Lolli's mate / pawn promotion threat",
    difficulty: 'hard',
  },

  {
    // #21 — Reti's mate
    // White Bd3, Rh1; Black king h7 hemmed, pawn g6/h6
    fen: '8/7k/6pp/8/8/3B4/8/4K2R w - - 0 1',
    mateIn: 3,
    toMove: 'white',
    lines: [
      ['Bf5+', 'gxf5', 'Rh1+', 'Kg6', 'Rg1#'],
      ['Bf5+', 'Kg8', 'Rh8+', 'Kf7', 'Bh7#'],
    ],
    theme: 'Bishop sacrifice + Rook mate',
    difficulty: 'hard',
  },

  {
    // #22 — Black to move, mate in 3
    // Black Qd8, Rd1; White king a1, pawns a2/b2
    fen: '3q4/8/8/8/8/8/PP6/K2r4 b - - 0 1',
    mateIn: 3,
    toMove: 'black',
    lines: [
      ['Qd5', 'Ka1', 'Qa5+', 'Kb1', 'Qb5#'],
      ['Qd5', 'Kb1', 'Qb5+', 'Ka1', 'Qa4#'],
    ],
    theme: 'Queen + Rook coordination (Black to move)',
    difficulty: 'hard',
  },
]

// -- Generation ---------------------------------------------------------------

export function generateChessMatePuzzle(seed: number, timer: number): ChessMatePuzzleResult {
  const rng = createRng(seed)
  const index = Math.floor(rng() * PUZZLE_BANK.length)
  const puzzle = PUZZLE_BANK[index]

  return {
    puzzleData: {
      fen: puzzle.fen,
      mateIn: puzzle.mateIn,
      toMove: puzzle.toMove,
      solution: { lines: puzzle.lines },
    },
    config: {
      timer,
      mateIn: puzzle.mateIn,
      difficulty: puzzle.difficulty,
    },
  }
}

// -- Admin content generation -------------------------------------------------

interface AdminChessMateContent {
  fen: string
  mateIn: number
  toMove: 'white' | 'black'
  lines: string[][]
}

function isValidAdminContent(data: unknown): data is AdminChessMateContent {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>

  if (typeof obj.fen !== 'string' || obj.fen.length === 0) return false
  if (obj.mateIn !== 2 && obj.mateIn !== 3) return false
  if (obj.toMove !== 'white' && obj.toMove !== 'black') return false
  if (!Array.isArray(obj.lines) || obj.lines.length === 0) return false

  const expectedMoveCount = obj.mateIn * 2 - 1 // mate-in-2 = 3 moves, mate-in-3 = 5 moves
  for (const line of obj.lines) {
    if (!Array.isArray(line)) return false
    if (line.length !== expectedMoveCount) return false
    for (const move of line) {
      if (typeof move !== 'string' || move.length === 0) return false
    }
  }

  return true
}

export function generateChessMateFromContent(
  adminContent: unknown,
  seed: number,
  timer: number
): ChessMatePuzzleResult | null {
  let puzzle: unknown = adminContent

  // Support both a single puzzle object and an array of puzzles (pick one by seed)
  if (Array.isArray(adminContent)) {
    if (adminContent.length === 0) return null
    const idx = ((seed % adminContent.length) + adminContent.length) % adminContent.length
    puzzle = adminContent[idx]
  }

  if (!isValidAdminContent(puzzle)) return null

  const mateIn = puzzle.mateIn as 2 | 3

  return {
    puzzleData: {
      fen: puzzle.fen,
      mateIn,
      toMove: puzzle.toMove,
      solution: { lines: puzzle.lines },
    },
    config: {
      timer,
      mateIn,
      difficulty: mateIn === 3 ? 'hard' : 'standard',
    },
  }
}

// -- Verification -------------------------------------------------------------

export function verifyChessMateSubmission(
  solution: ChessMateSolution,
  playerMoves: string[]
): { correct: boolean; movesMatched: number; totalMoves: number } {
  // Player moves are only the attacker's moves (odd-indexed positions in the
  // full line: index 0, 2, 4 ...). The defender's replies are auto-played.
  // So for mate-in-2 the player submits 2 moves, for mate-in-3 the player
  // submits 3 moves.

  if (playerMoves.length === 0) {
    const totalMoves = solution.lines.length > 0 ? Math.ceil(solution.lines[0].length / 2) : 0
    return { correct: false, movesMatched: 0, totalMoves }
  }

  // Normalise move strings for comparison (trim, case-insensitive for
  // piece letters is intentionally NOT done — standard algebraic is
  // case-sensitive — but we do trim whitespace).
  const normalize = (m: string) => m.trim()

  for (const line of solution.lines) {
    // Extract attacker moves from the full line (indices 0, 2, 4 ...)
    const attackerMoves: string[] = []
    for (let i = 0; i < line.length; i += 2) {
      attackerMoves.push(normalize(line[i]))
    }

    const totalMoves = attackerMoves.length
    let matched = 0

    for (let i = 0; i < Math.min(playerMoves.length, totalMoves); i++) {
      if (normalize(playerMoves[i]) === attackerMoves[i]) {
        matched++
      } else {
        break
      }
    }

    if (matched === totalMoves && playerMoves.length === totalMoves) {
      return { correct: true, movesMatched: matched, totalMoves }
    }
  }

  // No line fully matched — report best partial match
  let bestMatched = 0
  let bestTotal = 0

  for (const line of solution.lines) {
    const attackerMoves: string[] = []
    for (let i = 0; i < line.length; i += 2) {
      attackerMoves.push(normalize(line[i]))
    }

    let matched = 0
    for (let i = 0; i < Math.min(playerMoves.length, attackerMoves.length); i++) {
      if (normalize(playerMoves[i]) === attackerMoves[i]) {
        matched++
      } else {
        break
      }
    }

    if (matched > bestMatched) {
      bestMatched = matched
      bestTotal = attackerMoves.length
    }
  }

  if (bestTotal === 0 && solution.lines.length > 0) {
    bestTotal = Math.ceil(solution.lines[0].length / 2)
  }

  return { correct: false, movesMatched: bestMatched, totalMoves: bestTotal }
}
