// Client-safe Scrabble dictionary metadata: the selectable word lists and their
// display labels. NO word data here — the actual lists + validation Sets live in
// the server-only src/lib/scrabble-dictionaries.ts. Both the lobby UI and the
// validation schema import these option ids, so this module must stay free of any
// large word-list imports.

export const SCRABBLE_DICTIONARY_OPTIONS = ['enable', 'collins', 'twl'] as const

export type ScrabbleDictionaryId = (typeof SCRABBLE_DICTIONARY_OPTIONS)[number]

export const SCRABBLE_DEFAULT_DICTIONARY: ScrabbleDictionaryId = 'enable'

export const SCRABBLE_DICTIONARY_LABELS: Record<ScrabbleDictionaryId, string> = {
  enable: 'Standard (ENABLE)',
  collins: 'Collins · CSW (international)',
  twl: 'TWL (North America)',
}

/** Short blurb shown under the picker, optional UI use. */
export const SCRABBLE_DICTIONARY_BLURBS: Record<ScrabbleDictionaryId, string> = {
  enable: 'Open public-domain list — a great default.',
  collins: 'Official international tournament words (largest list).',
  twl: 'Official North American tournament words.',
}

/** Narrow an arbitrary string to a valid dictionary id, falling back to the default. */
export function parseScrabbleDictionaryId(value: unknown): ScrabbleDictionaryId {
  return (SCRABBLE_DICTIONARY_OPTIONS as readonly string[]).includes(value as string)
    ? (value as ScrabbleDictionaryId)
    : SCRABBLE_DEFAULT_DICTIONARY
}
