import { WST_DECK_MIN_ENTRIES, WST_PLATFORM_DECK, type WstDeckEntry } from '@/lib/who-said-this-deck'

/**
 * Who Said This create-flow settings (mobile parallel of the web `create/page.tsx` WST block).
 * The host picks a Questions source: players submit their own quotes in the lobby, or a
 * host-provided deck (built-in Platform pack / a Library pack / an uploaded CSV). Every deck
 * source sends `wst_quote_source: 'deck'`; players-submit sends `'player'`. Players just join
 * and answer — no name list, so WST is a single-step quick create.
 */
export type WstSource = 'player' | 'platform' | 'library' | 'custom'

export type WstCreateState = {
  source: WstSource
  /** The effective deck for `library` (loaded pack) or `custom` (uploaded CSV). */
  deck: WstDeckEntry[]
  /** Title of the picked Library pack (UI only). */
  libraryPackTitle: string | null
}

export function defaultWstCreateState(): WstCreateState {
  return { source: 'player', deck: [], libraryPackTitle: null }
}

/** The questions that will be sent for the selected source (Platform is the built-in pack). */
export function wstEffectiveDeck(wst: WstCreateState): WstDeckEntry[] {
  if (wst.source === 'platform') return WST_PLATFORM_DECK
  if (wst.source === 'library' || wst.source === 'custom') return wst.deck
  return []
}

export function isWstDeckSource(source: WstSource): boolean {
  return source !== 'player'
}

/** `null` when the WST source is ready to create; otherwise the host-facing error. */
export function validateWstCreate(wst: WstCreateState): string | null {
  if (wst.source === 'player') return null
  const count = wstEffectiveDeck(wst).length
  if (count >= WST_DECK_MIN_ENTRIES) return null
  if (wst.source === 'library') {
    return wst.libraryPackTitle
      ? `Pick a pack with at least ${WST_DECK_MIN_ENTRIES} questions (${count} so far)`
      : 'Pick a community quote pack'
  }
  return `Upload at least ${WST_DECK_MIN_ENTRIES} questions — quote, options, and which is correct (${count} so far)`
}

/**
 * `wst_quote_source` + `question_source` + `custom_questions` (+ participant/rounds) for the
 * create payload. Deck sources fold the deck into `custom_questions`; players-submit sends none.
 */
export function wstCreatePayload(wst: WstCreateState): Record<string, unknown> {
  if (wst.source === 'player') {
    return {
      wst_quote_source: 'player',
      question_source: 'platform',
      custom_questions: null,
      participant_mode: 'joiners',
      rounds_count: 2,
    }
  }
  const deck = wstEffectiveDeck(wst)
  return {
    wst_quote_source: 'deck',
    question_source: 'custom',
    custom_questions: deck,
    participant_mode: 'joiners',
    rounds_count: Math.max(deck.length, 2),
  }
}
