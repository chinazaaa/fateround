import {
  CROSSWORD_DIFFICULTY_SPECS,
  generateCrossword,
  parseCrosswordDifficulty,
  type CrosswordDifficulty,
  type CrosswordEntryInput,
  type CrosswordMetadata,
} from './crossword'

/**
 * Themed answer/clue banks. Each theme is a flat pool of {answer, clue} entries — the
 * generator packs a crossword out of the pool at game-start (deterministic per seed),
 * choosing grid size + word count from the difficulty. Keep answers A–Z only; the
 * generator strips anything else and skips words that don't fit the grid.
 */
export interface CrosswordTheme {
  id: string
  label: string
  entries: CrosswordEntryInput[]
}

export const CROSSWORD_THEMES: CrosswordTheme[] = [
  {
    id: 'general',
    label: 'General Knowledge',
    entries: [
      { answer: 'PLANET', clue: 'Earth is one' },
      { answer: 'RIVER', clue: 'Flowing body of water' },
      { answer: 'ISLAND', clue: 'Land surrounded by water' },
      { answer: 'DESERT', clue: 'Very dry region' },
      { answer: 'VOLCANO', clue: 'Mountain that can erupt' },
      { answer: 'ANCHOR', clue: 'It keeps a ship in place' },
      { answer: 'CASTLE', clue: 'Fortified royal home' },
      { answer: 'MARKET', clue: 'Place to buy and sell' },
      { answer: 'ENGINE', clue: 'It powers a car' },
      { answer: 'LADDER', clue: 'Climb it rung by rung' },
      { answer: 'PENCIL', clue: 'Writing tool with lead' },
      { answer: 'GARDEN', clue: 'Where flowers grow' },
      { answer: 'WINTER', clue: 'Coldest season' },
      { answer: 'CANDLE', clue: 'It gives light with a wick' },
      { answer: 'BRIDGE', clue: 'It spans a river' },
      { answer: 'ORANGE', clue: 'Citrus fruit or colour' },
    ],
  },
  {
    id: 'animals',
    label: 'Animals',
    entries: [
      { answer: 'TIGER', clue: 'Striped big cat' },
      { answer: 'PANDA', clue: 'Bamboo-eating bear' },
      { answer: 'EAGLE', clue: 'Bird of prey' },
      { answer: 'HORSE', clue: 'You can ride it' },
      { answer: 'MONKEY', clue: 'Swings from trees' },
      { answer: 'RABBIT', clue: 'Hops and has long ears' },
      { answer: 'DONKEY', clue: 'Stubborn farm animal' },
      { answer: 'PARROT', clue: 'Bird that can mimic speech' },
      { answer: 'TURTLE', clue: 'Reptile with a shell' },
      { answer: 'SPIDER', clue: 'Eight-legged web spinner' },
      { answer: 'WHALE', clue: 'Largest ocean mammal' },
      { answer: 'CAMEL', clue: 'Desert animal with humps' },
      { answer: 'ZEBRA', clue: 'Striped African horse' },
      { answer: 'SNAKE', clue: 'Legless reptile' },
      { answer: 'LIZARD', clue: 'Small scaly reptile' },
      { answer: 'FALCON', clue: 'Fast-diving raptor' },
    ],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    entries: [
      { answer: 'BANANA', clue: 'Yellow curved fruit' },
      { answer: 'CHEESE', clue: 'Made from milk' },
      { answer: 'COFFEE', clue: 'Morning caffeine fix' },
      { answer: 'TOMATO', clue: 'Red salad fruit' },
      { answer: 'PEPPER', clue: 'Spice or bell vegetable' },
      { answer: 'BUTTER', clue: 'Spread it on toast' },
      { answer: 'NOODLE', clue: 'Long pasta strand' },
      { answer: 'PICKLE', clue: 'Brined cucumber' },
      { answer: 'HONEY', clue: 'Sweet bee product' },
      { answer: 'MANGO', clue: 'Tropical orange fruit' },
      { answer: 'BREAD', clue: 'Baked from dough' },
      { answer: 'LEMON', clue: 'Sour yellow citrus' },
      { answer: 'PASTA', clue: 'Italian staple' },
      { answer: 'SALAD', clue: 'Bowl of greens' },
      { answer: 'GRAPE', clue: 'Wine is made from it' },
      { answer: 'ONION', clue: 'It can make you cry' },
    ],
  },
  {
    id: 'science',
    label: 'Science',
    entries: [
      { answer: 'ATOM', clue: 'Basic unit of matter' },
      { answer: 'ENERGY', clue: 'Capacity to do work' },
      { answer: 'GRAVITY', clue: 'It pulls things down' },
      { answer: 'OXYGEN', clue: 'Gas we breathe' },
      { answer: 'PLANET', clue: 'It orbits a star' },
      { answer: 'CARBON', clue: 'Element in all life' },
      { answer: 'NEURON', clue: 'Nerve cell' },
      { answer: 'FOSSIL', clue: 'Preserved ancient remains' },
      { answer: 'MAGNET', clue: 'It attracts iron' },
      { answer: 'PROTON', clue: 'Positive nuclear particle' },
      { answer: 'GENOME', clue: 'Full set of genes' },
      { answer: 'COMET', clue: 'Icy body with a tail' },
      { answer: 'LASER', clue: 'Focused beam of light' },
      { answer: 'VIRUS', clue: 'Tiny infectious agent' },
      { answer: 'SOLAR', clue: 'Relating to the sun' },
      { answer: 'ORBIT', clue: 'Path around a planet' },
    ],
  },
]

export const CROSSWORD_DEFAULT_THEME = CROSSWORD_THEMES[0].id

export function crosswordThemeOptions(): { id: string; label: string }[] {
  return CROSSWORD_THEMES.map((t) => ({ id: t.id, label: t.label }))
}

export function findCrosswordTheme(id: string | null | undefined): CrosswordTheme {
  return CROSSWORD_THEMES.find((t) => t.id === id) ?? CROSSWORD_THEMES[0]
}

/**
 * Build a crossword for a theme + difficulty. Retries a few seeds if the first packing
 * comes up short, then falls back to any theme so start never hard-fails.
 */
export function buildCrosswordPuzzle(
  themeId: string | null | undefined,
  difficultyRaw: string | null | undefined,
  seed: number,
  excludeAnswers: string[] = []
): { metadata: CrosswordMetadata; solution: string[][] } {
  const difficulty: CrosswordDifficulty = parseCrosswordDifficulty(difficultyRaw)
  const spec = CROSSWORD_DIFFICULTY_SPECS[difficulty]
  const theme = findCrosswordTheme(themeId)

  // Best-effort replay variety: drop recently-used answers, but only while enough remain to
  // build a puzzle — otherwise fall back to the whole bank (the caller resets the cycle).
  const exclude = new Set(excludeAnswers.map((w) => w.toUpperCase()))
  const freshEntries = theme.entries.filter((e) => !exclude.has(e.answer.toUpperCase()))
  const themeEntries = freshEntries.length >= spec.targetWords ? freshEntries : theme.entries

  const attempt = (entries: CrosswordEntryInput[], baseSeed: number) => {
    for (let i = 0; i < 8; i++) {
      const result = generateCrossword(entries, {
        size: spec.size,
        seed: baseSeed + i * 7919,
        targetWords: spec.targetWords,
        maxWordLength: spec.maxWordLength,
        minWords: Math.min(4, spec.targetWords),
      })
      if (result) {
        return {
          metadata: { ...result.metadata, theme: theme.id, difficulty },
          solution: result.solution,
        }
      }
    }
    return null
  }

  const primary = attempt(themeEntries, seed)
  if (primary) return primary

  // Extremely defensive: merge all themes and try once more.
  const merged = CROSSWORD_THEMES.flatMap((t) => t.entries)
  const fallback = attempt(merged, seed + 104729)
  if (fallback) return fallback

  // Last resort — a tiny fixed grid so the game can still start.
  return {
    metadata: {
      size: spec.size,
      blocked: Array.from({ length: spec.size }, () => Array(spec.size).fill(true)),
      numbers: Array.from({ length: spec.size }, () => Array(spec.size).fill(0)),
      clues: [],
      theme: theme.id,
      difficulty,
    },
    solution: Array.from({ length: spec.size }, () => Array(spec.size).fill('')),
  }
}

/** Parse a custom CSV/rows content pool (answer,clue) into entries for the generator. */
export function parseCrosswordEntries(rows: Record<string, string>[]): CrosswordEntryInput[] {
  return rows
    .map((r) => ({
      answer: r.answer ?? r.word ?? '',
      clue: r.clue ?? r.hint ?? r.definition ?? '',
    }))
    .filter((e) => e.answer.trim().length > 0 && e.clue.trim().length > 0)
}
