/**
 * Local poll-suite row types (confessions + WST quote pool). These tables aren't
 * in the shared types package, so the poll views declare them here to stay
 * self-contained (parallel-safety — no shared edits).
 */

export interface Confession {
  id: string
  game_id: string
  round_id: string | null
  text: string
  created_at: string
}

export interface WstQuotePoolEntry {
  id: string
  game_id: string
  player_id: string | null
  quote_text: string
  /** Trivia-style answer options the submitter supplied (2–4). */
  options: string[] | null
  /** Index into `options` of the correct answer. */
  correct_index: number | null
  /** Legacy (name-list model) — unused by the current players-submit flow. */
  author_participant_id: string | null
  created_at: string
  updated_at: string
}
