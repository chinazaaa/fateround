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
  /** Answer word + a short clue/definition, shown when a player spends a Hint. */
  entries: { word: string; clue: string }[]
}

/** Themed answer banks. Words span 4–12 letters so every difficulty window has options. */
export const WORD_SCRAMBLE_THEMES: WordScrambleTheme[] = [
  {
    id: 'general',
    label: 'General Knowledge',
    entries: [
      { word: 'PLANET', clue: 'A world orbiting a star' },
      { word: 'RIVER', clue: 'A large natural stream of water' },
      { word: 'GUITAR', clue: 'A six-stringed instrument' },
      { word: 'VOLCANO', clue: 'A mountain that can erupt' },
      { word: 'COMPASS', clue: 'It points north' },
      { word: 'HARVEST', clue: 'Gathering ripe crops' },
      { word: 'LANTERN', clue: 'A portable light in a case' },
      { word: 'ORCHARD', clue: 'A place where fruit trees grow' },
      { word: 'MARKET', clue: 'Where goods are bought and sold' },
      { word: 'BRIDGE', clue: 'It spans a river or gap' },
      { word: 'CASTLE', clue: 'A fortified royal home' },
      { word: 'ISLAND', clue: 'Land surrounded by water' },
      { word: 'DESERT', clue: 'A dry, sandy region' },
      { word: 'GARDEN', clue: 'Where flowers and vegetables grow' },
      { word: 'ENGINE', clue: 'It powers a machine or car' },
      { word: 'PUZZLE', clue: 'A problem or game to solve' },
      { word: 'ROCKET', clue: 'It launches into space' },
      { word: 'SIGNAL', clue: 'A sign or message sent' },
      { word: 'THRONE', clue: 'A royal seat' },
      { word: 'WIZARD', clue: 'A magic-wielding character' },
      { word: 'ANCHOR', clue: 'It keeps a ship in place' },
      { word: 'BEACON', clue: 'A guiding light or fire' },
      { word: 'CANDLE', clue: 'A wax stick with a wick' },
      { word: 'DRAGON', clue: 'A mythical fire-breathing beast' },
      { word: 'FALCON', clue: 'A fast bird of prey' },
      { word: 'GLACIER', clue: 'A slow-moving river of ice' },
      { word: 'HORIZON', clue: 'Where earth meets the sky' },
      { word: 'JOURNEY', clue: 'A trip from one place to another' },
      { word: 'KINGDOM', clue: 'A land ruled by a king' },
      { word: 'LIBRARY', clue: 'A place full of books' },
      { word: 'MOUNTAIN', clue: 'A very tall landform' },
      { word: 'ORCHESTRA', clue: 'A large group of musicians' },
      { word: 'PYRAMID', clue: 'An ancient Egyptian tomb' },
      { word: 'QUARTZ', clue: 'A common crystal mineral' },
      { word: 'RAINBOW', clue: 'Colours arcing after rain' },
      { word: 'STADIUM', clue: 'A large sports arena' },
      { word: 'TREASURE', clue: 'Hidden riches' },
      { word: 'UMBRELLA', clue: 'It keeps the rain off you' },
      { word: 'VILLAGE', clue: 'A small settlement' },
      { word: 'WHISTLE', clue: 'It makes a sharp sound' },
      { word: 'LAMP', clue: 'A device that gives light' },
      { word: 'BOOK', clue: 'Pages bound together to read' },
      { word: 'STAR', clue: 'A glowing point in the night sky' },
      { word: 'MOON', clue: "Earth's natural satellite" },
      { word: 'TREE', clue: 'A tall woody plant' },
      { word: 'CAVE', clue: 'A hollow in a hillside' },
      { word: 'SHIP', clue: 'A large seagoing vessel' },
      { word: 'GOLD', clue: 'A precious yellow metal' },
      { word: 'NEST', clue: "A bird's home" },
      { word: 'WAVE', clue: 'A ridge moving across water' },
    ],
  },
  {
    id: 'animals',
    label: 'Animals',
    entries: [
      { word: 'TIGER', clue: 'A big striped cat' },
      { word: 'PANDA', clue: 'A black-and-white bear that eats bamboo' },
      { word: 'OTTER', clue: 'A playful river swimmer' },
      { word: 'ZEBRA', clue: 'A striped African relative of the horse' },
      { word: 'KOALA', clue: 'A tree-dwelling Australian marsupial' },
      { word: 'MOOSE', clue: 'The largest deer, with broad antlers' },
      { word: 'RHINO', clue: 'A horned, thick-skinned grazer' },
      { word: 'SLOTH', clue: 'A very slow tree-dweller' },
      { word: 'CAMEL', clue: 'A humped desert traveller' },
      { word: 'LEMUR', clue: 'A ring-tailed Madagascar primate' },
      { word: 'DOLPHIN', clue: 'A clever marine mammal' },
      { word: 'PENGUIN', clue: 'A flightless bird of the far south' },
      { word: 'GIRAFFE', clue: 'The tallest animal, with a long neck' },
      { word: 'LEOPARD', clue: 'A spotted big cat' },
      { word: 'MEERKAT', clue: 'A small desert lookout that stands upright' },
      { word: 'OCTOPUS', clue: 'An eight-armed sea creature' },
      { word: 'PELICAN', clue: 'A bird with a big throat pouch' },
      { word: 'RACCOON', clue: 'A masked night-time forager' },
      { word: 'HAMSTER', clue: 'A small pet that stuffs its cheeks' },
      { word: 'TERRAPIN', clue: 'A small freshwater turtle' },
      { word: 'ELEPHANT', clue: 'The largest land animal, with a trunk' },
      { word: 'FLAMINGO', clue: 'A pink wading bird' },
      { word: 'KANGAROO', clue: 'A hopping Australian marsupial' },
      { word: 'MANDRILL', clue: 'A colourful-faced monkey' },
      { word: 'PORPOISE', clue: 'A small relative of the dolphin' },
      { word: 'SQUIRREL', clue: 'A bushy-tailed nut hoarder' },
      { word: 'BUTTERFLY', clue: 'An insect with colourful wings' },
      { word: 'CHIMPANZEE', clue: 'A clever great ape' },
      { word: 'CROCODILE', clue: 'A large armoured reptile' },
      { word: 'HEDGEHOG', clue: 'A small spiny mammal' },
      { word: 'WOLF', clue: 'A wild, pack-hunting dog' },
      { word: 'BEAR', clue: 'A large furry forest mammal' },
      { word: 'LION', clue: 'The "king of the jungle"' },
      { word: 'DEER', clue: 'A graceful antlered grazer' },
      { word: 'CRAB', clue: 'A sideways-walking shellfish' },
      { word: 'GOAT', clue: 'A horned, climbing farm animal' },
      { word: 'HAWK', clue: 'A sharp-eyed bird of prey' },
      { word: 'MOLE', clue: 'A burrowing underground digger' },
      { word: 'SEAL', clue: 'A flippered coastal swimmer' },
      { word: 'TOAD', clue: 'A warty hopping amphibian' },
    ],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    entries: [
      { word: 'MANGO', clue: 'A sweet tropical fruit' },
      { word: 'LEMON', clue: 'A sour yellow citrus' },
      { word: 'BREAD', clue: 'A baked staple made from flour' },
      { word: 'HONEY', clue: 'A sweet syrup made by bees' },
      { word: 'OLIVE', clue: 'A small fruit pressed for oil' },
      { word: 'PASTA', clue: 'An Italian noodle dish' },
      { word: 'SALAD', clue: 'A mix of raw vegetables' },
      { word: 'SUGAR', clue: 'A sweet white sweetener' },
      { word: 'WAFER', clue: 'A thin, crisp biscuit' },
      { word: 'YOGURT', clue: 'A cultured dairy food' },
      { word: 'BANANA', clue: 'A long yellow fruit' },
      { word: 'CARROT', clue: 'An orange root vegetable' },
      { word: 'CHEESE', clue: 'A dairy food made from milk' },
      { word: 'COFFEE', clue: 'A popular hot caffeinated drink' },
      { word: 'MUFFIN', clue: 'A small round baked cake' },
      { word: 'PEPPER', clue: 'A spicy seasoning or vegetable' },
      { word: 'PICKLE', clue: 'A cucumber preserved in brine' },
      { word: 'TOMATO', clue: 'A red fruit used as a vegetable' },
      { word: 'WALNUT', clue: 'A wrinkly, brain-shaped nut' },
      { word: 'BISCUIT', clue: 'A crisp sweet baked snack' },
      { word: 'AVOCADO', clue: 'A green, creamy-fleshed fruit' },
      { word: 'BROCCOLI', clue: 'A green, tree-like vegetable' },
      { word: 'CINNAMON', clue: 'A warm brown baking spice' },
      { word: 'CUPCAKE', clue: 'A small iced cake for one' },
      { word: 'DUMPLING', clue: 'A ball of dough, often filled' },
      { word: 'LASAGNE', clue: 'Layered pasta baked with sauce' },
      { word: 'OATMEAL', clue: 'A hot breakfast porridge' },
      { word: 'PANCAKE', clue: 'A flat fried batter cake' },
      { word: 'PORRIDGE', clue: 'Oats cooked in milk or water' },
      { word: 'SANDWICH', clue: 'Filling between two slices of bread' },
      { word: 'RICE', clue: 'Small white grains, a staple food' },
      { word: 'CAKE', clue: 'A sweet baked dessert' },
      { word: 'MILK', clue: 'A white drink from cows' },
      { word: 'PLUM', clue: 'A soft purple stone fruit' },
      { word: 'CORN', clue: 'Yellow kernels on a cob' },
      { word: 'SOUP', clue: 'A warm liquid dish' },
      { word: 'TACO', clue: 'A folded Mexican tortilla snack' },
      { word: 'KALE', clue: 'A leafy green vegetable' },
      { word: 'PEAR', clue: 'A sweet green or gold fruit' },
      { word: 'BEAN', clue: 'A small edible seed in a pod' },
    ],
  },
  {
    id: 'science',
    label: 'Science',
    entries: [
      { word: 'ATOM', clue: 'The smallest unit of an element' },
      { word: 'CELL', clue: 'The basic unit of life' },
      { word: 'GENE', clue: 'A unit of heredity in DNA' },
      { word: 'IRON', clue: 'A common magnetic metal' },
      { word: 'MASS', clue: 'The amount of matter in an object' },
      { word: 'WAVE', clue: 'A travelling disturbance carrying energy' },
      { word: 'FORCE', clue: 'A push or a pull' },
      { word: 'LASER', clue: 'A focused beam of light' },
      { word: 'ORBIT', clue: 'A path around a planet or star' },
      { word: 'PRISM', clue: 'It splits light into colours' },
      { word: 'COMET', clue: 'An icy body with a glowing tail' },
      { word: 'ENZYME', clue: 'A protein that speeds up reactions' },
      { word: 'FOSSIL', clue: 'Preserved remains from long ago' },
      { word: 'GALAXY', clue: 'A vast system of stars' },
      { word: 'MAGNET', clue: 'It attracts iron' },
      { word: 'NEURON', clue: 'A nerve cell' },
      { word: 'OXYGEN', clue: 'The gas we breathe to live' },
      { word: 'PLASMA', clue: 'The fourth state of matter' },
      { word: 'PROTON', clue: 'A positively charged particle' },
      { word: 'VOLTAGE', clue: 'Electrical "pressure" in a circuit' },
      { word: 'BACTERIA', clue: 'Tiny single-celled microbes' },
      { word: 'ELECTRON', clue: 'A negatively charged particle' },
      { word: 'GRAVITY', clue: 'The force that pulls objects down' },
      { word: 'MOLECULE', clue: 'Two or more atoms bonded together' },
      { word: 'NEUTRON', clue: 'An uncharged particle in the nucleus' },
      { word: 'NUCLEUS', clue: 'The centre of an atom or cell' },
      { word: 'PARTICLE', clue: 'A tiny piece of matter' },
      { word: 'PENDULUM', clue: 'A swinging weight on a string' },
      { word: 'SPECTRUM', clue: 'The band of colours in light' },
      { word: 'VELOCITY', clue: 'Speed in a given direction' },
      { word: 'ACID', clue: 'A sour substance with a low pH' },
      { word: 'HEAT', clue: 'Energy that raises temperature' },
      { word: 'MOON', clue: 'A body orbiting a planet' },
      { word: 'STAR', clue: 'A giant ball of burning gas' },
      { word: 'SALT', clue: 'A seasoning; sodium chloride' },
      { word: 'FUEL', clue: 'Something burned for energy' },
      { word: 'CLAY', clue: 'A soft earth used for pottery' },
      { word: 'GLASS', clue: 'A clear material made from sand' },
      { word: 'STEAM', clue: 'Water as a hot vapour' },
      { word: 'LIGHT', clue: 'What lets us see' },
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
  const pool = theme.entries.map((e) => ({ word: e.word, hint: e.clue }))
  const built =
    buildFromWords(pool, diff, seed, exclude) ??
    // Cycle exhausted or window too tight — retry ignoring the exclude list.
    buildFromWords(pool, diff, seed + 101, [])
  if (built) {
    built.metadata.theme = theme.id
    return built
  }
  // Last resort: a tiny fixed scramble so the game can still start.
  const rng = xorshift(seed)
  const fallback = theme.entries[0]
  const word = normalizeScrambleWord(fallback?.word ?? 'WORD')
  return {
    metadata: {
      scrambles: [scrambleWord(word, rng)],
      count: 1,
      theme: theme.id,
      difficulty: diff,
      ...(fallback?.clue ? { hints: [fallback.clue] } : {}),
    },
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
