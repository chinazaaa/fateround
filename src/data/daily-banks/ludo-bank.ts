export interface LudoPuzzle {
  startingPieces: Array<{
    id: 0 | 1 | 2 | 3
    zone: 'base' | 'track' | 'home' | 'finished'
    pos: number // track: 0-51, home: 0-4, base/finished: 0
  }>
  diceSequence: number[] // each 1-6
  optimalRolls: number
  obstacles?: Array<{ trackPos: number }>
}

export const LUDO_BANK: LudoPuzzle[] = [
  // ── Easy (15 puzzles): 2-3 tokens on track/home, short sequences ──────

  // 1 — Two tokens in home stretch, close to finish
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 3 },
      { id: 1, zone: 'home', pos: 4 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [2, 1, 3, 4],
    optimalRolls: 2,
  },

  // 2 — Three finished, one in home
  {
    startingPieces: [
      { id: 0, zone: 'finished', pos: 0 },
      { id: 1, zone: 'finished', pos: 0 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'home', pos: 2 },
    ],
    diceSequence: [3, 1, 5],
    optimalRolls: 1,
  },

  // 3 — Two tokens near end of track
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 50 },
      { id: 1, zone: 'home', pos: 3 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [2, 2, 5, 1],
    optimalRolls: 2,
  },

  // 4 — All in home stretch
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 4 },
      { id: 1, zone: 'home', pos: 3 },
      { id: 2, zone: 'home', pos: 2 },
      { id: 3, zone: 'home', pos: 1 },
    ],
    diceSequence: [1, 2, 3, 4, 5, 6],
    optimalRolls: 4,
  },

  // 5 — One on track, rest finished
  {
    startingPieces: [
      { id: 0, zone: 'finished', pos: 0 },
      { id: 1, zone: 'finished', pos: 0 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'track', pos: 48 },
    ],
    diceSequence: [4, 3, 2, 6, 1, 5],
    optimalRolls: 2,
  },

  // 6 — Two in home, two finished
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 0 },
      { id: 1, zone: 'home', pos: 1 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [5, 4, 3, 2, 1],
    optimalRolls: 2,
  },

  // 7 — Three in home
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 2 },
      { id: 1, zone: 'home', pos: 3 },
      { id: 2, zone: 'home', pos: 4 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [3, 2, 1, 5, 4],
    optimalRolls: 3,
  },

  // 8 — One track, one home, two finished
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 49 },
      { id: 1, zone: 'home', pos: 2 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [3, 3, 2, 5],
    optimalRolls: 2,
  },

  // 9 — Quick finish from home
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 4 },
      { id: 1, zone: 'home', pos: 4 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [1, 1, 3, 4],
    optimalRolls: 2,
  },

  // 10 — Track close to home entry
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 51 },
      { id: 1, zone: 'finished', pos: 0 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [1, 6, 3, 2, 4],
    optimalRolls: 2,
  },

  // 11 — Two tokens, short run
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 1 },
      { id: 1, zone: 'track', pos: 50 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [4, 2, 3, 6, 1],
    optimalRolls: 3,
  },

  // 12 — Two home, straightforward
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 0 },
      { id: 1, zone: 'home', pos: 4 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [5, 1, 3, 4, 2],
    optimalRolls: 2,
  },

  // 13 — Single token home stretch
  {
    startingPieces: [
      { id: 0, zone: 'finished', pos: 0 },
      { id: 1, zone: 'finished', pos: 0 },
      { id: 2, zone: 'home', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [5, 2, 3],
    optimalRolls: 1,
  },

  // 14 — Three home, one finished
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 3 },
      { id: 1, zone: 'home', pos: 2 },
      { id: 2, zone: 'home', pos: 1 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [2, 3, 4, 1, 5],
    optimalRolls: 3,
  },

  // 15 — One far on track
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 47 },
      { id: 1, zone: 'finished', pos: 0 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [5, 4, 6, 3, 2, 1],
    optimalRolls: 3,
  },

  // ── Medium (15 puzzles): mixed positions, 6-8 rolls ───────────────────

  // 16 — Mix of track and home
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 40 },
      { id: 1, zone: 'track', pos: 45 },
      { id: 2, zone: 'home', pos: 2 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 5, 3, 4, 2, 1, 6, 5],
    optimalRolls: 6,
  },

  // 17 — One in base needs a 6
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'home', pos: 3 },
      { id: 2, zone: 'home', pos: 4 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 2, 1, 5, 4, 3, 6, 2],
    optimalRolls: 6,
  },

  // 18 — Two on track mid-way
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 30 },
      { id: 1, zone: 'track', pos: 35 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 5, 4, 3, 6, 2, 5, 1],
    optimalRolls: 7,
  },

  // 19 — Three active tokens
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 48 },
      { id: 1, zone: 'track', pos: 44 },
      { id: 2, zone: 'home', pos: 1 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [4, 3, 4, 5, 6, 2, 3, 1],
    optimalRolls: 6,
  },

  // 20 — Base + track combo
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'track', pos: 42 },
      { id: 2, zone: 'home', pos: 3 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 5, 2, 4, 6, 3, 5, 1],
    optimalRolls: 7,
  },

  // 21 — Two bases need sixes
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'base', pos: 0 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 6, 5, 4, 3, 6, 5, 4, 3, 2, 1],
    optimalRolls: 8,
  },

  // 22 — Track spread
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 20 },
      { id: 1, zone: 'track', pos: 38 },
      { id: 2, zone: 'track', pos: 50 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 5, 4, 3, 2, 6, 5, 4, 3, 1],
    optimalRolls: 8,
  },

  // 23 — Home stretch puzzle
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 0 },
      { id: 1, zone: 'home', pos: 1 },
      { id: 2, zone: 'track', pos: 46 },
      { id: 3, zone: 'track', pos: 49 },
    ],
    diceSequence: [5, 4, 6, 3, 3, 2, 1, 5],
    optimalRolls: 6,
  },

  // 24 — One base, two track, one home
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'track', pos: 36 },
      { id: 2, zone: 'track', pos: 48 },
      { id: 3, zone: 'home', pos: 2 },
    ],
    diceSequence: [6, 3, 4, 5, 6, 2, 4, 3, 1],
    optimalRolls: 8,
  },

  // 25 — Mid-track pair
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 25 },
      { id: 1, zone: 'track', pos: 25 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 6, 5, 5, 4, 4, 3, 3, 2],
    optimalRolls: 8,
  },

  // 26 — Close to home entry
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 50 },
      { id: 1, zone: 'track', pos: 49 },
      { id: 2, zone: 'track', pos: 48 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [2, 3, 4, 5, 5, 5, 6, 1],
    optimalRolls: 6,
  },

  // 27 — One base, rest near finish
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'home', pos: 4 },
      { id: 2, zone: 'home', pos: 3 },
      { id: 3, zone: 'home', pos: 2 },
    ],
    diceSequence: [1, 2, 3, 6, 5, 4, 3, 2],
    optimalRolls: 7,
  },

  // 28 — Track and home mix
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 43 },
      { id: 1, zone: 'home', pos: 0 },
      { id: 2, zone: 'home', pos: 2 },
      { id: 3, zone: 'track', pos: 51 },
    ],
    diceSequence: [5, 3, 1, 6, 4, 2, 5, 3],
    optimalRolls: 7,
  },

  // 29 — Long track runs
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 32 },
      { id: 1, zone: 'track', pos: 40 },
      { id: 2, zone: 'finished', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [6, 5, 6, 4, 5, 3, 4, 2, 1],
    optimalRolls: 7,
  },

  // 30 — Three tokens active
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 44 },
      { id: 1, zone: 'track', pos: 47 },
      { id: 2, zone: 'home', pos: 0 },
      { id: 3, zone: 'finished', pos: 0 },
    ],
    diceSequence: [5, 5, 5, 4, 3, 6, 2, 1],
    optimalRolls: 6,
  },

  // ── Hard (10 puzzles): spread out, 8-12 rolls, some with obstacles ────

  // 31 — All four active, obstacles
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 10 },
      { id: 1, zone: 'track', pos: 25 },
      { id: 2, zone: 'track', pos: 40 },
      { id: 3, zone: 'home', pos: 0 },
    ],
    diceSequence: [6, 5, 4, 3, 6, 5, 4, 3, 2, 6, 5, 1],
    optimalRolls: 10,
    obstacles: [{ trackPos: 15 }, { trackPos: 30 }],
  },

  // 32 — Three in base
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'base', pos: 0 },
      { id: 2, zone: 'base', pos: 0 },
      { id: 3, zone: 'home', pos: 3 },
    ],
    diceSequence: [6, 6, 6, 2, 5, 4, 6, 3, 5, 4, 6, 3, 2, 1],
    optimalRolls: 12,
    obstacles: [{ trackPos: 20 }],
  },

  // 33 — All four from base
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'base', pos: 0 },
      { id: 2, zone: 'base', pos: 0 },
      { id: 3, zone: 'base', pos: 0 },
    ],
    diceSequence: [6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3],
    optimalRolls: 12,
  },

  // 34 — Spread with obstacles
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 5 },
      { id: 1, zone: 'track', pos: 18 },
      { id: 2, zone: 'track', pos: 35 },
      { id: 3, zone: 'track', pos: 48 },
    ],
    diceSequence: [6, 5, 4, 6, 3, 5, 6, 4, 3, 2, 5, 1],
    optimalRolls: 10,
    obstacles: [{ trackPos: 10 }, { trackPos: 22 }, { trackPos: 40 }],
  },

  // 35 — Two base, two track
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'base', pos: 0 },
      { id: 2, zone: 'track', pos: 30 },
      { id: 3, zone: 'track', pos: 42 },
    ],
    diceSequence: [6, 6, 5, 4, 6, 3, 5, 4, 6, 3, 2, 5],
    optimalRolls: 10,
    obstacles: [{ trackPos: 35 }],
  },

  // 36 — Complex home entries
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 48 },
      { id: 1, zone: 'track', pos: 49 },
      { id: 2, zone: 'track', pos: 50 },
      { id: 3, zone: 'track', pos: 51 },
    ],
    diceSequence: [4, 3, 2, 1, 5, 5, 5, 5, 3, 2, 1, 4],
    optimalRolls: 8,
    obstacles: [{ trackPos: 51 }],
  },

  // 37 — Base + far track + obstacles
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'track', pos: 8 },
      { id: 2, zone: 'track', pos: 22 },
      { id: 3, zone: 'home', pos: 1 },
    ],
    diceSequence: [6, 4, 5, 6, 3, 5, 4, 6, 3, 2, 5, 1],
    optimalRolls: 10,
    obstacles: [{ trackPos: 12 }, { trackPos: 28 }],
  },

  // 38 — Crowded home stretch
  {
    startingPieces: [
      { id: 0, zone: 'home', pos: 0 },
      { id: 1, zone: 'home', pos: 1 },
      { id: 2, zone: 'track', pos: 15 },
      { id: 3, zone: 'base', pos: 0 },
    ],
    diceSequence: [5, 4, 6, 6, 5, 4, 3, 6, 5, 4, 3, 2],
    optimalRolls: 10,
    obstacles: [{ trackPos: 20 }, { trackPos: 45 }],
  },

  // 39 — Maximum spread
  {
    startingPieces: [
      { id: 0, zone: 'base', pos: 0 },
      { id: 1, zone: 'track', pos: 3 },
      { id: 2, zone: 'track', pos: 28 },
      { id: 3, zone: 'track', pos: 47 },
    ],
    diceSequence: [6, 5, 6, 4, 5, 6, 3, 4, 5, 3, 2, 6, 1],
    optimalRolls: 11,
    obstacles: [{ trackPos: 8 }, { trackPos: 33 }, { trackPos: 50 }],
  },

  // 40 — Endgame crunch
  {
    startingPieces: [
      { id: 0, zone: 'track', pos: 38 },
      { id: 1, zone: 'track', pos: 41 },
      { id: 2, zone: 'base', pos: 0 },
      { id: 3, zone: 'base', pos: 0 },
    ],
    diceSequence: [6, 6, 5, 5, 4, 4, 6, 3, 5, 3, 6, 2, 1],
    optimalRolls: 11,
    obstacles: [{ trackPos: 43 }, { trackPos: 49 }],
  },
]
