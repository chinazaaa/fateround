import { Chess } from 'chess.js'
import type { Game, Player, ChessSession } from '@/types'

/** Map our result_reason to the PGN `Termination` tag's standard-ish values. */
function terminationForReason(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'checkmate':
    case 'stalemate':
    case 'threefold':
    case 'insufficient':
    case 'fifty_move':
      return 'Normal'
    case 'timeout':
      return 'Time forfeit'
    case 'resignation':
      return 'Resignation'
    default:
      return null
  }
}

/** PGN result token from the session's outcome. `*` = undecided/ongoing. */
function resultToken(session: ChessSession): '1-0' | '0-1' | '1/2-1/2' | '*' {
  if (session.is_draw) return '1/2-1/2'
  if (session.winner_player_id === session.player_white_id) return '1-0'
  if (session.winner_player_id === session.player_black_id) return '0-1'
  return '*'
}

/** PGN `Date` tag format: YYYY.MM.DD (?? for unknown), in UTC. */
function pgnDate(iso: string | null | undefined): string {
  if (!iso) return '????.??.??'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '????.??.??'
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

/**
 * `TimeControl` tag from the game's configured per-player clock (seconds).
 * Sudden death, no increment. Uses the starting timer, not the end-of-game
 * remainder — `null` (untimed) when no clock was set.
 */
function timeControl(game: Game): string | null {
  const seconds = game.timer_seconds
  return seconds > 0 ? String(seconds) : null
}

type ChessPgnExport = {
  /** Full PGN: Seven Tag Roster headers + movetext, ready to save as a `.pgn` file. */
  pgn: string
  /** Movetext only, e.g. `1. e4 e5 2. Nf3 Nc6 1-0` — for copy-to-clipboard. */
  moves: string
}

/**
 * Build a shareable PGN from a finished (or in-progress) chess session. The
 * movetext is already maintained in `session.pgn`; this wraps it with the
 * Seven Tag Roster and derived tags so it can be imported into Lichess,
 * chess.com, or any PGN reader.
 */
export function buildChessPgn(session: ChessSession, players: Player[], game: Game): ChessPgnExport {
  const white = players.find((p) => p.id === session.player_white_id)?.name ?? 'White'
  const black = players.find((p) => p.id === session.player_black_id)?.name ?? 'Black'
  const result = resultToken(session)

  const chess = new Chess()
  if (session.pgn) {
    try {
      chess.loadPgn(session.pgn)
    } catch {
      // Corrupt/empty history — fall back to headers over an empty movetext.
    }
  }

  chess.setHeader('Event', game.title || 'FateRound Chess')
  chess.setHeader('Site', 'FateRound')
  chess.setHeader('Date', pgnDate(session.created_at))
  chess.setHeader('Round', '-')
  chess.setHeader('White', white)
  chess.setHeader('Black', black)
  chess.setHeader('Result', result)
  const termination = terminationForReason(session.result_reason)
  if (termination) chess.setHeader('Termination', termination)
  const tc = timeControl(game)
  if (tc) chess.setHeader('TimeControl', tc)

  const sans = chess.history()
  let moves = ''
  for (let i = 0; i < sans.length; i += 1) {
    if (i % 2 === 0) moves += `${i / 2 + 1}. `
    moves += `${sans[i]} `
  }
  moves = `${moves}${result}`.trim()

  return { pgn: chess.pgn(), moves }
}

/** A filesystem-safe `.pgn` filename for the download, e.g. `alice-vs-bob.pgn`. */
export function chessPgnFilename(session: ChessSession, players: Player[]): string {
  const white = players.find((p) => p.id === session.player_white_id)?.name ?? 'white'
  const black = players.find((p) => p.id === session.player_black_id)?.name ?? 'black'
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'player'
  return `${slug(white)}-vs-${slug(black)}.pgn`
}
