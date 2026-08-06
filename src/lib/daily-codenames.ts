// ---------------------------------------------------------------------------
// Daily Codenames (solo) puzzle engine
// ---------------------------------------------------------------------------

export interface CodenamesPuzzle {
  grid: string[] // 25 words (displayed as 5x5)
  clue: string // the clue word, e.g. "OCEAN"
  clueNumber: number // how many words it points to, e.g. 3
  correctWords: string[] // the correct answers
}

export interface CodenamesPuzzleResult {
  puzzleData: {
    grid: string[]
    clue: string
    clueNumber: number
    solution: {
      correctWords: string[]
    }
  }
  config: {
    timer: number
    totalWords: number // = clueNumber
    gridSize: number // 25
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

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// -- Puzzle bank --------------------------------------------------------------

const PUZZLE_BANK: CodenamesPuzzle[] = [
  // 1
  {
    grid: [
      'WAVE',
      'SHELL',
      'REEF',
      'SAND',
      'MOUNTAIN',
      'FOREST',
      'RIVER',
      'CLOUD',
      'APPLE',
      'BRIDGE',
      'HAMMER',
      'FLAME',
      'MARBLE',
      'CROWN',
      'SILK',
      'TOWER',
      'FROST',
      'DRUM',
      'ANCHOR',
      'PEARL',
      'GARDEN',
      'COMPASS',
      'SHADOW',
      'CRYSTAL',
      'IRON',
    ],
    clue: 'OCEAN',
    clueNumber: 3,
    correctWords: ['WAVE', 'SHELL', 'REEF'],
  },
  // 2
  {
    grid: [
      'GUITAR',
      'PIANO',
      'STAGE',
      'CROWD',
      'TICKET',
      'TABLE',
      'CHAIR',
      'LAMP',
      'BOOK',
      'WINDOW',
      'ROOF',
      'FENCE',
      'DOOR',
      'WALL',
      'CARPET',
      'MIRROR',
      'CANDLE',
      'FRAME',
      'CURTAIN',
      'STUDIO',
      'RECORD',
      'VINYL',
      'SPEAKER',
      'SOLO',
      'ENCORE',
    ],
    clue: 'CONCERT',
    clueNumber: 4,
    correctWords: ['STAGE', 'CROWD', 'TICKET', 'ENCORE'],
  },
  // 3 — Nigerian food
  {
    grid: [
      'JOLLOF',
      'SUYA',
      'PEPPER',
      'EGUSI',
      'PLANTAIN',
      'ROCKET',
      'TIMBER',
      'NEEDLE',
      'ATLAS',
      'GLACIER',
      'RIBBON',
      'SOCKET',
      'RADAR',
      'PRISM',
      'BADGE',
      'VAULT',
      'LATCH',
      'CEDAR',
      'FLUTE',
      'ORBIT',
      'BLADE',
      'CANVAS',
      'PULSE',
      'SCROLL',
      'CREST',
    ],
    clue: 'NIGERIAN',
    clueNumber: 4,
    correctWords: ['JOLLOF', 'SUYA', 'EGUSI', 'PLANTAIN'],
  },
  // 4 — Space
  {
    grid: [
      'ROCKET',
      'ORBIT',
      'COMET',
      'NEBULA',
      'PLANET',
      'BRICK',
      'CHAIN',
      'SHOVEL',
      'PAINT',
      'GLASS',
      'THREAD',
      'COIN',
      'BERRY',
      'STOVE',
      'WHEEL',
      'PLANK',
      'TILE',
      'FOSSIL',
      'LANTERN',
      'QUILT',
      'SADDLE',
      'LEMON',
      'BASKET',
      'RIDGE',
      'TRUNK',
    ],
    clue: 'ASTRONAUT',
    clueNumber: 3,
    correctWords: ['ROCKET', 'ORBIT', 'COMET'],
  },
  // 5 — Cold / Winter
  {
    grid: [
      'FROST',
      'BLIZZARD',
      'IGLOO',
      'FURNACE',
      'MAGNET',
      'PARROT',
      'CABLE',
      'STAMP',
      'TROPHY',
      'PALACE',
      'ANCHOR',
      'BARREL',
      'CACTUS',
      'DIAMOND',
      'ENGINE',
      'FALCON',
      'GRAVEL',
      'HARBOR',
      'IVORY',
      'JUNGLE',
      'KETTLE',
      'MARBLE',
      'NAPKIN',
      'OLIVE',
      'PILLAR',
    ],
    clue: 'WINTER',
    clueNumber: 3,
    correctWords: ['FROST', 'BLIZZARD', 'IGLOO'],
  },
  // 6 — Kitchen
  {
    grid: [
      'KNIFE',
      'OVEN',
      'SPOON',
      'APRON',
      'TUNNEL',
      'BADGE',
      'CLIFF',
      'DAGGER',
      'ECLIPSE',
      'FERRY',
      'GEYSER',
      'HELMET',
      'ISLAND',
      'JASMINE',
      'KIOSK',
      'LEDGER',
      'MIST',
      'NECTAR',
      'ORCHID',
      'PEBBLE',
      'QUARRY',
      'RAVEN',
      'SUMMIT',
      'TEMPEST',
      'UMBRELLA',
    ],
    clue: 'CHEF',
    clueNumber: 4,
    correctWords: ['KNIFE', 'OVEN', 'SPOON', 'APRON'],
  },
  // 7 — Royalty
  {
    grid: [
      'CROWN',
      'THRONE',
      'SCEPTER',
      'CASTLE',
      'MOAT',
      'PISTON',
      'RADAR',
      'SIREN',
      'TOGA',
      'UTENSIL',
      'VERTEX',
      'WALNUT',
      'YARN',
      'ZENITH',
      'ACORN',
      'BRIDLE',
      'CHISEL',
      'DOME',
      'EMBER',
      'FLASK',
      'GORGE',
      'HULL',
      'INLET',
      'JADE',
      'KNOT',
    ],
    clue: 'KING',
    clueNumber: 3,
    correctWords: ['CROWN', 'THRONE', 'SCEPTER'],
  },
  // 8 — West African music
  {
    grid: [
      'AFROBEAT',
      'HIGHLIFE',
      'SHEKERE',
      'DJEMBE',
      'RHYTHM',
      'GLACIER',
      'ANVIL',
      'BEACON',
      'CORAL',
      'DUNE',
      'EMBER',
      'FOSSIL',
      'GROVE',
      'HAVEN',
      'IRIS',
      'JEWEL',
      'KAYAK',
      'LOTUS',
      'MEADOW',
      'NICHE',
      'OASIS',
      'PLUME',
      'QUARTZ',
      'RIDGE',
      'SPIRE',
    ],
    clue: 'LAGOS',
    clueNumber: 4,
    correctWords: ['AFROBEAT', 'HIGHLIFE', 'SHEKERE', 'DJEMBE'],
  },
  // 9 — Pirates
  {
    grid: [
      'TREASURE',
      'PARROT',
      'PLANK',
      'CANNON',
      'SAIL',
      'NEEDLE',
      'PILLOW',
      'SCREEN',
      'BUTTER',
      'CLOCK',
      'ZIPPER',
      'MAGNET',
      'PUZZLE',
      'ROCKET',
      'SUNSET',
      'VELVET',
      'WAFFLE',
      'ANCHOR',
      'BREEZE',
      'CRADLE',
      'FEATHER',
      'GOBLET',
      'HINGE',
      'LANTERN',
      'MIRROR',
    ],
    clue: 'PIRATE',
    clueNumber: 3,
    correctWords: ['TREASURE', 'PARROT', 'PLANK'],
  },
  // 10 — School
  {
    grid: [
      'CHALK',
      'DESK',
      'BELL',
      'PENCIL',
      'COMPASS',
      'HARBOR',
      'FLAME',
      'SERPENT',
      'TOWER',
      'VAULT',
      'BASKET',
      'CANOPY',
      'DAGGER',
      'EAGLE',
      'FLINT',
      'GARNET',
      'HOLLOW',
      'IVORY',
      'JACKAL',
      'KERNEL',
      'LATCH',
      'MURAL',
      'NIMBLE',
      'OXIDE',
      'PRISM',
    ],
    clue: 'CLASSROOM',
    clueNumber: 4,
    correctWords: ['CHALK', 'DESK', 'BELL', 'PENCIL'],
  },
  // 11 — Hospital / Medicine
  {
    grid: [
      'SCALPEL',
      'NURSE',
      'WARD',
      'SYRINGE',
      'GAVEL',
      'ATLAS',
      'BUGLE',
      'CELLAR',
      'DEPOT',
      'EASEL',
      'FUNNEL',
      'GROTTO',
      'HARNESS',
      'INGOT',
      'JIGSAW',
      'KILN',
      'LEVER',
      'MORTAR',
      'NOTCH',
      'OUTPOST',
      'PLIERS',
      'QUARRY',
      'RAPTOR',
      'SPINDLE',
      'TURRET',
    ],
    clue: 'SURGEON',
    clueNumber: 3,
    correctWords: ['SCALPEL', 'NURSE', 'SYRINGE'],
  },
  // 12 — Garden
  {
    grid: [
      'PETAL',
      'THORN',
      'SOIL',
      'BLOOM',
      'HEDGE',
      'ANVIL',
      'BEACON',
      'CLAMP',
      'DRILL',
      'ENIGMA',
      'FORGE',
      'GRILLE',
      'HATCH',
      'ICICLE',
      'JOUST',
      'KEEL',
      'LINTEL',
      'MODEM',
      'NOZZLE',
      'OBELISK',
      'PARCEL',
      'QUILL',
      'RIVET',
      'STRUT',
      'TRELLIS',
    ],
    clue: 'ROSE',
    clueNumber: 3,
    correctWords: ['PETAL', 'THORN', 'BLOOM'],
  },
  // 13 — Nigerian cities / landmarks
  {
    grid: [
      'ABUJA',
      'LAGOS',
      'BENIN',
      'KANO',
      'CALABAR',
      'SUMMIT',
      'PRISM',
      'CRATE',
      'LEVER',
      'ANVIL',
      'BEACON',
      'CORAL',
      'DUNE',
      'EMBER',
      'FOSSIL',
      'GROVE',
      'HAVEN',
      'IRIS',
      'JEWEL',
      'KAYAK',
      'LOTUS',
      'MEADOW',
      'NICHE',
      'OASIS',
      'PLUME',
    ],
    clue: 'NIGERIA',
    clueNumber: 4,
    correctWords: ['ABUJA', 'LAGOS', 'KANO', 'CALABAR'],
  },
  // 14 — Fire
  {
    grid: [
      'EMBER',
      'ASH',
      'SMOKE',
      'TORCH',
      'GLACIER',
      'ANCHOR',
      'BARREL',
      'CHISEL',
      'DOME',
      'FLASK',
      'GORGE',
      'HULL',
      'INLET',
      'JADE',
      'KNOT',
      'LEDGE',
      'MARSH',
      'NERVE',
      'ORBIT',
      'PIVOT',
      'QUILT',
      'RAMP',
      'SILO',
      'TRENCH',
      'WICK',
    ],
    clue: 'CAMPFIRE',
    clueNumber: 4,
    correctWords: ['EMBER', 'ASH', 'SMOKE', 'TORCH'],
  },
  // 15 — Music instruments
  {
    grid: [
      'VIOLIN',
      'CELLO',
      'FLUTE',
      'OBOE',
      'HARP',
      'CRANE',
      'DIESEL',
      'ECLIPSE',
      'FERRY',
      'GEYSER',
      'HELMET',
      'ISLAND',
      'JASMINE',
      'KIOSK',
      'LANTERN',
      'MAGNET',
      'NAPKIN',
      'OLIVE',
      'PILLAR',
      'QUARRY',
      'RAVEN',
      'SUMMIT',
      'TEMPEST',
      'UMBRELLA',
      'VORTEX',
    ],
    clue: 'ORCHESTRA',
    clueNumber: 4,
    correctWords: ['VIOLIN', 'CELLO', 'FLUTE', 'HARP'],
  },
  // 16 — Treasure / wealth
  {
    grid: [
      'GOLD',
      'RUBY',
      'DIAMOND',
      'SAPPHIRE',
      'EMERALD',
      'BRICK',
      'CABLE',
      'DAGGER',
      'FALCON',
      'GRAVEL',
      'HARBOR',
      'IVORY',
      'JUNGLE',
      'KETTLE',
      'LATCH',
      'MURAL',
      'NIMBLE',
      'OXIDE',
      'PEBBLE',
      'QUARTZ',
      'RIDGE',
      'SPIRE',
      'TUNNEL',
      'UTENSIL',
      'VERTEX',
    ],
    clue: 'JEWEL',
    clueNumber: 3,
    correctWords: ['RUBY', 'SAPPHIRE', 'EMERALD'],
  },
  // 17 — Travel / transport
  {
    grid: [
      'PASSPORT',
      'LUGGAGE',
      'RUNWAY',
      'TICKET',
      'CUSTOMS',
      'ACORN',
      'BRIDLE',
      'CHISEL',
      'DOME',
      'EMBER',
      'FLASK',
      'GORGE',
      'HULL',
      'INLET',
      'JADE',
      'KNOT',
      'LEDGE',
      'MARSH',
      'NERVE',
      'ORBIT',
      'PIVOT',
      'QUILT',
      'RAMP',
      'SILO',
      'TRENCH',
    ],
    clue: 'AIRPORT',
    clueNumber: 4,
    correctWords: ['PASSPORT', 'LUGGAGE', 'RUNWAY', 'CUSTOMS'],
  },
  // 18 — Water (2-word clue)
  {
    grid: [
      'PUDDLE',
      'STREAM',
      'GUTTER',
      'DRAIN',
      'UMBRELLA',
      'CANVAS',
      'DIESEL',
      'FALCON',
      'GRAVEL',
      'HARBOR',
      'IVORY',
      'JUNGLE',
      'KETTLE',
      'LATCH',
      'MURAL',
      'NIMBLE',
      'OXIDE',
      'PEBBLE',
      'QUARTZ',
      'RIDGE',
      'SPIRE',
      'TUNNEL',
      'UTENSIL',
      'VERTEX',
      'WALNUT',
    ],
    clue: 'RAIN',
    clueNumber: 2,
    correctWords: ['PUDDLE', 'UMBRELLA'],
  },
]

// -- Generator ----------------------------------------------------------------

export function generateCodenamesPuzzle(seed: number, timer: number): CodenamesPuzzleResult {
  const rng = createRng(seed)
  const puzzleIndex = ((seed % PUZZLE_BANK.length) + PUZZLE_BANK.length) % PUZZLE_BANK.length
  const puzzle = PUZZLE_BANK[puzzleIndex]

  // Shuffle grid order deterministically
  const shuffledGrid = shuffleArray(puzzle.grid, rng)

  return {
    puzzleData: {
      grid: shuffledGrid,
      clue: puzzle.clue,
      clueNumber: puzzle.clueNumber,
      solution: {
        correctWords: [...puzzle.correctWords],
      },
    },
    config: {
      timer,
      totalWords: puzzle.clueNumber,
      gridSize: 25,
    },
  }
}

// -- Admin content generator --------------------------------------------------

interface AdminCodenamesContent {
  grid: string[]
  clue: string
  clueNumber: number
  correctWords: string[]
}

function isValidAdminContent(content: unknown): content is AdminCodenamesContent {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>

  if (!Array.isArray(c.grid) || c.grid.length !== 25) return false
  if (c.grid.some((w: unknown) => typeof w !== 'string' || w === '')) return false

  if (typeof c.clue !== 'string' || c.clue === '') return false
  if (typeof c.clueNumber !== 'number' || !Number.isInteger(c.clueNumber) || c.clueNumber < 1) return false

  if (!Array.isArray(c.correctWords) || c.correctWords.length !== c.clueNumber) return false
  if (c.correctWords.some((w: unknown) => typeof w !== 'string' || w === '')) return false

  // All correct words must appear in the grid
  const gridSet = new Set(c.grid as string[])
  for (const w of c.correctWords as string[]) {
    if (!gridSet.has(w)) return false
  }

  return true
}

export function generateCodenamesFromContent(
  adminContent: unknown,
  seed: number,
  timer: number
): CodenamesPuzzleResult | null {
  if (!isValidAdminContent(adminContent)) return null

  const rng = createRng(seed)
  const shuffledGrid = shuffleArray(adminContent.grid, rng)

  return {
    puzzleData: {
      grid: shuffledGrid,
      clue: adminContent.clue,
      clueNumber: adminContent.clueNumber,
      solution: {
        correctWords: [...adminContent.correctWords],
      },
    },
    config: {
      timer,
      totalWords: adminContent.clueNumber,
      gridSize: 25,
    },
  }
}
