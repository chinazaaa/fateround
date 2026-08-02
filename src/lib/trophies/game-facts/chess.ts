import type { SupabaseClient } from '@supabase/supabase-js'
import { Chess, type Color, type Move, type Square } from 'chess.js'
import type { FactsContext } from './index'

/**
 * Chess's per-game facts, derived at finish from what the game already stored.
 *
 * Chess is the cheapest game to mine because it already persists a full record of itself.
 * `chess_sessions.pgn` is a text column holding the COMPLETE SAN movetext, rewritten on every
 * accepted move (`src/lib/chess.ts`), so replaying it here reconstructs every ply — captures,
 * checks, castles, promotions, the material balance at any point. `chess.js` is the same library
 * the game validates moves with, so the replay cannot disagree with what was played. Nothing here
 * touches a gameplay route and nothing new needs to be tracked.
 *
 * ONE CALL PER ROUND, NOT PER PLAYER, AND SO ONE REPLAY. A chess round has exactly two players and
 * exactly one move list, and every ply says something about BOTH of them — a capture by White is a
 * piece lost by Black. Called once per player this file read the session row twice and replayed the
 * entire PGN twice, deriving each colour's facts from the same plies and discarding the other
 * colour's each time. The replay below therefore keeps a tally per colour and fills both in a
 * single pass: the mover's side of a ply and its victim's side are recorded together. The result
 * is keyed by `player_white_id` / `player_black_id`, and a player with nothing to say about them
 * gets no entry at all.
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the
 * rule DSL only asks `counter >= n`. So a per-game achievement cannot be stored as a value —
 * "I reached an endgame this game" summed across games would be nonsense as a value. Per-game
 * achievements are emitted as 0/1 flags counted once, and the rule reads `>= 1`. Genuinely
 * cumulative events (captures, checks, forks) are emitted as real totals.
 *
 * TWO CAVEATS THAT LOOK LIKE BUGS AND ARE NOT.
 *  1. A forfeit-on-leave is recorded as `result_reason = 'resignation'` (`src/lib/chess.ts`), so
 *     `chess_wins_resignation` also counts opponents who closed the tab. There is no column that
 *     distinguishes the two, so the counter is deliberately named for the recorded reason rather
 *     than for "made them resign", and any trophy over it should be worded loosely.
 *  2. On a timeout finish the LOSER's clock is zeroed. `chess_wins_under_10s` therefore reads the
 *     WINNER's own stored clock and never derives time from timestamps — the row is the record.
 *
 * DEFINITIONS FIXED HERE (the brief was ambiguous; these are the readings implemented).
 *  - Material is plain piece values P1 N3 B3 R5 Q9, no positional evaluation. A "material down"
 *    win means down on that count, which is what a player can see on the captured-pieces tray.
 *  - Back-rank mate: the mated king stands on its OWN back rank and a checking rook or queen sits
 *    on that same rank. Checkers are read from the final position rather than from the last move,
 *    so a discovered mate is attributed to the piece actually giving check.
 *  - Knight mate: a knight is among the checkers at mate. The brief called this "smothered mate",
 *    which is the stricter variant — smothered additionally requires every square around the king
 *    to be occupied by the king's OWN pieces. That is NOT implemented; this is the loose reading.
 *  - "Mate in N" and "60 moves" count FULL moves (a white and a black ply), matching move numbers
 *    as they appear in the movetext.
 */

/** Plain material values. No positional evaluation — this is the captured-pieces tray, not an engine. */
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
/** A position with this many pieces or fewer counts as an endgame. */
const ENDGAME_PIECES = 6
/** Material comparison point: "down at move 20" is the position after 40 plies. */
const MATERIAL_CHECK_PLY = 40
/** Winning with this much or less left on your own clock is a nail-biter. */
const NAIL_BITER_MS = 10_000
/** `games.timer_seconds` value that means blitz. */
const BLITZ_SECONDS = 180

type SessionRow = {
  player_white_id: string | null
  player_black_id: string | null
  pgn: string | null
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean | null
  white_time_ms: number | null
  black_time_ms: number | null
}

/** One colour's share of the replay. Both are filled in the same pass over the move list. */
type Tally = {
  captures: number
  checks: number
  castles: number
  queensideCastles: number
  promotions: number
  underpromotions: number
  queensCaptured: number
  enPassant: number
  forks: number
  doubleChecks: number
  twoQueens: boolean
  lostQueen: boolean
  piecesLost: number
  materialDownAt20: boolean
}

function emptyTally(): Tally {
  return {
    captures: 0,
    checks: 0,
    castles: 0,
    queensideCastles: 0,
    promotions: 0,
    underpromotions: 0,
    queensCaptured: 0,
    enPassant: 0,
    forks: 0,
    doubleChecks: 0,
    twoQueens: false,
    lostQueen: false,
    piecesLost: 0,
    materialDownAt20: false,
  }
}

/** Total material on the board for one colour. */
function material(board: ReturnType<Chess['board']>, color: Color): number {
  let total = 0
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.color === color) total += PIECE_VALUE[piece.type] ?? 0
    }
  }
  return total
}

/** Every occupied square on the board, with its piece. */
function occupied(board: ReturnType<Chess['board']>) {
  return board.flat().filter((p): p is NonNullable<typeof p> => Boolean(p))
}

export async function chessFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase
    .from('chess_sessions')
    .select(
      'player_white_id, player_black_id, pgn, result_reason, winner_player_id, is_draw, white_time_ms, black_time_ms'
    )
    .eq('game_id', gameId)
    .maybeSingle()

  const session = (data ?? null) as SessionRow | null
  if (!session) return out

  // Colour comes from the seat columns. Anyone else in the room (a spectator, say) has no colour
  // here, and nothing below would mean anything for them — they simply never get a map entry.
  const seats: Array<{ color: Color; playerId: string }> = []
  if (session.player_white_id) seats.push({ color: 'w', playerId: session.player_white_id })
  if (session.player_black_id) seats.push({ color: 'b', playerId: session.player_black_id })
  if (!seats.length) return out

  const facts: Record<Color, Record<string, number>> = { w: {}, b: {} }
  // `winners` is empty for a draw AND for a game whose winner is unknown, so this is only ever
  // read as "won", never inverted into "lost".
  const wonBy: Record<Color, boolean> = { w: false, b: false }

  // ── Result facts ──────────────────────────────────────────────────────────────────────
  // These come straight off the row and survive an unreadable PGN, so they are emitted first.
  const reason = session.result_reason
  for (const { color, playerId } of seats) {
    const f = facts[color]
    const won = ctx.winners.includes(playerId) && session.winner_player_id === playerId
    wonBy[color] = won

    if (won && reason === 'checkmate') f.chess_wins_checkmate = 1
    if (won && reason === 'timeout') f.chess_wins_timeout = 1
    // Also true when the opponent simply left — see the caveat at the top of this file.
    if (won && reason === 'resignation') f.chess_wins_resignation = 1
    if (session.is_draw && reason === 'stalemate') f.chess_draws_stalemate = 1

    // The winner's own clock, read from the row. On a timeout the loser's clock is zero, so
    // deriving this from anything but the winner's stored value would flag every timeout win.
    const myClockMs = color === 'w' ? session.white_time_ms : session.black_time_ms
    const timed = (ctx.timerSeconds ?? 0) > 0
    if (won && timed && typeof myClockMs === 'number' && myClockMs < NAIL_BITER_MS) {
      f.chess_wins_under_10s = 1
    }
    if (won && ctx.timerSeconds === BLITZ_SECONDS) f.chess_wins_blitz = 1
  }

  /** Fold whatever each colour ended up with into the returned map, skipping empty ones. */
  const collect = () => {
    for (const { color, playerId } of seats) {
      if (Object.keys(facts[color]).length) out.set(playerId, facts[color])
    }
    return out
  }

  // ── Replay ────────────────────────────────────────────────────────────────────────────
  const pgn = session.pgn?.trim()
  if (!pgn) return collect()

  let history: Move[]
  try {
    const parsed = new Chess()
    parsed.loadPgn(pgn)
    history = parsed.history({ verbose: true })
  } catch {
    // An unreadable movetext costs the replay-derived facts, never the result ones above.
    return collect()
  }
  if (!history.length) return collect()

  const board = new Chess()
  const tally: Record<Color, Tally> = { w: emptyTally(), b: emptyTally() }
  // The one fact that belongs to the position rather than to a player: both sides were there.
  let endgameReached = false

  for (const move of history) {
    let applied: Move
    try {
      applied = board.move(move.san)
    } catch {
      // The stored movetext already passed chess.js validation once; if a ply is somehow
      // unplayable, stop replaying and keep the totals earned up to here.
      break
    }

    const mover: Color = applied.color
    const victim: Color = mover === 'w' ? 'b' : 'w'
    const mine = tally[mover]
    const theirs = tally[victim]
    const captured = applied.flags.includes('c') || applied.flags.includes('e')

    // The mover's side of this ply…
    if (captured) mine.captures += 1
    if (applied.captured === 'q') mine.queensCaptured += 1
    if (applied.flags.includes('e')) mine.enPassant += 1
    if (applied.flags.includes('k') || applied.flags.includes('q')) mine.castles += 1
    if (applied.flags.includes('q')) mine.queensideCastles += 1
    if (applied.flags.includes('p')) {
      mine.promotions += 1
      // Anything but a queen. Underpromotion is a choice, so it is worth its own counter.
      if (applied.promotion && applied.promotion !== 'q') mine.underpromotions += 1
    }
    // …and, in the same pass, what it cost the other colour.
    if (captured) theirs.piecesLost += 1
    if (applied.captured === 'q') theirs.lostQueen = true

    const squares = occupied(board.board())
    if (squares.length <= ENDGAME_PIECES) endgameReached = true
    if (squares.filter((p) => p.color === mover && p.type === 'q').length >= 2) mine.twoQueens = true

    if (board.inCheck()) {
      mine.checks += 1
      const enemyKing = board.findPiece({ type: 'k', color: victim })[0]
      if (enemyKing) {
        const checkers = board.attackers(enemyKing, mover)
        // Double check: two pieces hitting the king at once, which no capture or block can answer.
        if (checkers.length >= 2) mine.doubleChecks += 1
        // Fork: the move checks AND the piece that moved also attacks some other enemy piece.
        // The king is excluded — that attack is the check itself, not a second target.
        const forked = squares.some(
          (p) =>
            p.color === victim &&
            p.type !== 'k' &&
            board.attackers(p.square as Square, mover).includes(applied.to as Square)
        )
        if (forked) mine.forks += 1
      }
    }

    if (board.history().length === MATERIAL_CHECK_PLY) {
      const snapshot = board.board()
      const white = material(snapshot, 'w')
      const black = material(snapshot, 'b')
      tally.w.materialDownAt20 = white < black
      tally.b.materialDownAt20 = black < white
    }
  }

  const fullMoves = Math.ceil(history.length / 2)
  const checkmate = board.isCheckmate()

  for (const { color } of seats) {
    const f = facts[color]
    const t = tally[color]
    const them: Color = color === 'w' ? 'b' : 'w'

    if (t.captures) f.chess_captures = t.captures
    if (t.checks) f.chess_checks_given = t.checks
    if (t.castles) f.chess_castles = t.castles
    if (t.queensideCastles) f.chess_queenside_castles = t.queensideCastles
    if (t.promotions) f.chess_promotions = t.promotions
    if (t.underpromotions) f.chess_underpromotions = t.underpromotions
    if (t.queensCaptured) f.chess_queens_captured = t.queensCaptured
    if (t.enPassant) f.chess_en_passant = t.enPassant
    if (t.forks) f.chess_forks = t.forks
    if (t.doubleChecks) f.chess_double_checks = t.doubleChecks
    if (endgameReached) f.chess_endgame_reached = 1
    if (t.twoQueens) f.chess_two_queens_games = 1

    if (!wonBy[color]) continue

    // ── Win shapes ──────────────────────────────────────────────────────────────────────
    if (t.lostQueen) f.chess_wins_after_queen_loss = 1
    if (history.length >= MATERIAL_CHECK_PLY && t.materialDownAt20) f.chess_wins_material_down_move20 = 1
    // Clean sheet counts pawns too: the opponent never took anything at all.
    if (t.piecesLost === 0) f.chess_wins_clean_sheet = 1
    if (fullMoves >= 60) f.chess_wins_60_moves = 1

    if (checkmate) {
      if (fullMoves <= 20) f.chess_wins_mate_in_20 = 1
      if (fullMoves <= 12) f.chess_wins_mate_in_12 = 1

      const matedKing = board.findPiece({ type: 'k', color: them })[0]
      if (matedKing) {
        const checkers = board.attackers(matedKing, color).map((sq) => ({ sq, piece: board.get(sq) }))
        // Back rank: the king never got off its first rank and a rook or queen swept along it.
        const backRank = them === 'w' ? '1' : '8'
        if (
          matedKing.endsWith(backRank) &&
          checkers.some((c) => (c.piece?.type === 'r' || c.piece?.type === 'q') && c.sq.endsWith(backRank))
        ) {
          f.chess_wins_back_rank = 1
        }
        // Knight mate, not smothered mate — see the definitions note at the top.
        if (checkers.some((c) => c.piece?.type === 'n')) f.chess_wins_knight_mate = 1
      }
    }
  }

  return collect()
}
