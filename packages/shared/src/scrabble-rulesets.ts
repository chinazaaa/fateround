// Per-language Scrabble tile sets (CLIENT-SAFE — no word data). A Scrabble
// "edition" is a tile set + a word list; the chosen dictionary id selects both.
// English editions (enable/collins/twl) share the English tiles; french/german/
// spanish bring their own. Board (15×15), rack (7) and blank ('?') are shared.
//
// Distributions/values are the official sets, verified by total tile count, from
// https://en.wikipedia.org/wiki/Scrabble_letter_distributions :
//   English 100 (+nothing here — reused from scrabble-constants), French 102,
//   German 102, Spanish — see note. All Latin-script, so `.toUpperCase()` holds.

import { SCRABBLE_TILE_VALUES as EN_VALUES, SCRABBLE_TILE_DISTRIBUTION as EN_DIST } from './scrabble-constants'

export interface ScrabbleTileSet {
  /** Uppercase letter → point value. '?' (blank) is 0. */
  values: Record<string, number>
  /** Uppercase letter → count in a fresh bag. Includes '?' for blanks. */
  distribution: Record<string, number>
  /** Playable letters (uppercase), for the blank-letter picker. Excludes '?'. */
  alphabet: string[]
}

/** [letter, count, value] */
type TileSpec = [string, number, number]

function buildTileSet(specs: TileSpec[], alphabet: string, blanks: number): ScrabbleTileSet {
  const values: Record<string, number> = { '?': 0 }
  const distribution: Record<string, number> = { '?': blanks }
  for (const [letter, count, value] of specs) {
    values[letter] = value
    distribution[letter] = count
  }
  return { values, distribution, alphabet: alphabet.split('') }
}

// French — 100 letters + 2 blanks = 102.
const FRENCH: TileSpec[] = [
  ['E', 15, 1],
  ['A', 9, 1],
  ['I', 8, 1],
  ['N', 6, 1],
  ['O', 6, 1],
  ['R', 6, 1],
  ['S', 6, 1],
  ['T', 6, 1],
  ['U', 6, 1],
  ['L', 5, 1],
  ['D', 3, 2],
  ['M', 3, 2],
  ['G', 2, 2],
  ['B', 2, 3],
  ['C', 2, 3],
  ['P', 2, 3],
  ['F', 2, 4],
  ['H', 2, 4],
  ['V', 2, 4],
  ['J', 1, 8],
  ['Q', 1, 8],
  ['K', 1, 10],
  ['W', 1, 10],
  ['X', 1, 10],
  ['Y', 1, 10],
  ['Z', 1, 10],
]

// German — 100 letters + 2 blanks = 102. Adds Ä/Ö/Ü as their own tiles.
const GERMAN: TileSpec[] = [
  ['E', 15, 1],
  ['N', 9, 1],
  ['S', 7, 1],
  ['I', 6, 1],
  ['R', 6, 1],
  ['T', 6, 1],
  ['U', 6, 1],
  ['A', 5, 1],
  ['D', 4, 1],
  ['H', 4, 2],
  ['G', 3, 2],
  ['L', 3, 2],
  ['O', 3, 2],
  ['M', 4, 3],
  ['B', 2, 3],
  ['W', 1, 3],
  ['Z', 1, 3],
  ['C', 2, 4],
  ['F', 2, 4],
  ['K', 2, 4],
  ['P', 1, 4],
  ['Ä', 1, 6],
  ['J', 1, 6],
  ['Ü', 1, 6],
  ['V', 1, 6],
  ['Ö', 1, 8],
  ['X', 1, 8],
  ['Q', 1, 10],
  ['Y', 1, 10],
]

// Spanish — digraph-free variant: the official distribution with the CH/LL/RR
// digraph tiles OMITTED (a single tile representing two letters is impractical
// for this board engine), so 95 letters + 2 blanks = 97. No K/W (not in Spanish);
// keeps Ñ. Words are spelled with individual letters (the FISE word list permits this).
const SPANISH: TileSpec[] = [
  ['A', 12, 1],
  ['E', 12, 1],
  ['O', 9, 1],
  ['I', 6, 1],
  ['S', 6, 1],
  ['N', 5, 1],
  ['L', 4, 1],
  ['R', 5, 1],
  ['U', 5, 1],
  ['T', 4, 1],
  ['D', 5, 2],
  ['G', 2, 2],
  ['C', 4, 3],
  ['B', 2, 3],
  ['M', 2, 3],
  ['P', 2, 3],
  ['H', 2, 4],
  ['F', 1, 4],
  ['V', 1, 4],
  ['Y', 1, 4],
  ['Q', 1, 5],
  ['J', 1, 8],
  ['Ñ', 1, 8],
  ['X', 1, 8],
  ['Z', 1, 10],
]

export const SCRABBLE_TILE_SETS = {
  english: { values: EN_VALUES, distribution: EN_DIST, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  french: buildTileSet(FRENCH, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 2),
  german: buildTileSet(GERMAN, 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ', 2),
  spanish: buildTileSet(SPANISH, 'ABCDEFGHIJLMNÑOPQRSTUVXYZ', 2),
} satisfies Record<string, ScrabbleTileSet>

export type ScrabbleLanguage = keyof typeof SCRABBLE_TILE_SETS

/** Which tile set each dictionary edition uses. */
const DICTIONARY_TILESET: Record<string, ScrabbleLanguage> = {
  enable: 'english',
  collins: 'english',
  twl: 'english',
  french: 'french',
  german: 'german',
  spanish: 'spanish',
}

/** Resolve the tile set for a game's chosen dictionary edition (defaults to English). */
export function tileSetForDictionary(dictId: string | null | undefined): ScrabbleTileSet {
  return SCRABBLE_TILE_SETS[DICTIONARY_TILESET[dictId ?? ''] ?? 'english']
}
