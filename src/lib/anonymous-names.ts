const ADJECTIVES = [
  'Silent',
  'Purple',
  'Cosmic',
  'Mystic',
  'Golden',
  'Shadow',
  'Lucky',
  'Brave',
  'Swift',
  'Neon',
  'Hidden',
  'Witty',
  'Chill',
  'Bold',
  'Sneaky',
]

const ANIMALS = [
  'Fox',
  'Panda',
  'Otter',
  'Hawk',
  'Wolf',
  'Koala',
  'Tiger',
  'Raven',
  'Lynx',
  'Dolphin',
  'Badger',
  'Falcon',
  'Moose',
  'Crane',
  'Gecko',
]

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function generateAnonymousDisplayName(takenNames: string[]): string {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()))

  for (let attempt = 0; attempt < 80; attempt++) {
    const suffix = Math.floor(Math.random() * 90) + 10
    const name = `${randomItem(ADJECTIVES)} ${randomItem(ANIMALS)} ${suffix}`
    if (!taken.has(name.toLowerCase())) return name
  }

  return `Guest ${Math.floor(Math.random() * 9000) + 1000}`
}
