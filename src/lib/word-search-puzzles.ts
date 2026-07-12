import {
  WORD_SEARCH_DIFFICULTY_SPECS,
  generateWordSearch,
  parseWordSearchDifficulty,
  type WordSearchDifficulty,
  type WordSearchEntryInput,
  type WordSearchMetadata,
  type WordSearchPlacement,
} from './word-search'

/**
 * Themed word banks. Each theme is a flat pool of words — the generator plants a subset
 * into a letter grid at game-start (deterministic per seed), choosing grid size, word count
 * and directions from the difficulty. Keep words A–Z only; the generator strips anything
 * else and skips words that don't fit the grid.
 */
export interface WordSearchTheme {
  id: string
  label: string
  words: string[]
}

export const WORD_SEARCH_THEMES: WordSearchTheme[] = [
  {
    id: 'general',
    label: 'General Knowledge',
    words: [
      'PLANET',
      'RIVER',
      'ISLAND',
      'DESERT',
      'VOLCANO',
      'ANCHOR',
      'CASTLE',
      'MARKET',
      'ENGINE',
      'LADDER',
      'PENCIL',
      'GARDEN',
      'WINTER',
      'CANDLE',
      'BRIDGE',
      'ORANGE',
      'ROCKET',
      'JUNGLE',
      'HARBOR',
      'TUNNEL',
      'MOUNTAIN',
      'VALLEY',
      'FOREST',
      'GLACIER',
      'CANYON',
      'HARVEST',
      'LANTERN',
      'COMPASS',
      'UMBRELLA',
      'LIBRARY',
      'MUSEUM',
      'PALACE',
      'VILLAGE',
      'THUNDER',
      'RAINBOW',
      'HORIZON',
      'WINDOW',
      'KITCHEN',
      'FACTORY',
      'STATION',
      'AIRPORT',
      'HIGHWAY',
      'CAMERA',
      'GUITAR',
      'HAMMER',
      'BASKET',
      'BLANKET',
      'MIRROR',
      'BALLOON',
      'JACKET',
      'HELMET',
      'CHIMNEY',
      'COTTAGE',
    ],
  },
  {
    id: 'animals',
    label: 'Animals',
    words: [
      'TIGER',
      'PANDA',
      'EAGLE',
      'HORSE',
      'MONKEY',
      'RABBIT',
      'DONKEY',
      'PARROT',
      'TURTLE',
      'SPIDER',
      'WHALE',
      'CAMEL',
      'ZEBRA',
      'SNAKE',
      'LIZARD',
      'FALCON',
      'OTTER',
      'MOOSE',
      'BISON',
      'GECKO',
      'LEOPARD',
      'CHEETAH',
      'GIRAFFE',
      'DOLPHIN',
      'PENGUIN',
      'OSTRICH',
      'BUFFALO',
      'LEMUR',
      'PANTHER',
      'WALRUS',
      'BEAVER',
      'BADGER',
      'RACCOON',
      'HAMSTER',
      'GORILLA',
      'JAGUAR',
      'COBRA',
      'IGUANA',
      'TOUCAN',
      'PELICAN',
      'HYENA',
      'JACKAL',
      'ANTELOPE',
      'MEERKAT',
      'HEDGEHOG',
      'SQUIRREL',
      'SPARROW',
      'PIGEON',
      'VULTURE',
      'MONGOOSE',
    ],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    words: [
      'BANANA',
      'CHEESE',
      'COFFEE',
      'TOMATO',
      'PEPPER',
      'BUTTER',
      'NOODLE',
      'PICKLE',
      'HONEY',
      'MANGO',
      'BREAD',
      'LEMON',
      'PASTA',
      'SALAD',
      'GRAPE',
      'ONION',
      'WAFFLE',
      'YOGURT',
      'COCOA',
      'MELON',
      'BURGER',
      'PIZZA',
      'SUGAR',
      'FLOUR',
      'GARLIC',
      'CARROT',
      'POTATO',
      'CELERY',
      'SPINACH',
      'BROCCOLI',
      'PANCAKE',
      'MUFFIN',
      'BISCUIT',
      'COOKIE',
      'MUSTARD',
      'KETCHUP',
      'VINEGAR',
      'CINNAMON',
      'OATMEAL',
      'CEREAL',
      'PRETZEL',
      'POPCORN',
      'CUPCAKE',
      'CUSTARD',
      'SAUSAGE',
      'BACON',
      'LETTUCE',
      'CABBAGE',
      'PUMPKIN',
      'CHERRY',
    ],
  },
  {
    id: 'science',
    label: 'Science',
    words: [
      'ATOM',
      'ENERGY',
      'GRAVITY',
      'OXYGEN',
      'PLANET',
      'CARBON',
      'NEURON',
      'FOSSIL',
      'MAGNET',
      'PROTON',
      'GENOME',
      'COMET',
      'LASER',
      'VIRUS',
      'SOLAR',
      'ORBIT',
      'PLASMA',
      'ENZYME',
      'PHOTON',
      'GALAXY',
      'NUCLEUS',
      'ELECTRON',
      'MOLECULE',
      'NEUTRON',
      'HELIUM',
      'SODIUM',
      'CALCIUM',
      'MERCURY',
      'URANIUM',
      'NITROGEN',
      'HYDROGEN',
      'BACTERIA',
      'TISSUE',
      'ARTERY',
      'SKELETON',
      'MINERAL',
      'CRYSTAL',
      'ISOTOPE',
      'VOLTAGE',
      'CIRCUIT',
      'FRICTION',
      'VELOCITY',
      'DENSITY',
      'PRESSURE',
      'REACTION',
      'COMPOUND',
      'ELEMENT',
      'SPECTRUM',
      'ANTIBODY',
    ],
  },
]

export const WORD_SEARCH_DEFAULT_THEME = WORD_SEARCH_THEMES[0].id

export function wordSearchThemeOptions(): { id: string; label: string }[] {
  return WORD_SEARCH_THEMES.map((t) => ({ id: t.id, label: t.label }))
}

export function findWordSearchTheme(id: string | null | undefined): WordSearchTheme {
  return WORD_SEARCH_THEMES.find((t) => t.id === id) ?? WORD_SEARCH_THEMES[0]
}

/**
 * Build a word search for a theme + difficulty. Retries a few seeds if the first planting
 * comes up short, then falls back to any theme so start never hard-fails.
 */
export function buildWordSearchPuzzle(
  themeId: string | null | undefined,
  difficultyRaw: string | null | undefined,
  seed: number,
  excludeWords: string[] = []
): { metadata: WordSearchMetadata; solution: WordSearchPlacement[] } {
  const difficulty: WordSearchDifficulty = parseWordSearchDifficulty(difficultyRaw)
  const spec = WORD_SEARCH_DIFFICULTY_SPECS[difficulty]
  const theme = findWordSearchTheme(themeId)

  // Best-effort replay variety: drop recently-used words, but only while enough remain to
  // fill a puzzle — otherwise fall back to the whole bank (the caller resets the cycle).
  const exclude = new Set(excludeWords.map((w) => w.toUpperCase()))
  const fresh = theme.words.filter((w) => !exclude.has(w.toUpperCase()))
  const themeWords = fresh.length >= spec.targetWords ? fresh : theme.words

  const attempt = (words: string[], baseSeed: number) => {
    for (let i = 0; i < 8; i++) {
      const result = generateWordSearch(words, {
        size: spec.size,
        seed: baseSeed + i * 7919,
        targetWords: spec.targetWords,
        directions: spec.directions,
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

  const primary = attempt(themeWords, seed)
  if (primary) return primary

  // Extremely defensive: merge all themes and try once more.
  const merged = [...new Set(WORD_SEARCH_THEMES.flatMap((t) => t.words))]
  const fallback = attempt(merged, seed + 104729)
  if (fallback) return fallback

  // Last resort — a single-word grid so the game can still start.
  const size = spec.size
  const grid = Array.from({ length: size }, () => Array(size).fill('A'))
  const word = theme.words[0] ?? 'WORD'
  for (let i = 0; i < word.length && i < size; i++) grid[0][i] = word[i]
  return {
    metadata: { size, grid, words: [word.slice(0, size)], directions: spec.directions, theme: theme.id, difficulty },
    solution: [{ word: word.slice(0, size), row: 0, col: 0, direction: 'E' }],
  }
}

/** Parse a custom CSV/rows content pool (word[,theme]) into entries for the generator. */
export function parseWordSearchEntries(rows: Record<string, string>[]): WordSearchEntryInput[] {
  return rows.map((r) => ({ word: r.word ?? r.answer ?? '' })).filter((e) => e.word.trim().length > 0)
}
