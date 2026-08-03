import { describe, expect, it } from 'vitest'
import type { LudoPiece } from '@/types'
import type { FactsContext } from './index'
import { ludoFacts } from './ludo'

/**
 * The builder reads two tables — the players' state rows (pieces + the in-play `game_counters`
 * accumulator) and the session's winner. The mock is those two. Every case here is a rule someone
 * could write in admin, so a wrong derivation is a silently unearnable trophy.
 */
type Row = {
  player_id: string
  color: string
  pieces: LudoPiece[] | null
  game_counters: Record<string, number> | null
}

function db(rows: Row[], winnerId: string | null = null) {
  return {
    from(table: string) {
      if (table === 'ludo_sessions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { winner_player_id: winnerId } }) }),
          }),
        }
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: rows }) }) }
    },
  } as never
}

const finished = (id: number): LudoPiece => ({ id, zone: 'finished', pos: 0 })
const base = (id: number): LudoPiece => ({ id, zone: 'base', pos: id })
const track = (id: number, pos: number): LudoPiece => ({ id, zone: 'track', pos })

/** A four-piece set with the first `n` pieces finished and the rest in the yard. */
function withHome(n: number): LudoPiece[] {
  return [0, 1, 2, 3].map((id) => (id < n ? finished(id) : base(id)))
}

function ctx(seated: number): FactsContext {
  return {
    timerSeconds: 60,
    questionSource: null,
    theme: null,
    seated: Array.from({ length: seated }, (_, i) => `p${i}`),
    winners: [],
  }
}

async function factsFor(rows: Row[], winnerId: string | null, seated: number, who = 'me') {
  const map = await ludoFacts(db(rows, winnerId), 'G', ctx(seated))
  return map.get(who) ?? {}
}

const row = (
  player_id: string,
  game_counters: Record<string, number>,
  pieces: LudoPiece[] = withHome(0),
  color = 'red'
): Row => ({
  player_id,
  color,
  pieces,
  game_counters,
})

describe('ludoFacts', () => {
  it('passes lifetime tallies through as this game’s raw count', async () => {
    const f = await factsFor(
      [
        row('me', {
          sixes_rolled: 2,
          double_sixes: 1,
          captures_made: 3,
          safe_landings: 1,
          pieces_deployed: 4,
          times_captured: 1,
        }),
      ],
      null,
      1
    )
    expect(f.ludo_sixes_rolled).toBe(2)
    expect(f.ludo_double_sixes).toBe(1)
    expect(f.ludo_captures_made).toBe(3)
    expect(f.ludo_safe_landings).toBe(1)
    expect(f.ludo_pieces_deployed).toBe(4)
    expect(f.ludo_times_captured).toBe(1)
  })

  it('omits tallies that are zero rather than emitting a noisy 0', async () => {
    const f = await factsFor([row('me', {})], null, 1)
    expect(f.ludo_sixes_rolled).toBeUndefined()
    expect(f.ludo_captures_made).toBeUndefined()
  })

  it('flags three and five sixes at their thresholds', async () => {
    expect((await factsFor([row('me', { sixes_rolled: 2 })], null, 1)).ludo_six_sense_games).toBeUndefined()
    expect((await factsFor([row('me', { sixes_rolled: 3 })], null, 1)).ludo_six_sense_games).toBe(1)
    const hot = await factsFor([row('me', { sixes_rolled: 5 })], null, 1)
    expect(hot.ludo_six_sense_games).toBe(1)
    expect(hot.ludo_dice_hot_games).toBe(1)
    expect((await factsFor([row('me', { sixes_rolled: 4 })], null, 1)).ludo_dice_hot_games).toBeUndefined()
  })

  it('derives pieces-home flags from the final board', async () => {
    const two = await factsFor([row('me', {}, withHome(2))], null, 1)
    expect(two.ludo_pieces_home_1).toBe(1)
    expect(two.ludo_pieces_home_2).toBe(1)
    expect(two.ludo_pieces_home_3).toBeUndefined()
    const none = await factsFor([row('me', {}, withHome(0))], null, 1)
    expect(none.ludo_pieces_home_1).toBeUndefined()
  })

  it('reads the in-play board-shape flags', async () => {
    const f = await factsFor(
      [row('me', { full_deploy: 1, shield: 1, fast_start: 1, dsix_streak_max: 3, max_captures_in_move: 2 })],
      null,
      1
    )
    expect(f.ludo_full_deploy_games).toBe(1)
    expect(f.ludo_shield_games).toBe(1)
    expect(f.ludo_fast_start_games).toBe(1)
    expect(f.ludo_gridlock_games).toBe(1)
    expect(f.ludo_double_capture_games).toBe(1)
  })

  it('flags sent-packing on three captures of one opponent, from the per-colour tallies', async () => {
    expect(
      (await factsFor([row('me', { cap_vs_green: 2, cap_vs_blue: 2 })], null, 1)).ludo_sent_packing_games
    ).toBeUndefined()
    expect((await factsFor([row('me', { cap_vs_green: 3 })], null, 1)).ludo_sent_packing_games).toBe(1)
  })

  it('flags escape-artist only when a captured piece actually reached home', async () => {
    // Piece 1 was captured (bit 1) and is now finished → escaped.
    const escaped = await factsFor(
      [row('me', { captured_mask: 0b10 }, [finished(0), finished(1), base(2), base(3)])],
      null,
      1
    )
    expect(escaped.ludo_escape_artist_games).toBe(1)
    // Piece 1 was captured but never made it home → no flag.
    const stranded = await factsFor(
      [row('me', { captured_mask: 0b10 }, [finished(0), base(1), base(2), base(3)])],
      null,
      1
    )
    expect(stranded.ludo_escape_artist_games).toBeUndefined()
  })

  it('awards the untouched win only to the winner, and only in a real table', async () => {
    const winnerUntouched = await factsFor([row('me', { times_captured: 0 }, withHome(4))], 'me', 2)
    expect(winnerUntouched.ludo_untouched_wins).toBe(1)
    // Won but a piece was captured — no untouched.
    const winnerTouched = await factsFor([row('me', { times_captured: 1 }, withHome(4))], 'me', 2)
    expect(winnerTouched.ludo_untouched_wins).toBeUndefined()
    // Solo (one seat) is not a real table for a win.
    const solo = await factsFor([row('me', { times_captured: 0 }, withHome(4))], 'me', 1)
    expect(solo.ludo_untouched_wins).toBeUndefined()
  })

  it('never reads a non-winner as a loss: win flags withhold, tallies stay', async () => {
    const f = await factsFor(
      [row('me', { captures_made: 6, times_captured: 0 }, withHome(2)), row('rival', {}, withHome(4))],
      'rival',
      3
    )
    expect(f.ludo_captures_made).toBe(6)
    expect(f.ludo_clean_sweep_games).toBe(1) // capture-count trophy needs no win
    expect(f.ludo_untouched_wins).toBeUndefined()
    expect(f.ludo_untouched_sweep_wins).toBeUndefined()
  })

  it('gates the capture and player-count trophies on seat minimums', async () => {
    // 5 captures but only 2 seats → clean sweep withheld (needs 3+).
    expect((await factsFor([row('me', { captures_made: 5 })], null, 2)).ludo_clean_sweep_games).toBeUndefined()
    expect((await factsFor([row('me', { captures_made: 5 })], null, 3)).ludo_clean_sweep_games).toBe(1)
    // Four corners needs four seats.
    expect((await factsFor([row('me', {}, withHome(4))], 'me', 3)).ludo_four_corners_wins).toBeUndefined()
    expect((await factsFor([row('me', {}, withHome(4))], 'me', 4)).ludo_four_corners_wins).toBe(1)
  })

  it('stacks the platinum wins when every gate is met', async () => {
    const f = await factsFor([row('me', { captures_made: 5, times_captured: 0 }, withHome(4))], 'me', 4)
    expect(f.ludo_four_corners_wins).toBe(1)
    expect(f.ludo_perfect_run_wins).toBe(1)
    expect(f.ludo_untouched_sweep_wins).toBe(1)
    expect(f.ludo_untouched_wins).toBe(1)
  })

  it('awards comeback only after a full yard-out, and only on a win', async () => {
    expect((await factsFor([row('me', { all_four_yarded: 1 }, withHome(4))], 'me', 2)).ludo_comeback_wins).toBe(1)
    // Same flag but not the winner → withheld.
    expect(
      (await factsFor([row('me', { all_four_yarded: 1 }, withHome(2)), row('w', {}, withHome(4))], 'w', 2, 'me'))
        .ludo_comeback_wins
    ).toBeUndefined()
  })

  it('awards runaway only when no opponent reached two home', async () => {
    const clean = await factsFor([row('me', {}, withHome(4)), row('slow', {}, withHome(1))], 'me', 2)
    expect(clean.ludo_runaway_games).toBe(1)
    const close = await factsFor([row('me', {}, withHome(4)), row('fast', {}, withHome(2))], 'me', 2)
    expect(close.ludo_runaway_games).toBeUndefined()
  })

  it('judges each player of the round from a single call', async () => {
    const map = await ludoFacts(
      db(
        [
          row('me', { captures_made: 5, times_captured: 0, sixes_rolled: 3 }, withHome(4)),
          row('rival', { times_captured: 2 }, [track(0, 5), base(1), base(2), base(3)]),
        ],
        'me'
      ),
      'G',
      ctx(3)
    )
    expect(map.size).toBe(2)
    expect(map.get('me')?.ludo_untouched_sweep_wins).toBe(1)
    expect(map.get('me')?.ludo_six_sense_games).toBe(1)
    expect(map.get('rival')?.ludo_times_captured).toBe(2)
    expect(map.get('rival')?.ludo_untouched_wins).toBeUndefined()
    expect(map.get('rival')?.ludo_pieces_home_1).toBeUndefined()
  })

  it('returns nothing when a player has no state row', async () => {
    const map = await ludoFacts(db([]), 'G', ctx(2))
    expect(map.size).toBe(0)
    expect(map.get('ghost')).toBeUndefined()
  })
})
