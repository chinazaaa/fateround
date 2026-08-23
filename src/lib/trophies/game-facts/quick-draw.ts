import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Quick Draw per-game facts, derived at finish from rows the game already wrote.
 *
 * TWO GAMES, ONE GAME TYPE. `games.quick_draw_variant` selects between two completely
 * separate rule sets and table sets:
 *
 *  - **`lie`** (draw a secret prompt → everyone else writes a fake title for it → the room
 *    votes for the one they think is real). Rows: `quick_draw_drawings`,
 *    `quick_draw_titles` (`is_real` marks the prompt), `quick_draw_votes`.
 *  - **`guess`** (one drawer, the rest race to type the word). Rows:
 *    `quick_draw_guess_words` (one per resolved word: drawer, guesser, guessed/skipped) and
 *    `quick_draw_guess_guesses` (one per typed guess, with `correct`).
 *
 * A room only ever populates one set, so this reads the variant first and dispatches — a
 * `lie` room never pays for the guess-mode reads and vice versa. The counters are shared
 * where the concept is genuinely the same (`quick_draw_drawings_submitted` counts a drawing
 * in either variant) and variant-specific where it isn't; the trophies built on the
 * variant-specific ones simply never fire in the other mode, which is correct.
 *
 * ONE CALL PER ROUND, NOT PER PLAYER — every player's facts fall out of one sweep of the
 * rows (see game-facts/index.ts for why).
 *
 * WHY FLAGS AND NOT VALUES. Counters accumulate for life and the rule DSL only asks
 * `counter >= n`, so a per-game achievement ("fooled three people this game") is emitted as
 * a 0/1 flag counted once; only genuinely cumulative measures (drawings made, words guessed,
 * people fooled) are emitted as real totals. See game-facts/trivia.ts for the full rationale.
 *
 * WHAT THE DATA CANNOT HONESTLY SUPPORT — omitted rather than approximated:
 *  - TIMING ("guessed in under 5 seconds", "fastest guesser"). Neither variant persists when
 *    a turn's clock started: `quick_draw_guess_sessions.turn_deadline_at` is live state,
 *    overwritten each turn and gone by finish, and guess-mode `points` are stored per the
 *    describe-it scale without the window they decayed over. `created_at` deltas measure the
 *    gap between two guesses, not time-since-the-drawing-started.
 *  - DRAWING EFFORT ("used every colour", "under 20 strokes"). `stroke_data` is retained, but
 *    reading and walking every drawing's stroke JSON at finish would multiply the award
 *    pass's cost for a cosmetic trophy. Deliberately not read.
 *  - HOST trophies. A non-playing host holds only a spectator row, which the award pass
 *    refuses, so a "host N games" counter could never fire — omitted as in Trivia.
 */

/** A drawing has to draw real votes before "nobody was fooled" means anything. */
const CLEAN_READ_MIN_VOTERS = 2

/** A perfect-voter run over one drawing is luck; over three it is a read on the room. */
const PERFECT_VOTER_MIN_DRAWINGS = 3

/** A drawer turn needs a few words before "every word landed" is an achievement. */
const FLAWLESS_TURN_MIN_WORDS = 3

type DrawingRow = { id: string; player_id: string }
type TitleRow = { id: string; drawing_id: string; player_id: string | null; is_real: boolean }
type VoteRow = { drawing_id: string; player_id: string; chosen_title_id: string }

type GuessWordRow = {
  turn_index: number
  drawer_player_id: string | null
  status: 'guessed' | 'skipped'
  guesser_player_id: string | null
}
type GuessRow = { player_id: string; turn_index: number; correct: boolean | null }

function bump(facts: Map<string, Record<string, number>>, playerId: string, key: string, by = 1): void {
  const row = facts.get(playerId) ?? {}
  row[key] = (row[key] ?? 0) + by
  facts.set(playerId, row)
}

function flag(facts: Map<string, Record<string, number>>, playerId: string, key: string): void {
  const row = facts.get(playerId) ?? {}
  row[key] = 1
  facts.set(playerId, row)
}

/**
 * `lie` variant. Scoring (see `tallyQuickDrawScores` in src/lib/quick-draw.ts) pays the
 * artist for votes on the real title, the fake author for votes on their decoy, and the
 * voter a point for finding the real one — so "fools" and "correct reads" are the two
 * honest lifetime measures, and both come straight out of the vote rows.
 */
async function lieFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext,
  out: Map<string, Record<string, number>>
): Promise<void> {
  const [{ data: drawingsData }, { data: titlesData }, { data: votesData }] = await Promise.all([
    supabase.from('quick_draw_drawings').select('id, player_id').eq('game_id', gameId),
    supabase.from('quick_draw_titles').select('id, drawing_id, player_id, is_real').eq('game_id', gameId),
    supabase.from('quick_draw_votes').select('drawing_id, player_id, chosen_title_id').eq('game_id', gameId),
  ])

  const drawings = (drawingsData ?? []) as DrawingRow[]
  const titles = (titlesData ?? []) as TitleRow[]
  const votes = (votesData ?? []) as VoteRow[]
  if (!drawings.length) return

  const seated = new Set(ctx.seated)
  const titleById = new Map(titles.map((title) => [title.id, title]))
  const artistByDrawing = new Map(drawings.map((drawing) => [drawing.id, drawing.player_id]))

  for (const drawing of drawings) {
    if (seated.has(drawing.player_id)) bump(out, drawing.player_id, 'quick_draw_drawings_submitted')
  }

  // Per fake title: how many voters it caught. Per drawing: how many voted, and how many
  // of those found the real title.
  const foolsByTitle = new Map<string, number>()
  const votersByDrawing = new Map<string, number>()
  const correctByDrawing = new Map<string, number>()
  /** playerId → drawings they voted on, and how many of those they read correctly. */
  const votedByPlayer = new Map<string, { voted: number; correct: number }>()

  for (const vote of votes) {
    const title = titleById.get(vote.chosen_title_id)
    if (!title) continue
    votersByDrawing.set(vote.drawing_id, (votersByDrawing.get(vote.drawing_id) ?? 0) + 1)

    const tally = votedByPlayer.get(vote.player_id) ?? { voted: 0, correct: 0 }
    tally.voted += 1

    if (title.is_real) {
      tally.correct += 1
      correctByDrawing.set(vote.drawing_id, (correctByDrawing.get(vote.drawing_id) ?? 0) + 1)
    } else if (title.player_id) {
      foolsByTitle.set(title.id, (foolsByTitle.get(title.id) ?? 0) + 1)
    }
    votedByPlayer.set(vote.player_id, tally)
  }

  // Fools, credited to the author of the decoy that caught them.
  const foolsThisGame = new Map<string, number>()
  const bestSingleDecoy = new Map<string, number>()
  for (const [titleId, caught] of foolsByTitle) {
    const author = titleById.get(titleId)?.player_id
    if (!author || !seated.has(author)) continue
    foolsThisGame.set(author, (foolsThisGame.get(author) ?? 0) + caught)
    bestSingleDecoy.set(author, Math.max(bestSingleDecoy.get(author) ?? 0, caught))
  }
  for (const [playerId, caught] of foolsThisGame) {
    bump(out, playerId, 'quick_draw_fools', caught)
    if (caught >= 3) flag(out, playerId, 'quick_draw_triple_fool_games')
  }
  for (const [playerId, caught] of bestSingleDecoy) {
    if (caught >= 3) flag(out, playerId, 'quick_draw_mass_fool_games')
  }

  // The artist's side of the same coin: a drawing so clear that every voter found the
  // real title, decoys and all.
  for (const [drawingId, voters] of votersByDrawing) {
    if (voters < CLEAN_READ_MIN_VOTERS) continue
    if ((correctByDrawing.get(drawingId) ?? 0) !== voters) continue
    const artist = artistByDrawing.get(drawingId)
    if (artist && seated.has(artist)) flag(out, artist, 'quick_draw_unmistakable_games')
  }

  for (const [playerId, tally] of votedByPlayer) {
    if (!seated.has(playerId)) continue
    if (tally.correct > 0) bump(out, playerId, 'quick_draw_correct_reads', tally.correct)
    if (tally.voted >= PERFECT_VOTER_MIN_DRAWINGS && tally.correct === tally.voted) {
      flag(out, playerId, 'quick_draw_perfect_voter_games')
    }
  }
}

/**
 * `guess` variant. `quick_draw_guess_words` is the record of every resolved word — who drew
 * it, who got it, whether it was guessed or skipped — so guesser and drawer trophies both
 * come from one table, with `quick_draw_guess_guesses` supplying the wrong-guess volume.
 */
async function guessFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext,
  out: Map<string, Record<string, number>>
): Promise<void> {
  const [{ data: wordsData }, { data: guessesData }] = await Promise.all([
    supabase
      .from('quick_draw_guess_words')
      .select('turn_index, drawer_player_id, status, guesser_player_id')
      .eq('game_id', gameId),
    supabase.from('quick_draw_guess_guesses').select('player_id, turn_index, correct').eq('game_id', gameId),
  ])

  const words = (wordsData ?? []) as GuessWordRow[]
  const guesses = (guessesData ?? []) as GuessRow[]
  if (!words.length && !guesses.length) return

  const seated = new Set(ctx.seated)

  const guessedThisGame = new Map<string, number>()
  /** drawerId → turnIndex → { total, guessed } so a flawless turn is checkable per turn. */
  const drawerTurns = new Map<string, Map<number, { total: number; guessed: number }>>()

  for (const word of words) {
    if (word.status === 'guessed' && word.guesser_player_id && seated.has(word.guesser_player_id)) {
      guessedThisGame.set(word.guesser_player_id, (guessedThisGame.get(word.guesser_player_id) ?? 0) + 1)
    }
    if (!word.drawer_player_id || !seated.has(word.drawer_player_id)) continue
    const turns = drawerTurns.get(word.drawer_player_id) ?? new Map<number, { total: number; guessed: number }>()
    const turn = turns.get(word.turn_index) ?? { total: 0, guessed: 0 }
    turn.total += 1
    if (word.status === 'guessed') turn.guessed += 1
    turns.set(word.turn_index, turn)
    drawerTurns.set(word.drawer_player_id, turns)
  }

  for (const [playerId, count] of guessedThisGame) {
    bump(out, playerId, 'quick_draw_words_guessed', count)
    if (count >= 5) flag(out, playerId, 'quick_draw_five_guess_games')
  }

  for (const [playerId, turns] of drawerTurns) {
    bump(out, playerId, 'quick_draw_drawer_turns', turns.size)
    let landed = 0
    for (const turn of turns.values()) {
      landed += turn.guessed
      if (turn.total >= FLAWLESS_TURN_MIN_WORDS && turn.guessed === turn.total) {
        flag(out, playerId, 'quick_draw_flawless_turn_games')
      }
    }
    if (landed > 0) bump(out, playerId, 'quick_draw_words_landed', landed)
  }

  // Volume of typed guesses, right or wrong — the "kept shouting until it stuck" measure.
  const attempts = new Map<string, number>()
  for (const guess of guesses) {
    if (!seated.has(guess.player_id)) continue
    attempts.set(guess.player_id, (attempts.get(guess.player_id) ?? 0) + 1)
  }
  for (const [playerId, count] of attempts) {
    if (count >= 20) flag(out, playerId, 'quick_draw_twenty_guess_games')
  }
}

export async function quickDrawFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()
  if (!ctx.seated.length) return out

  const { data: game } = await supabase.from('games').select('quick_draw_variant').eq('id', gameId).maybeSingle()
  // `lie` is the original variant and the column's default for rooms created before guess
  // mode landed, so anything that isn't explicitly 'guess' reads the lie tables.
  const variant = (game as { quick_draw_variant?: unknown } | null)?.quick_draw_variant === 'guess' ? 'guess' : 'lie'

  if (variant === 'guess') await guessFacts(supabase, gameId, ctx, out)
  else await lieFacts(supabase, gameId, ctx, out)

  // Room-size fact is variant-agnostic: it describes the table, not the rules.
  if (ctx.seated.length >= 6) {
    for (const playerId of ctx.seated) {
      if (out.has(playerId)) flag(out, playerId, 'quick_draw_full_lobby_games')
    }
  }

  return out
}
