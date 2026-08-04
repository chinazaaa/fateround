// Friendly random display names for brand-new anonymous profiles, so leaderboards show distinct,
// lively names ("SwiftFalcon") instead of a wall of "Guest". Assigned once at profile creation and
// fully editable afterwards (the player's real choice always wins). Pure — usable server or client.

const ADJECTIVES = [
  'Swift',
  'Brave',
  'Clever',
  'Mighty',
  'Sunny',
  'Lucky',
  'Bold',
  'Jolly',
  'Nimble',
  'Cosmic',
  'Golden',
  'Silent',
  'Witty',
  'Zesty',
  'Breezy',
  'Merry',
  'Turbo',
  'Royal',
  'Snappy',
  'Gentle',
  'Fierce',
  'Quiet',
  'Rapid',
  'Sly',
  'Wise',
  'Epic',
  'Cheery',
  'Daring',
  'Frosty',
  'Spry',
]

const ANIMALS = [
  'Falcon',
  'Otter',
  'Panda',
  'Tiger',
  'Fox',
  'Owl',
  'Wolf',
  'Koala',
  'Hawk',
  'Lynx',
  'Dolphin',
  'Badger',
  'Heron',
  'Raven',
  'Bison',
  'Gecko',
  'Puma',
  'Robin',
  'Moose',
  'Seal',
  'Crane',
  'Ferret',
  'Marten',
  'Osprey',
  'Quokka',
  'Stoat',
  'Viper',
  'Wombat',
  'Yak',
  'Zebra',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** e.g. "SwiftFalcon42". A trailing 2-digit number keeps duplicates rare without looking robotic. */
export function randomDisplayName(): string {
  const n = Math.floor(Math.random() * 90) + 10
  return `${pick(ADJECTIVES)}${pick(ANIMALS)}${n}`
}

const AUTO_NAME_RE = new RegExp(`^(${ADJECTIVES.join('|')})(${ANIMALS.join('|')})\\d{2}$`)

/**
 * Whether a handle is still one of our auto-assigned names (Adjective+Animal+2 digits). Lets the
 * finish-screen nudge target only un-personalized players, with no DB flag to migrate. A real name
 * essentially never matches this exact shape; if someone deliberately types "SwiftFalcon42" the
 * only cost is one dismissible nudge.
 */
export function isAutoName(handle: string | null | undefined): boolean {
  return !!handle && AUTO_NAME_RE.test(handle)
}
