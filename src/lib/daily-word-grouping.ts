// ---------------------------------------------------------------------------
// Daily Word Grouping (Connections-style) puzzle engine
// ---------------------------------------------------------------------------
// Self-contained, no external imports. Pure functions safe for client + server.
// ---------------------------------------------------------------------------

// ---- Public types ---------------------------------------------------------

export interface WordGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

export interface WordGroupingPuzzleResult {
  puzzleData: {
    words: string[]
    solution: {
      groups: WordGroup[]
    }
  }
  config: {
    timer: number
    totalGroups: number
    maxMistakes: number
  }
}

// ---- Seeded PRNG (LCG) ---------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

/** Fisher-Yates shuffle using the seeded RNG. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// ---- Puzzle bank ----------------------------------------------------------

interface BankPuzzle {
  groups: [WordGroup, WordGroup, WordGroup, WordGroup]
}

const PUZZLE_BANK: BankPuzzle[] = [
  // 1
  {
    groups: [
      { category: 'Shades of blue', words: ['Navy', 'Cyan', 'Teal', 'Cobalt'], difficulty: 1 },
      { category: 'Card games', words: ['Bridge', 'Poker', 'Snap', 'Rummy'], difficulty: 2 },
      { category: 'Things that are round', words: ['Globe', 'Wheel', 'Ring', 'Coin'], difficulty: 3 },
      { category: '___ ball', words: ['Basket', 'Foot', 'Base', 'Snow'], difficulty: 4 },
    ],
  },
  // 2
  {
    groups: [
      { category: 'Baked goods', words: ['Croissant', 'Muffin', 'Scone', 'Bagel'], difficulty: 1 },
      { category: 'Musical instruments', words: ['Drum', 'Flute', 'Harp', 'Cello'], difficulty: 2 },
      { category: 'Weather phenomena', words: ['Thunder', 'Breeze', 'Drizzle', 'Frost'], difficulty: 3 },
      { category: 'Types of dance', words: ['Waltz', 'Salsa', 'Tango', 'Swing'], difficulty: 4 },
    ],
  },
  // 3
  {
    groups: [
      { category: 'Planets', words: ['Mars', 'Venus', 'Saturn', 'Mercury'], difficulty: 1 },
      { category: 'Units of time', words: ['Second', 'Minute', 'Quarter', 'Season'], difficulty: 2 },
      { category: 'Things with keys', words: ['Piano', 'Lock', 'Laptop', 'Map'], difficulty: 3 },
      { category: 'Candy bars', words: ['Bounty', 'Eclipse', 'Galaxy', 'Milky Way'], difficulty: 4 },
    ],
  },
  // 4 – Nigerian cities + overlap-bait
  {
    groups: [
      { category: 'Nigerian cities', words: ['Lagos', 'Abuja', 'Enugu', 'Kano'], difficulty: 1 },
      { category: 'Fabrics', words: ['Silk', 'Lace', 'Velvet', 'Denim'], difficulty: 2 },
      { category: 'Things that flow', words: ['River', 'Traffic', 'Current', 'Lava'], difficulty: 3 },
      { category: '___ work', words: ['Net', 'Frame', 'Team', 'Home'], difficulty: 4 },
    ],
  },
  // 5
  {
    groups: [
      { category: 'Fruits', words: ['Mango', 'Plum', 'Date', 'Fig'], difficulty: 1 },
      { category: 'Parts of a book', words: ['Spine', 'Cover', 'Index', 'Title'], difficulty: 2 },
      { category: 'Things that can be blind', words: ['Spot', 'Fold', 'Side', 'Date'], difficulty: 3 },
      { category: 'Email actions', words: ['Draft', 'Forward', 'Reply', 'Archive'], difficulty: 4 },
    ],
  },
  // 6 – Jollof ingredients + Nigerian culture
  {
    groups: [
      { category: 'Jollof rice ingredients', words: ['Tomato', 'Onion', 'Pepper', 'Rice'], difficulty: 1 },
      { category: 'Nollywood actors', words: ['Genevieve', 'Ramsey', 'Omotola', 'Funke'], difficulty: 2 },
      { category: 'Currencies', words: ['Naira', 'Pound', 'Dollar', 'Franc'], difficulty: 3 },
      { category: 'Words meaning "plenty"', words: ['Plenty', 'Surplus', 'Excess', 'Abundance'], difficulty: 4 },
    ],
  },
  // 7
  {
    groups: [
      { category: 'Dog breeds', words: ['Boxer', 'Pug', 'Pointer', 'Setter'], difficulty: 1 },
      { category: 'Kitchen tools', words: ['Whisk', 'Grater', 'Ladle', 'Tongs'], difficulty: 2 },
      { category: 'Things that pop', words: ['Corn', 'Bubble', 'Cork', 'Balloon'], difficulty: 3 },
      { category: 'Printer terms', words: ['Ink', 'Toner', 'Feed', 'Jam'], difficulty: 4 },
    ],
  },
  // 8
  {
    groups: [
      { category: 'Zodiac signs', words: ['Leo', 'Virgo', 'Libra', 'Aries'], difficulty: 1 },
      { category: 'Coffee drinks', words: ['Latte', 'Mocha', 'Espresso', 'Macchiato'], difficulty: 2 },
      { category: 'Things with legs', words: ['Table', 'Spider', 'Chair', 'Journey'], difficulty: 3 },
      { category: 'Apple ___', words: ['Sauce', 'Seed', 'Jack', 'Pie'], difficulty: 4 },
    ],
  },
  // 9
  {
    groups: [
      { category: 'Shades of red', words: ['Crimson', 'Scarlet', 'Ruby', 'Maroon'], difficulty: 1 },
      { category: 'Board games', words: ['Chess', 'Risk', 'Clue', 'Life'], difficulty: 2 },
      { category: 'Things with rings', words: ['Saturn', 'Phone', 'Tree', 'Circus'], difficulty: 3 },
      { category: 'Double ___', words: ['Dutch', 'Cross', 'Take', 'Check'], difficulty: 4 },
    ],
  },
  // 10 – West African food + overlap
  {
    groups: [
      { category: 'West African dishes', words: ['Suya', 'Egusi', 'Pounded', 'Akara'], difficulty: 1 },
      { category: 'Things that stick', words: ['Glue', 'Tape', 'Gum', 'Velcro'], difficulty: 2 },
      { category: 'Music genres', words: ['Afrobeats', 'Jazz', 'Reggae', 'Blues'], difficulty: 3 },
      { category: '___ house', words: ['Ware', 'Power', 'Green', 'Light'], difficulty: 4 },
    ],
  },
  // 11
  {
    groups: [
      { category: 'Ocean creatures', words: ['Whale', 'Squid', 'Urchin', 'Ray'], difficulty: 1 },
      { category: 'Types of jacket', words: ['Blazer', 'Parka', 'Bomber', 'Duster'], difficulty: 2 },
      { category: 'Things that break', words: ['Dawn', 'Ice', 'News', 'Record'], difficulty: 3 },
      { category: 'Sun ___', words: ['Flower', 'Burn', 'Set', 'Roof'], difficulty: 4 },
    ],
  },
  // 12
  {
    groups: [
      { category: 'Olympic sports', words: ['Fencing', 'Rowing', 'Diving', 'Boxing'], difficulty: 1 },
      { category: 'Pasta shapes', words: ['Penne', 'Fusilli', 'Rigatoni', 'Orzo'], difficulty: 2 },
      { category: 'Things with scales', words: ['Fish', 'Dragon', 'Map', 'Piano'], difficulty: 3 },
      { category: 'Fire ___', words: ['Truck', 'Place', 'Fly', 'Work'], difficulty: 4 },
    ],
  },
  // 13
  {
    groups: [
      { category: 'Trees', words: ['Oak', 'Pine', 'Maple', 'Cedar'], difficulty: 1 },
      { category: 'Things in a wallet', words: ['Card', 'Cash', 'Receipt', 'License'], difficulty: 2 },
      { category: 'Types of pitch', words: ['Sales', 'Perfect', 'Tar', 'Cricket'], difficulty: 3 },
      { category: 'Words before "stone"', words: ['Key', 'Lime', 'Mile', 'Corner'], difficulty: 4 },
    ],
  },
  // 14
  {
    groups: [
      { category: 'Vegetables', words: ['Carrot', 'Spinach', 'Celery', 'Radish'], difficulty: 1 },
      { category: 'Dances from Latin America', words: ['Samba', 'Rumba', 'Mambo', 'Cha-cha'], difficulty: 2 },
      { category: 'Things that have caps', words: ['Bottle', 'Mushroom', 'Pen', 'Salary'], difficulty: 3 },
      { category: 'Iron ___', words: ['Clad', 'Man', 'Ore', 'Curtain'], difficulty: 4 },
    ],
  },
  // 15 – Nigerian languages + overlap-bait
  {
    groups: [
      { category: 'Nigerian languages', words: ['Yoruba', 'Igbo', 'Hausa', 'Pidgin'], difficulty: 1 },
      { category: 'Precious stones', words: ['Diamond', 'Emerald', 'Opal', 'Jade'], difficulty: 2 },
      { category: 'Things that can be sharp', words: ['Tongue', 'Turn', 'Knife', 'Cheddar'], difficulty: 3 },
      { category: '___ light', words: ['Flash', 'Moon', 'Spot', 'Star'], difficulty: 4 },
    ],
  },
  // 16
  {
    groups: [
      { category: 'Hats', words: ['Beret', 'Fedora', 'Turban', 'Beanie'], difficulty: 1 },
      { category: 'Bridges', words: ['London', 'Golden', 'Tower', 'Brooklyn'], difficulty: 2 },
      { category: 'Things that run', words: ['Nose', 'River', 'Clock', 'Stocking'], difficulty: 3 },
      { category: 'Green ___', words: ['House', 'Card', 'Horn', 'Land'], difficulty: 4 },
    ],
  },
  // 17
  {
    groups: [
      { category: 'Spices', words: ['Cumin', 'Clove', 'Thyme', 'Nutmeg'], difficulty: 1 },
      { category: 'Footwear', words: ['Loafer', 'Sandal', 'Stiletto', 'Clog'], difficulty: 2 },
      { category: 'Things that bloom', words: ['Flower', 'Algae', 'Youth', 'Romance'], difficulty: 3 },
      { category: 'Black ___', words: ['Berry', 'Board', 'Smith', 'Market'], difficulty: 4 },
    ],
  },
  // 18 – Nigerian music + overlap
  {
    groups: [
      { category: 'Nigerian music artists', words: ['Burna', 'Wizkid', 'Davido', 'Tiwa'], difficulty: 1 },
      { category: 'Types of chart', words: ['Bar', 'Pie', 'Line', 'Flow'], difficulty: 2 },
      { category: 'Things that are golden', words: ['Gate', 'Rule', 'Age', 'Ratio'], difficulty: 3 },
      { category: 'Water ___', words: ['Fall', 'Mark', 'Proof', 'Melon'], difficulty: 4 },
    ],
  },
]

// ---- Main generator -------------------------------------------------------

export function generateWordGroupingPuzzle(seed: number, timer: number): WordGroupingPuzzleResult {
  const rng = createRng(seed)

  // Pick a puzzle deterministically
  const idx = ((seed % PUZZLE_BANK.length) + PUZZLE_BANK.length) % PUZZLE_BANK.length
  const puzzle = PUZZLE_BANK[idx]

  // Collect all 16 words, then shuffle
  const allWords = puzzle.groups.flatMap((g) => g.words)
  const shuffled = shuffle(allWords, rng)

  return {
    puzzleData: {
      words: shuffled,
      solution: {
        groups: puzzle.groups.map((g) => ({ ...g, words: [...g.words] })),
      },
    },
    config: {
      timer,
      totalGroups: 4,
      maxMistakes: 4,
    },
  }
}

// ---- Admin content generator ----------------------------------------------

export function generateWordGroupingFromContent(
  adminContent: unknown,
  seed: number,
  timer: number
): WordGroupingPuzzleResult | null {
  let puzzle: unknown = adminContent

  // Support an array of puzzles (pick one by seed)
  if (Array.isArray(adminContent)) {
    if (adminContent.length === 0) return null
    const idx = ((seed % adminContent.length) + adminContent.length) % adminContent.length
    puzzle = adminContent[idx]
  }

  if (!puzzle || typeof puzzle !== 'object') return null

  const content = puzzle as Record<string, unknown>
  if (!Array.isArray(content.groups)) return null

  const groups = content.groups as unknown[]
  if (groups.length !== 4) return null

  const parsed: WordGroup[] = []

  for (const raw of groups) {
    if (!raw || typeof raw !== 'object') return null
    const g = raw as Record<string, unknown>

    if (typeof g.category !== 'string' || !g.category.trim()) return null
    if (!Array.isArray(g.words) || g.words.length !== 4) return null
    if (!g.words.every((w) => typeof w === 'string' && w.trim())) return null

    const diff = Number(g.difficulty)
    if (![1, 2, 3, 4].includes(diff)) return null

    parsed.push({
      category: g.category.trim(),
      words: (g.words as string[]).map((w) => w.trim()),
      difficulty: diff as 1 | 2 | 3 | 4,
    })
  }

  // Verify exactly 16 unique words
  const allWords = parsed.flatMap((g) => g.words)
  if (allWords.length !== 16) return null
  const unique = new Set(allWords.map((w) => w.toLowerCase()))
  if (unique.size !== 16) return null

  const rng = createRng(seed)
  const shuffled = shuffle(allWords, rng)

  return {
    puzzleData: {
      words: shuffled,
      solution: { groups: parsed },
    },
    config: {
      timer,
      totalGroups: 4,
      maxMistakes: 4,
    },
  }
}
