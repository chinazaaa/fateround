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

/** e.g. "SwiftFalcon". A trailing 1–2 digit number keeps duplicates rare without looking robotic. */
export function randomDisplayName(): string {
  const n = Math.floor(Math.random() * 90) + 10
  return `${pick(ADJECTIVES)}${pick(ANIMALS)}${n}`
}
