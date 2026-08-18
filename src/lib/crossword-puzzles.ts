import {
  CROSSWORD_DIFFICULTY_SPECS,
  generateCrossword,
  parseCrosswordDifficulty,
  type CrosswordDifficulty,
  type CrosswordEntryInput,
  type CrosswordMetadata,
} from './crossword'
import { WORD_THEMES } from '@/data/daily-banks/themed-words'

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
      { answer: 'ROCKET', clue: 'Space launch vehicle' },
      { answer: 'JUNGLE', clue: 'Dense tropical forest' },
      { answer: 'HARBOR', clue: 'Sheltered port' },
      { answer: 'TUNNEL', clue: 'Passage through a hill' },
      { answer: 'MOUNTAIN', clue: 'Very high peak' },
      { answer: 'VALLEY', clue: 'Low land between hills' },
      { answer: 'FOREST', clue: 'Large wooded area' },
      { answer: 'CANYON', clue: 'Deep gorge' },
      { answer: 'GLACIER', clue: 'Slow-moving ice mass' },
      { answer: 'RAINBOW', clue: 'Arc of colours after rain' },
      { answer: 'THUNDER', clue: 'Storm sound' },
      { answer: 'HORIZON', clue: 'Where sky meets land' },
      { answer: 'LIBRARY', clue: 'Place full of books' },
      { answer: 'MUSEUM', clue: 'It displays artefacts' },
      { answer: 'PALACE', clue: 'Grand royal residence' },
      { answer: 'VILLAGE', clue: 'Small settlement' },
      { answer: 'COMPASS', clue: 'It points north' },
      { answer: 'LANTERN', clue: 'Portable light' },
      { answer: 'UMBRELLA', clue: 'It keeps rain off' },
      { answer: 'WINDOW', clue: 'Glass opening in a wall' },
      { answer: 'KITCHEN', clue: 'Room for cooking' },
      { answer: 'FACTORY', clue: 'Place where goods are made' },
      { answer: 'STATION', clue: 'Where trains stop' },
      { answer: 'AIRPORT', clue: 'Planes take off here' },
      { answer: 'CAMERA', clue: 'It takes photos' },
      { answer: 'GUITAR', clue: 'Six-stringed instrument' },
      { answer: 'HAMMER', clue: 'Tool for nails' },
      { answer: 'BASKET', clue: 'Woven carrier' },
      { answer: 'MIRROR', clue: 'It reflects your image' },
      { answer: 'BALLOON', clue: 'It floats when filled with air' },
      { answer: 'HELMET', clue: 'Protective head gear' },
      { answer: 'COTTAGE', clue: 'Small country house' },
      { answer: 'MEADOW', clue: 'Grassy field' },
      { answer: 'CHIMNEY', clue: 'Smoke exits through it' },
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
      { answer: 'OTTER', clue: 'Playful river mammal' },
      { answer: 'MOOSE', clue: 'Large antlered deer' },
      { answer: 'BISON', clue: 'American buffalo' },
      { answer: 'GECKO', clue: 'Wall-climbing lizard' },
      { answer: 'LEOPARD', clue: 'Spotted big cat' },
      { answer: 'CHEETAH', clue: 'Fastest land animal' },
      { answer: 'GIRAFFE', clue: 'Tallest animal' },
      { answer: 'DOLPHIN', clue: 'Smart sea mammal' },
      { answer: 'PENGUIN', clue: 'Flightless polar bird' },
      { answer: 'OSTRICH', clue: 'Largest bird' },
      { answer: 'BUFFALO', clue: 'Horned grazing beast' },
      { answer: 'PANTHER', clue: 'Black big cat' },
      { answer: 'WALRUS', clue: 'Tusked sea mammal' },
      { answer: 'BEAVER', clue: 'Dam-building rodent' },
      { answer: 'BADGER', clue: 'Burrowing striped mammal' },
      { answer: 'RACCOON', clue: 'Masked night forager' },
      { answer: 'HAMSTER', clue: 'Small pet rodent' },
      { answer: 'GORILLA', clue: 'Largest ape' },
      { answer: 'JAGUAR', clue: 'Spotted American cat' },
      { answer: 'COBRA', clue: 'Hooded venomous snake' },
      { answer: 'IGUANA', clue: 'Large tropical lizard' },
      { answer: 'TOUCAN', clue: 'Big-billed jungle bird' },
      { answer: 'PELICAN', clue: 'Bird with a throat pouch' },
      { answer: 'HYENA', clue: 'Laughing scavenger' },
      { answer: 'JACKAL', clue: 'Wild dog of Africa' },
      { answer: 'ANTELOPE', clue: 'Swift horned grazer' },
      { answer: 'MEERKAT', clue: 'Upright desert mammal' },
      { answer: 'HEDGEHOG', clue: 'Spiny little mammal' },
      { answer: 'SQUIRREL', clue: 'Bushy-tailed nut hoarder' },
      { answer: 'SPARROW', clue: 'Common small bird' },
      { answer: 'PIGEON', clue: 'City park bird' },
      { answer: 'VULTURE', clue: 'Carrion-eating bird' },
      { answer: 'MONGOOSE', clue: 'Snake-fighting mammal' },
      { answer: 'LEMUR', clue: 'Big-eyed primate' },
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
      { answer: 'WAFFLE', clue: 'Gridded breakfast cake' },
      { answer: 'YOGURT', clue: 'Cultured dairy snack' },
      { answer: 'COCOA', clue: 'Hot chocolate drink' },
      { answer: 'MELON', clue: 'Large juicy fruit' },
      { answer: 'BURGER', clue: 'Patty in a bun' },
      { answer: 'PIZZA', clue: 'Cheesy Italian pie' },
      { answer: 'SUGAR', clue: 'Common sweetener' },
      { answer: 'FLOUR', clue: 'Ground wheat' },
      { answer: 'GARLIC', clue: 'Pungent cooking bulb' },
      { answer: 'CARROT', clue: 'Orange root vegetable' },
      { answer: 'POTATO', clue: 'Common starchy tuber' },
      { answer: 'CELERY', clue: 'Crunchy green stalk' },
      { answer: 'SPINACH', clue: 'Iron-rich leafy green' },
      { answer: 'BROCCOLI', clue: 'Green tree-like vegetable' },
      { answer: 'PANCAKE', clue: 'Flat breakfast cake' },
      { answer: 'MUFFIN', clue: 'Cup-shaped baked treat' },
      { answer: 'BISCUIT', clue: 'Crisp baked snack' },
      { answer: 'COOKIE', clue: 'Sweet baked disc' },
      { answer: 'MUSTARD', clue: 'Yellow hot-dog spread' },
      { answer: 'KETCHUP', clue: 'Tomato sauce' },
      { answer: 'VINEGAR', clue: 'Sour condiment' },
      { answer: 'CINNAMON', clue: 'Sweet brown spice' },
      { answer: 'OATMEAL', clue: 'Warm breakfast porridge' },
      { answer: 'CEREAL', clue: 'Breakfast in a bowl' },
      { answer: 'PRETZEL', clue: 'Knotted salty snack' },
      { answer: 'POPCORN', clue: 'Cinema snack' },
      { answer: 'CUPCAKE', clue: 'Small frosted cake' },
      { answer: 'CUSTARD', clue: 'Creamy dessert sauce' },
      { answer: 'SAUSAGE', clue: 'Seasoned meat in a casing' },
      { answer: 'BACON', clue: 'Fried breakfast strips' },
      { answer: 'LETTUCE', clue: 'Salad leaf' },
      { answer: 'CABBAGE', clue: 'Leafy round vegetable' },
      { answer: 'PUMPKIN', clue: 'Orange autumn gourd' },
      { answer: 'CHERRY', clue: 'Small red stone fruit' },
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
      { answer: 'PLASMA', clue: 'Fourth state of matter' },
      { answer: 'ENZYME', clue: 'Biological catalyst' },
      { answer: 'PHOTON', clue: 'Particle of light' },
      { answer: 'GALAXY', clue: 'Vast star system' },
      { answer: 'NUCLEUS', clue: 'Centre of an atom' },
      { answer: 'ELECTRON', clue: 'Negative particle' },
      { answer: 'MOLECULE', clue: 'Group of bonded atoms' },
      { answer: 'NEUTRON', clue: 'Neutral nuclear particle' },
      { answer: 'HELIUM', clue: 'Light balloon gas' },
      { answer: 'SODIUM', clue: 'Salt element' },
      { answer: 'CALCIUM', clue: 'Bone-building element' },
      { answer: 'MERCURY', clue: 'Liquid metal element' },
      { answer: 'URANIUM', clue: 'Radioactive fuel element' },
      { answer: 'NITROGEN', clue: 'Most of the air' },
      { answer: 'HYDROGEN', clue: 'Lightest element' },
      { answer: 'BACTERIA', clue: 'Single-celled microbes' },
      { answer: 'TISSUE', clue: 'Group of similar cells' },
      { answer: 'ARTERY', clue: 'Blood vessel from the heart' },
      { answer: 'SKELETON', clue: "Body's bony frame" },
      { answer: 'MINERAL', clue: 'Natural solid substance' },
      { answer: 'CRYSTAL', clue: 'Ordered solid structure' },
      { answer: 'ISOTOPE', clue: 'Variant of an element' },
      { answer: 'VOLTAGE', clue: 'Electrical potential' },
      { answer: 'CIRCUIT', clue: 'Loop for electric current' },
      { answer: 'FRICTION', clue: 'Force resisting motion' },
      { answer: 'VELOCITY', clue: 'Speed in a direction' },
      { answer: 'DENSITY', clue: 'Mass per volume' },
      { answer: 'PRESSURE', clue: 'Force per area' },
      { answer: 'REACTION', clue: 'Chemical change' },
      { answer: 'COMPOUND', clue: 'Two or more bonded elements' },
      { answer: 'ELEMENT', clue: 'Pure substance on the table' },
      { answer: 'SPECTRUM', clue: 'Band of colours' },
      { answer: 'ANTIBODY', clue: 'Immune defence protein' },
    ],
  },
  ...WORD_THEMES.map((t) => ({
    id: `daily-${t.tag}-${t.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-$/, '')}`,
    label: t.name,
    entries: t.entries.map((e) => ({ answer: e.word, clue: e.clue })),
  })),
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
