import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { chessFacts } from './chess'

/**
 * The facts builder reads one row and nothing else, so the mock is a single object.
 * Every case here is a rule someone could write in admin — if the derivation is wrong the
 * trophy is silently unearnable, which is indistinguishable from a typo.
 *
 * The builder runs once per ROUND and returns a map keyed by player id, so a single call yields
 * both colours' facts from a single replay — the capture-counting case below asserts exactly that.
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

const CTX = { timerSeconds: 300, questionSource: null, seated: ['me', 'rival'], winners: [] as string[] }

/** A finished session with `me` as White, filled in by each test. */
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

/** One player's facts out of the round's map; `{}` when the builder had nothing to say. */
async function factsFor(row: Record<string, unknown> | null, playerId: string, ctx = CTX) {
  const map = await chessFacts(db(row), 'G', ctx)
  return map.get(playerId) ?? {}
}

describe('chessFacts', () => {
  it('records a scholar’s mate as a checkmate win inside twelve moves', async () => {
    const pgn = pgnOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    const row = session(pgn, { result_reason: 'checkmate', winner_player_id: 'me' })
    const f = await factsFor(row, 'me', { ...CTX, winners: ['me'] })

    expect(f.chess_wins_checkmate).toBe(1)
    expect(f.chess_wins_mate_in_12).toBe(1)
    expect(f.chess_wins_mate_in_20).toBe(1)
    // Four full moves, one capture (the f7 pawn), and the queen delivered the mate.
    expect(f.chess_captures).toBe(1)
    expect(f.chess_wins_knight_mate).toBeUndefined()
    expect(f.chess_wins_back_rank).toBeUndefined()
  })

  it('counts captures for both colours out of one replay of one row', async () => {
    // White takes on e5 and on d5; Black takes once on e5. Neither player may be credited
    // with the other's work — and one call over the shared row must produce both.
    const pgn = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Nxe5', 'Nxe5', 'd4', 'd5', 'exd5'])
    const map = await chessFacts(db(session(pgn)), 'G', CTX)

    expect(map.get('me')?.chess_captures).toBe(2)
    expect(map.get('rival')?.chess_captures).toBe(1)
  })

  it('separates kingside from queenside castling', async () => {
    const kingside = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])
    const queenside = pgnOf(['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7', 'O-O-O'])

    const k = await factsFor(session(kingside), 'me')
    const q = await factsFor(session(queenside), 'me')
    expect(k.chess_castles).toBe(1)
    expect(k.chess_queenside_castles).toBeUndefined()
    expect(q.chess_castles).toBe(1)
    expect(q.chess_queenside_castles).toBe(1)
  })

  it('tells an underpromotion apart from a queen promotion', async () => {
    // Same race to the eighth rank, promoting to a queen in one line and a knight in the other.
    const race = ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2', 'bxa8=Q']
    const queen = await factsFor(session(pgnOf(race)), 'me')
    const knight = await factsFor(session(pgnOf([...race.slice(0, -1), 'bxa8=N'])), 'me')

    expect(queen.chess_promotions).toBe(1)
    expect(queen.chess_underpromotions).toBeUndefined()
    expect(knight.chess_promotions).toBe(1)
    expect(knight.chess_underpromotions).toBe(1)
  })

  it('flags a clean sheet only when the opponent captured nothing', async () => {
    const clean = pgnOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    const messy = pgnOf(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'e5', 'Nf3', 'exd4', 'Nxd4'])

    const a = await factsFor(session(clean, { result_reason: 'checkmate', winner_player_id: 'me' }), 'me', {
      ...CTX,
      winners: ['me'],
    })
    const b = await factsFor(session(messy, { result_reason: 'resignation', winner_player_id: 'me' }), 'me', {
      ...CTX,
      winners: ['me'],
    })
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
    const f = await factsFor(row, 'me', { ...CTX, winners: ['me'] })
    expect(f.chess_wins_timeout).toBe(1)
    expect(f.chess_wins_under_10s).toBe(1)

    // Same row, but the winner still had plenty left.
    const relaxed = await factsFor(session(pgn, { ...row, white_time_ms: 90_000 }), 'me', {
      ...CTX,
      winners: ['me'],
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
    const back = await factsFor(session(backRank, { result_reason: 'checkmate', winner_player_id: 'me' }), 'me', {
      ...CTX,
      winners: ['me'],
    })
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
    const knight = await factsFor(
      session(smothered, { result_reason: 'checkmate', winner_player_id: 'rival' }),
      'rival',
      { ...CTX, winners: ['rival'] }
    )
    expect(knight.chess_wins_knight_mate).toBe(1)
    expect(knight.chess_wins_back_rank).toBeUndefined()
  })

  it('counts a fork only when the checking piece also hits something else', async () => {
    // Qf3+ checks the king on f7 and attacks the knight on d5 down the other diagonal.
    const fork = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+'])
    const f = await factsFor(session(fork), 'me')
    expect(f.chess_checks_given).toBe(1)
    expect(f.chess_forks).toBe(1)
    expect(f.chess_double_checks).toBeUndefined()

    // A plain check with nothing else attacked is not a fork.
    const plain = pgnOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3'])
    const p = await factsFor(session(plain), 'me')
    expect(p.chess_forks).toBeUndefined()
  })

  it('emits nothing for a missing session or a player who never had a seat', async () => {
    expect(await chessFacts(db(null), 'G', CTX)).toEqual(new Map())

    const traded = pgnOf(['e4', 'e5', 'Nf3', 'Nc6', 'Nxe5', 'Nxe5'])
    const played = await chessFacts(db(session(traded)), 'G', CTX)
    // Only the two seats are ever keys; anyone else in the room simply has no entry.
    expect(played.has('someone-else')).toBe(false)
    expect([...played.keys()].sort()).toEqual(['me', 'rival'])
  })

  it('still emits the result facts when the stored movetext is empty', async () => {
    // There is a finished game in production whose PGN is empty. Losing the replay must not lose
    // the facts that come straight off the row.
    const f = await factsFor(session('', { result_reason: 'resignation', winner_player_id: 'me' }), 'me', {
      ...CTX,
      winners: ['me'],
    })
    expect(f.chess_wins_resignation).toBe(1)
    expect(f.chess_captures).toBeUndefined()

    // An empty movetext with no result to report leaves nothing at all to say.
    expect(await chessFacts(db(session('')), 'G', CTX)).toEqual(new Map())
  })
})

describe('smothered mate is stricter than knight mate', () => {
  // The brief conflated the two. They must not be the same trophy twice: a knight mate is any
  // mate a knight delivers; a SMOTHERED mate additionally requires the king to be walled in by
  // its own pieces with nowhere to run.
  // Blackburne Shilling Gambit — Black smothers White's king on e1 with a knight on f3.
  const SMOTHERED = [
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
  ]

  it('a smothered mate sets both flags', async () => {
    const chess = new Chess()
    for (const san of SMOTHERED) chess.move(san)
    // Guard the fixture itself: if this line ever stops being mate the assertions below would
    // pass vacuously.
    expect(chess.isCheckmate(), 'fixture is not actually checkmate').toBe(true)

    // Black gives the mate, so `me` is Black here.
    const row = session(chess.pgn(), {
      player_white_id: 'rival',
      player_black_id: 'me',
      result_reason: 'checkmate',
      winner_player_id: 'me',
    })
    const f = await factsFor(row, 'me', { ...CTX, winners: ['me'] })
    expect(f.chess_wins_knight_mate).toBe(1)
    expect(f.chess_wins_smothered).toBe(1)
  })

  it('a knight mate in the open is NOT smothered', async () => {
    const open = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']
    const row = session(pgnOf(open), { result_reason: 'checkmate', winner_player_id: 'me' })
    const f = await factsFor(row, 'me', { ...CTX, winners: ['me'] })
    expect(f.chess_wins_smothered).toBeUndefined()
  })
})

describe('Immortal needs the opponent to keep their queen', () => {
  it('a plain queen trade does not count', async () => {
    // Otherwise every queen swap in the game would award a platinum, which is what made the
    // brief's "sacrificed" wording unusable as written.
    const trade = ['e4', 'e5', 'Qh5', 'Nf6', 'Qxe5+', 'Qe7', 'Qxe7+', 'Bxe7']
    const row = session(pgnOf(trade), { winner_player_id: 'me', result_reason: 'resignation' })
    const f = await factsFor(row, 'me', { ...CTX, winners: ['me'] })
    expect(f.chess_wins_after_queen_loss).toBe(1)
    expect(f.chess_wins_queen_sac).toBeUndefined()
  })
})
