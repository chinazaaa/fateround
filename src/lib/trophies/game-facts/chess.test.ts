import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { chessFacts } from './chess'

/**
 * The facts builder reads one row and nothing else, so the mock is a single object.
 * Every case here is a rule someone could write in admin — if the derivation is wrong the
 * trophy is silently unearnable, which is indistinguishable from a typo.
 *
 * Movetext is BUILT with chess.js rather than hand-written, so a test can never assert against a
 * PGN the real game could not have produced.
 */
function db(session: Record<string, unknown> | null) {
  return {
    from() {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: session }) }) }) }
    },
  } as never
}

/** Play the given SAN moves and return the movetext exactly as the game would have stored it. */
function pgnOf(moves: string[]): string {
  const chess = new Chess()
  for (const san of moves) chess.move(san)
  return chess.pgn()
}

const CTX = { timerSeconds: 300, questionSource: null, won: false, seated: 2 }

/** A finished session with me as White, filled in by each test. */
function session(pgn: string, extra: Record<string, unknown> = {}) {
  return {
    player_white_id: 'me',
    player_black_id: 'rival',
    pgn,
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    white_time_ms: 120_000,
    black_time_ms: 120_000,
    ...extra,
  }
}

describe('chessFacts', () => {
  it('records a scholar’s mate as a checkmate win inside twelve moves', async () => {
    const pgn = pgnOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    const row = session(pgn, { result_reason: 'checkmate', winner_player_id: 'me' })
    const f = await chessFacts(db(row), 'G', 'me', { ...CTX, won: true })

    expect(f.chess_wins_checkmate).toBe(1)
    expect(f.chess_wins_mate_in_12).toBe(1)
    expect(f.chess_wins_mate_in_20).toBe(1)
    // Four full moves, one capture (the f7 pawn), and the queen delivered the mate.
    expect(f.chess_captures).toBe(1)
    expect(f.chess_wins_knight_mate).toBeUndefined()
    expect(f.chess_wins_back_rank).toBeUndefined()
  })

  it('counts captures and checks for the asking player only', async () => {
    // White takes on e5 and on d5; Black takes once on e5. Neither player may be credited
    // with the other's work.
    const pgn = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Nxe5', 'Nxe5', 'd4', 'd5', 'exd5'])
    const row = session(pgn)

    const white = await chessFacts(db(row), 'G', 'me', CTX)
    const black = await chessFacts(db(row), 'G', 'rival', CTX)
    expect(white.chess_captures).toBe(2)
    expect(black.chess_captures).toBe(1)
  })

  it('separates kingside from queenside castling', async () => {
    const kingside = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])
    const queenside = pgnOf(['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7', 'O-O-O'])

    const k = await chessFacts(db(session(kingside)), 'G', 'me', CTX)
    const q = await chessFacts(db(session(queenside)), 'G', 'me', CTX)
    expect(k.chess_castles).toBe(1)
    expect(k.chess_queenside_castles).toBeUndefined()
    expect(q.chess_castles).toBe(1)
    expect(q.chess_queenside_castles).toBe(1)
  })

  it('tells an underpromotion apart from a queen promotion', async () => {
    // Same race to the eighth rank, promoting to a queen in one line and a knight in the other.
    const race = ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2', 'bxa8=Q']
    const queen = await chessFacts(db(session(pgnOf(race))), 'G', 'me', CTX)
    const knight = await chessFacts(db(session(pgnOf([...race.slice(0, -1), 'bxa8=N']))), 'G', 'me', CTX)

    expect(queen.chess_promotions).toBe(1)
    expect(queen.chess_underpromotions).toBeUndefined()
    expect(knight.chess_promotions).toBe(1)
    expect(knight.chess_underpromotions).toBe(1)
  })

  it('flags a clean sheet only when the opponent captured nothing', async () => {
    const clean = pgnOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    const messy = pgnOf(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'e5', 'Nf3', 'exd4', 'Nxd4'])

    const a = await chessFacts(db(session(clean, { result_reason: 'checkmate', winner_player_id: 'me' })), 'G', 'me', {
      ...CTX,
      won: true,
    })
    const b = await chessFacts(
      db(session(messy, { result_reason: 'resignation', winner_player_id: 'me' })),
      'G',
      'me',
      {
        ...CTX,
        won: true,
      }
    )
    // White lost the f7 pawn's capture but nothing of its own in the first line.
    expect(a.chess_wins_clean_sheet).toBe(1)
    expect(b.chess_wins_clean_sheet).toBeUndefined()
  })

  it('reads the winner’s own clock for a nail-biter, never the loser’s zeroed one', async () => {
    // A timeout finish zeroes the LOSER's clock. Black is out of time; White won with 4s left.
    const pgn = pgnOf(['e4', 'e5'])
    const row = session(pgn, {
      result_reason: 'timeout',
      winner_player_id: 'me',
      white_time_ms: 4_000,
      black_time_ms: 0,
    })
    const f = await chessFacts(db(row), 'G', 'me', { ...CTX, won: true })
    expect(f.chess_wins_timeout).toBe(1)
    expect(f.chess_wins_under_10s).toBe(1)

    // Same row, but the winner still had plenty left.
    const relaxed = await chessFacts(db(session(pgn, { ...row, white_time_ms: 90_000 })), 'G', 'me', {
      ...CTX,
      won: true,
    })
    expect(relaxed.chess_wins_under_10s).toBeUndefined()
  })

  it('separates a back-rank mate from a knight mate', async () => {
    // A real back-rank finish: Black's king never left e8 and the queen swept the eighth rank.
    const backRank = pgnOf([
      'd3',
      'h5',
      'e4',
      'g6',
      'g4',
      'Nf6',
      'gxh5',
      'c6',
      'c3',
      'Nxh5',
      'h4',
      'a5',
      'Qe2',
      'Qb6',
      'f4',
      'Qa7',
      'Rh2',
      'Ng7',
      'Qg4',
      'd5',
      'Qxc8#',
    ])
    const back = await chessFacts(
      db(session(backRank, { result_reason: 'checkmate', winner_player_id: 'me' })),
      'G',
      'me',
      { ...CTX, won: true }
    )
    expect(back.chess_wins_back_rank).toBe(1)
    expect(back.chess_wins_knight_mate).toBeUndefined()

    // A smothered mate, mated by Black. The white king is on its own back rank, so this is the
    // case that would false-positive if the mating piece's type were not checked.
    const smothered = pgnOf([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bc4',
      'Nd4',
      'Nxe5',
      'Qg5',
      'Nxf7',
      'Qxg2',
      'Rf1',
      'Qxe4+',
      'Be2',
      'Nf3#',
    ])
    const knight = await chessFacts(
      db(session(smothered, { result_reason: 'checkmate', winner_player_id: 'rival' })),
      'G',
      'rival',
      { ...CTX, won: true }
    )
    expect(knight.chess_wins_knight_mate).toBe(1)
    expect(knight.chess_wins_back_rank).toBeUndefined()
  })

  it('counts a fork only when the checking piece also hits something else', async () => {
    // Qf3+ checks the king on f7 and attacks the knight on d5 down the other diagonal.
    const fork = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+'])
    const f = await chessFacts(db(session(fork)), 'G', 'me', CTX)
    expect(f.chess_checks_given).toBe(1)
    expect(f.chess_forks).toBe(1)
    expect(f.chess_double_checks).toBeUndefined()

    // A plain check with nothing else attacked is not a fork.
    const plain = pgnOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3'])
    const p = await chessFacts(db(session(plain)), 'G', 'me', CTX)
    expect(p.chess_forks).toBeUndefined()
  })

  it('emits nothing for a missing session or a player who never had a seat', async () => {
    expect(await chessFacts(db(null), 'G', 'me', CTX)).toEqual({})
    const spectator = await chessFacts(db(session(pgnOf(['e4', 'e5']))), 'G', 'someone-else', CTX)
    expect(spectator).toEqual({})
    // Seated, but the game ended before a move was made.
    expect(await chessFacts(db(session('')), 'G', 'me', CTX)).toEqual({})
  })
})
