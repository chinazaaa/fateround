import {
  WORD_SCRAMBLE_DIFFICULTY_SPECS,
  parseWordScrambleDifficulty,
  normalizeScrambleWord,
  scrambleWord,
  xorshift,
  type WordScrambleDifficulty,
  type WordScrambleEntryInput,
  type WordScrambleMetadata,
} from '@/lib/word-scramble'

export interface WordScrambleTheme {
  id: string
  label: string
  words: string[]
}

/** Themed answer banks. Words span 4–12 letters so every difficulty window has options. */
export const WORD_SCRAMBLE_THEMES: WordScrambleTheme[] = [
  {
    id: 'general',
    label: 'General Knowledge',
    words: [
      'PLANET',
      'RIVER',
      'GUITAR',
      'VOLCANO',
      'COMPASS',
      'HARVEST',
      'LANTERN',
      'ORCHARD',
      'MARKET',
      'BRIDGE',
      'CASTLE',
      'ISLAND',
      'DESERT',
      'GARDEN',
      'ENGINE',
      'PUZZLE',
      'ROCKET',
      'SIGNAL',
      'THRONE',
      'WIZARD',
      'ANCHOR',
      'BEACON',
      'CANDLE',
      'DRAGON',
      'FALCON',
      'GLACIER',
      'HORIZON',
      'JOURNEY',
      'KINGDOM',
      'LIBRARY',
      'MOUNTAIN',
      'ORCHESTRA',
      'PYRAMID',
      'QUARTZ',
      'RAINBOW',
      'STADIUM',
      'TREASURE',
      'UMBRELLA',
      'VILLAGE',
      'WHISTLE',
      'LAMP',
      'BOOK',
      'STAR',
      'MOON',
      'TREE',
      'CAVE',
      'SHIP',
      'GOLD',
      'NEST',
      'WAVE',
    ],
  },
  {
    id: 'animals',
    label: 'Animals',
    words: [
      'TIGER',
      'PANDA',
      'OTTER',
      'ZEBRA',
      'KOALA',
      'MOOSE',
      'RHINO',
      'SLOTH',
      'CAMEL',
      'LEMUR',
      'DOLPHIN',
      'PENGUIN',
      'GIRAFFE',
      'LEOPARD',
      'MEERKAT',
      'OCTOPUS',
      'PELICAN',
      'RACCOON',
      'HAMSTER',
      'TERRAPIN',
      'ELEPHANT',
      'FLAMINGO',
      'KANGAROO',
      'MANDRILL',
      'PORPOISE',
      'SQUIRREL',
      'BUTTERFLY',
      'CHIMPANZEE',
      'CROCODILE',
      'HEDGEHOG',
      'WOLF',
      'BEAR',
      'LION',
      'DEER',
      'CRAB',
      'GOAT',
      'HAWK',
      'MOLE',
      'SEAL',
      'TOAD',
    ],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    words: [
      'MANGO',
      'LEMON',
      'BREAD',
      'HONEY',
      'OLIVE',
      'PASTA',
      'SALAD',
      'SUGAR',
      'WAFER',
      'YOGURT',
      'BANANA',
      'CARROT',
      'CHEESE',
      'COFFEE',
      'MUFFIN',
      'PEPPER',
      'PICKLE',
      'TOMATO',
      'WALNUT',
      'BISCUIT',
      'AVOCADO',
      'BROCCOLI',
      'CINNAMON',
      'CUPCAKE',
      'DUMPLING',
      'LASAGNE',
      'OATMEAL',
      'PANCAKE',
      'PORRIDGE',
      'SANDWICH',
      'RICE',
      'CAKE',
      'MILK',
      'PLUM',
      'CORN',
      'SOUP',
      'TACO',
      'KALE',
      'PEAR',
      'BEAN',
    ],
  },
  {
    id: 'science',
    label: 'Science',
    words: [
      'ATOM',
      'CELL',
      'GENE',
      'IRON',
      'MASS',
      'WAVE',
      'FORCE',
      'LASER',
      'ORBIT',
      'PRISM',
      'COMET',
      'ENZYME',
      'FOSSIL',
      'GALAXY',
      'MAGNET',
      'NEURON',
      'OXYGEN',
      'PLASMA',
      'PROTON',
      'VOLTAGE',
      'BACTERIA',
      'ELECTRON',
      'GRAVITY',
      'MOLECULE',
      'NEUTRON',
      'NUCLEUS',
      'PARTICLE',
      'PENDULUM',
      'SPECTRUM',
      'VELOCITY',
      'ACID',
      'HEAT',
      'MOON',
      'STAR',
      'SALT',
      'FUEL',
      'CLAY',
      'GLASS',
      'STEAM',
      'LIGHT',
    ],
  },
]

export function wordScrambleThemeOptions(): { id: string; label: string }[] {
  return WORD_SCRAMBLE_THEMES.map((t) => ({ id: t.id, label: t.label }))
}

export const WORD_SCRAMBLE_THEME_OPTIONS = wordScrambleThemeOptions()
export const WORD_SCRAMBLE_DEFAULT_THEME = WORD_SCRAMBLE_THEMES[0]!.id

export function findWordScrambleTheme(id: string | null | undefined): WordScrambleTheme {
  return WORD_SCRAMBLE_THEMES.find((t) => t.id === id) ?? WORD_SCRAMBLE_THEMES[0]!
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Pick `count` answers in the difficulty's length window from `pool`, scrambling each. */
function buildFromWords(
  words: WordScrambleEntryInput[],
  difficulty: WordScrambleDifficulty,
  seed: number,
  exclude: string[] = []
): { metadata: WordScrambleMetadata; solution: string[] } | null {
  const spec = WORD_SCRAMBLE_DIFFICULTY_SPECS[difficulty]
  const excluded = new Set(exclude.map((w) => normalizeScrambleWord(w)))
  const seen = new Set<string>()
  const pool = words
    .map((w) => ({ word: normalizeScrambleWord(w.word), hint: w.hint?.trim() }))
    .filter((w) => w.word.length >= spec.minLen && w.word.length <= spec.maxLen)
    .filter((w) => !excluded.has(w.word))
    .filter((w) => (seen.has(w.word) ? false : (seen.add(w.word), true)))

  if (pool.length === 0) return null
  const rng = xorshift(seed)
  const chosen = shuffle(pool, rng).slice(0, Math.min(spec.count, pool.length))

  const scrambles: string[] = []
  const solution: string[] = []
  const hints: string[] = []
  let anyHint = false
  for (const entry of chosen) {
    scrambles.push(scrambleWord(entry.word, rng))
    solution.push(entry.word)
    hints.push(entry.hint ?? '')
    if (entry.hint) anyHint = true
  }

  return {
    metadata: {
      scrambles,
      count: scrambles.length,
      theme: undefined,
      difficulty,
      ...(anyHint ? { hints } : {}),
    },
    solution,
  }
}

/** Build a themed puzzle (platform banks). `exclude` avoids answers used in earlier rounds. */
export function buildWordScramblePuzzle(
  themeId: string | null | undefined,
  difficulty: string | null | undefined,
  seed: number,
  exclude: string[] = []
): { metadata: WordScrambleMetadata; solution: string[] } {
  const theme = findWordScrambleTheme(themeId)
  const diff = parseWordScrambleDifficulty(difficulty)
  const built =
    buildFromWords(
      theme.words.map((word) => ({ word })),
      diff,
      seed,
      exclude
    ) ??
    // Cycle exhausted or window too tight — retry ignoring the exclude list.
    buildFromWords(
      theme.words.map((word) => ({ word })),
      diff,
      seed + 101,
      []
    )
  if (built) {
    built.metadata.theme = theme.id
    return built
  }
  // Last resort: a tiny fixed scramble so the game can still start.
  const rng = xorshift(seed)
  const word = normalizeScrambleWord(theme.words[0] ?? 'WORD')
  return {
    metadata: { scrambles: [scrambleWord(word, rng)], count: 1, theme: theme.id, difficulty: diff },
    solution: [word],
  }
}

/** Build from a custom pool (CSV / library pack rows). */
export function buildWordScrambleFromEntries(
  entries: WordScrambleEntryInput[],
  difficulty: string | null | undefined,
  seed: number,
  exclude: string[] = []
): { metadata: WordScrambleMetadata; solution: string[] } | null {
  const diff = parseWordScrambleDifficulty(difficulty)
  return buildFromWords(entries, diff, seed, exclude) ?? buildFromWords(entries, diff, seed + 101, [])
}

/** Parse a custom CSV/rows pool (word[,hint]) into scramble entries. */
export function parseWordScrambleEntries(rows: Record<string, string>[]): WordScrambleEntryInput[] {
  const out: WordScrambleEntryInput[] = []
  for (const r of rows) {
    const word = normalizeScrambleWord(r.word ?? r.answer ?? '')
    if (word.length < 2) continue
    const hint = (r.hint ?? r.theme ?? r.clue ?? '').trim()
    out.push({ word, ...(hint ? { hint } : {}) })
  }
  return out
}
