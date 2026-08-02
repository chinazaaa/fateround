import type { SupabaseClient } from '@supabase/supabase-js'
import { Chess, type Color, type Move, type Square } from 'chess.js'

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
  playerId: string,
  opts: { timerSeconds: number | null; questionSource: string | null; won: boolean; seated: number }
): Promise<Record<string, number>> {
  const facts: Record<string, number> = {}

  const { data } = await supabase
    .from('chess_sessions')
    .select(
      'player_white_id, player_black_id, pgn, result_reason, winner_player_id, is_draw, white_time_ms, black_time_ms'
    )
    .eq('game_id', gameId)
    .maybeSingle()

  const session = (data ?? null) as SessionRow | null
  if (!session) return facts

  // Colour comes from the seat columns. A spectator (or a player from some other game) has no
  // colour here, and nothing below would mean anything for them.
  const me: Color | null =
    session.player_white_id === playerId ? 'w' : session.player_black_id === playerId ? 'b' : null
  if (!me) return facts
  const them: Color = me === 'w' ? 'b' : 'w'

  // ── Result facts ──────────────────────────────────────────────────────────────────────
  // These come straight off the row and survive an unreadable PGN, so they are emitted first.
  const won = opts.won && session.winner_player_id === playerId
  const reason = session.result_reason
  if (won && reason === 'checkmate') facts.chess_wins_checkmate = 1
  if (won && reason === 'timeout') facts.chess_wins_timeout = 1
  // Also true when the opponent simply left — see the caveat at the top of this file.
  if (won && reason === 'resignation') facts.chess_wins_resignation = 1
  if (session.is_draw && reason === 'stalemate') facts.chess_draws_stalemate = 1

  // The winner's own clock, read from the row. On a timeout the loser's clock is zero, so
  // deriving this from anything but the winner's stored value would flag every timeout win.
  const myClockMs = me === 'w' ? session.white_time_ms : session.black_time_ms
  const timed = (opts.timerSeconds ?? 0) > 0
  if (won && timed && typeof myClockMs === 'number' && myClockMs < NAIL_BITER_MS) {
    facts.chess_wins_under_10s = 1
  }
  if (won && opts.timerSeconds === BLITZ_SECONDS) facts.chess_wins_blitz = 1

  // ── Replay ────────────────────────────────────────────────────────────────────────────
  const pgn = session.pgn?.trim()
  if (!pgn) return facts

  let history: Move[]
  try {
    const parsed = new Chess()
    parsed.loadPgn(pgn)
    history = parsed.history({ verbose: true })
  } catch {
    // An unreadable movetext costs the replay-derived facts, never the result ones above.
    return facts
  }
  if (!history.length) return facts

  const board = new Chess()
  let captures = 0
  let checks = 0
  let castles = 0
  let queensideCastles = 0
  let promotions = 0
  let underpromotions = 0
  let queensCaptured = 0
  let enPassant = 0
  let forks = 0
  let doubleChecks = 0
  let endgameReached = false
  let twoQueens = false
  let lostQueen = false
  let piecesLost = 0
  let materialDownAt20 = false

  for (const move of history) {
    let applied: Move
    try {
      applied = board.move(move.san)
    } catch {
      // The stored movetext already passed chess.js validation once; if a ply is somehow
      // unplayable, stop replaying and keep the totals earned up to here.
      break
    }

    const mine = applied.color === me
    const captured = applied.flags.includes('c') || applied.flags.includes('e')

    if (mine) {
      if (captured) captures += 1
      if (applied.captured === 'q') queensCaptured += 1
      if (applied.flags.includes('e')) enPassant += 1
      if (applied.flags.includes('k') || applied.flags.includes('q')) castles += 1
      if (applied.flags.includes('q')) queensideCastles += 1
      if (applied.flags.includes('p')) {
        promotions += 1
        // Anything but a queen. Underpromotion is a choice, so it is worth its own counter.
        if (applied.promotion && applied.promotion !== 'q') underpromotions += 1
      }
    } else {
      if (captured) piecesLost += 1
      if (applied.captured === 'q') lostQueen = true
    }

    const squares = occupied(board.board())
    if (squares.length <= ENDGAME_PIECES) endgameReached = true
    if (mine && squares.filter((p) => p.color === me && p.type === 'q').length >= 2) twoQueens = true

    if (mine && board.inCheck()) {
      checks += 1
      const enemyKing = board.findPiece({ type: 'k', color: them })[0]
      if (enemyKing) {
        const checkers = board.attackers(enemyKing, me)
        // Double check: two pieces hitting the king at once, which no capture or block can answer.
        if (checkers.length >= 2) doubleChecks += 1
        // Fork: the move checks AND the piece that moved also attacks some other enemy piece.
        // The king is excluded — that attack is the check itself, not a second target.
        const forked = squares.some(
          (p) =>
            p.color === them && p.type !== 'k' && board.attackers(p.square as Square, me).includes(applied.to as Square)
        )
        if (forked) forks += 1
      }
    }

    if (board.history().length === MATERIAL_CHECK_PLY) {
      const snapshot = board.board()
      materialDownAt20 = material(snapshot, me) < material(snapshot, them)
    }
  }

  if (captures) facts.chess_captures = captures
  if (checks) facts.chess_checks_given = checks
  if (castles) facts.chess_castles = castles
  if (queensideCastles) facts.chess_queenside_castles = queensideCastles
  if (promotions) facts.chess_promotions = promotions
  if (underpromotions) facts.chess_underpromotions = underpromotions
  if (queensCaptured) facts.chess_queens_captured = queensCaptured
  if (enPassant) facts.chess_en_passant = enPassant
  if (forks) facts.chess_forks = forks
  if (doubleChecks) facts.chess_double_checks = doubleChecks
  if (endgameReached) facts.chess_endgame_reached = 1
  if (twoQueens) facts.chess_two_queens_games = 1

  if (!won) return facts

  // ── Win shapes ────────────────────────────────────────────────────────────────────────
  const fullMoves = Math.ceil(history.length / 2)
  if (lostQueen) facts.chess_wins_after_queen_loss = 1
  if (history.length >= MATERIAL_CHECK_PLY && materialDownAt20) facts.chess_wins_material_down_move20 = 1
  // Clean sheet counts pawns too: the opponent never took anything at all.
  if (piecesLost === 0) facts.chess_wins_clean_sheet = 1
  if (fullMoves >= 60) facts.chess_wins_60_moves = 1

  if (board.isCheckmate()) {
    if (fullMoves <= 20) facts.chess_wins_mate_in_20 = 1
    if (fullMoves <= 12) facts.chess_wins_mate_in_12 = 1

    const matedKing = board.findPiece({ type: 'k', color: them })[0]
    if (matedKing) {
      const checkers = board.attackers(matedKing, me).map((sq) => ({ sq, piece: board.get(sq) }))
      // Back rank: the king never got off its first rank and a rook or queen swept along it.
      const backRank = them === 'w' ? '1' : '8'
      if (
        matedKing.endsWith(backRank) &&
        checkers.some((c) => (c.piece?.type === 'r' || c.piece?.type === 'q') && c.sq.endsWith(backRank))
      ) {
        facts.chess_wins_back_rank = 1
      }
      // Knight mate, not smothered mate — see the definitions note at the top.
      if (checkers.some((c) => c.piece?.type === 'n')) facts.chess_wins_knight_mate = 1
    }
  }

  return facts
}
