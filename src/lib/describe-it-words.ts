/** Built-in word bank for Describe It — common, describable words across themes. */
export const DESCRIBE_IT_WORD_POOL: readonly string[] = [
  // Everyday objects
  'umbrella',
  'mirror',
  'pillow',
  'candle',
  'ladder',
  'scissors',
  'toothbrush',
  'wallet',
  'backpack',
  'blanket',
  'bucket',
  'compass',
  'envelope',
  'flashlight',
  'hammer',
  'kettle',
  'magnet',
  'needle',
  'pencil',
  'remote',
  'spoon',
  'stapler',
  'suitcase',
  'telescope',
  'thermometer',
  'whistle',
  'anchor',
  'balloon',
  'bell',
  'broom',
  'clock',
  'crayon',
  // Food & drink
  'pizza',
  'pancake',
  'popcorn',
  'spaghetti',
  'sandwich',
  'cucumber',
  'pineapple',
  'avocado',
  'chocolate',
  'cinnamon',
  'coconut',
  'lemonade',
  'mushroom',
  'pumpkin',
  'strawberry',
  'waffle',
  'broccoli',
  'doughnut',
  'honey',
  'ketchup',
  'noodles',
  'oatmeal',
  'pepper',
  'yogurt',
  // Animals
  'penguin',
  'dolphin',
  'octopus',
  'kangaroo',
  'flamingo',
  'hedgehog',
  'squirrel',
  'butterfly',
  'elephant',
  'giraffe',
  'jellyfish',
  'leopard',
  'ostrich',
  'peacock',
  'raccoon',
  'tortoise',
  'chameleon',
  'crocodile',
  'hamster',
  'koala',
  'panda',
  'rhino',
  'walrus',
  'zebra',
  // Places & travel
  'airport',
  'beach',
  'bridge',
  'castle',
  'desert',
  'island',
  'library',
  'lighthouse',
  'mountain',
  'museum',
  'playground',
  'restaurant',
  'stadium',
  'volcano',
  'waterfall',
  'aquarium',
  'bakery',
  'campsite',
  'farm',
  'harbor',
  'jungle',
  'market',
  'pyramid',
  'tunnel',
  // Nature & weather
  'rainbow',
  'thunder',
  'tornado',
  'snowflake',
  'sunshine',
  'lightning',
  'glacier',
  'meteor',
  'blizzard',
  'breeze',
  'cactus',
  'cloud',
  'forest',
  'lava',
  'puddle',
  'seaweed',
  // Actions & concepts
  'whisper',
  'sneeze',
  'juggle',
  'tickle',
  'yawn',
  'wink',
  'sprint',
  'tiptoe',
  'recycle',
  'celebrate',
  'hibernate',
  'rescue',
  'surrender',
  'gossip',
  'daydream',
  'panic',
  'gravity',
  'echo',
  'shadow',
  'reflection',
  'silence',
  'balance',
  'fortune',
  'mystery',
  // Sports & hobbies
  'basketball',
  'bowling',
  'cartwheel',
  'chess',
  'fishing',
  'gardening',
  'karate',
  'marathon',
  'origami',
  'painting',
  'skateboard',
  'snorkel',
  'surfing',
  'trampoline',
  'volleyball',
  'yoga',
  // People & roles
  'astronaut',
  'detective',
  'firefighter',
  'magician',
  'pirate',
  'plumber',
  'referee',
  'sculptor',
  'lifeguard',
  'mechanic',
  'nurse',
  'photographer',
  'scientist',
  'tailor',
  'waiter',
  'wizard',
  // Tech & modern life
  'keyboard',
  'headphones',
  'password',
  'selfie',
  'podcast',
  'robot',
  'satellite',
  'battery',
  'charger',
  'drone',
  'emoji',
  'firewall',
  'hashtag',
  'joystick',
  'printer',
  'screenshot',
  // Body & feelings
  'eyebrow',
  'elbow',
  'freckle',
  'goosebumps',
  'hiccup',
  'knuckle',
  'nostril',
  'wrinkle',
  'jealous',
  'curious',
  'nervous',
  'grateful',
  'stubborn',
  'cheerful',
  'lonely',
  'proud',
  // Misc fun
  'treasure',
  'fireworks',
  'carousel',
  'confetti',
  'costume',
  'fountain',
  'puppet',
  'riddle',
  'snowman',
  'spider',
  'trophy',
  'unicorn',
  'vampire',
  'zipper',
  'bubble',
  'dragon',
]

/** Normalize a word for storage / comparison. Returns null if unusable. */
export function normalizeDescribeWord(raw: string): string | null {
  const word = raw.trim().replace(/\s+/g, ' ')
  if (!word) return null
  if (word.length > 40) return null
  return word
}

/** Parse host-pasted custom words (newline / comma separated), de-duplicated. */
export function parseDescribeItWords(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n,]/)) {
    const word = normalizeDescribeWord(raw)
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(word)
  }
  return out
}

/** Parse words from an uploaded .xlsx/.xls file (first sheet, any column). */
export async function parseExcelDescribeItWords(buffer: ArrayBuffer): Promise<string[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) return []
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  return parseDescribeItWords(
    grid
      .flat()
      .map((cell) => String(cell ?? ''))
      .join('\n')
  )
}

/** Validate a stored custom-word array. */
export function parseStoredDescribeItWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const word = normalizeDescribeWord(item)
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(word)
  }
  return out
}

/**
 * Pick the next word for a turn, avoiding ones already used this game. Falls back
 * to the full pool (allowing repeats) only if every word has been used.
 */
export function pickDescribeWord(pool: readonly string[], usedWords: readonly string[]): string {
  const used = new Set(usedWords.map((w) => w.toLowerCase()))
  const available = pool.filter((w) => !used.has(w.toLowerCase()))
  const source = available.length > 0 ? available : pool
  return source[Math.floor(Math.random() * source.length)] ?? pool[0] ?? 'mystery'
}
