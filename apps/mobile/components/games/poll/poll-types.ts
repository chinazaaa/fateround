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
  author_participant_id: string
  created_at: string
  updated_at: string
}
