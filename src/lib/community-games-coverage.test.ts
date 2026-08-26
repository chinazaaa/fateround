import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { GAME_TYPE_CONFIG } from './game-types'
import type { GameType } from '@/types'

/**
 * Guard for the "post your win goes nowhere" gap.
 *
 * A finished game renders `PostWinToCommunity` for the winner, but the post only lands if
 * `community_games` holds a row for that game type — otherwise `postWinFromGame` returns
 * `not_on_leaderboard` and the button is live with nothing behind it. Eighteen games shipped
 * in that state because `docs/new-game-checklist.md` §7 (seed the board in a migration) was
 * skipped; `20261026120100_community_games_backfill.sql` filled them in.
 *
 * The migrations are the only source of schema truth (boards can also be created by hand at
 * /admin/community, but a fresh `supabase db push` must stand on its own), so this test reads
 * them directly and fails when a game offers the button with no seeded board.
 */

const COMPONENTS_DIR = join(process.cwd(), 'src', 'components')
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Component directory → the game types it serves. Only directories that render
 * `PostWinToCommunity` need an entry; an unmapped one fails the last test below, which is
 * the drift signal when a new game lands.
 */
const DIR_TO_GAME_TYPES: Record<string, GameType[]> = {
  ayo: ['ayo'],
  bingo: ['bingo'],
  checkers: ['checkers'],
  chess: ['chess'],
  codewords: ['codewords'],
  'crazy-eights': ['crazy_eights'],
  crossword: ['crossword'],
  'describe-it': ['describe_it'],
  draughts10: ['checkers_international', 'checkers_nigeria'],
  landmine: ['landmine'],
  ludo: ['ludo'],
  'matching-pairs': ['matching_pairs'],
  monopoly: ['monopoly'],
  npat: ['i_call_on'],
  'quick-draw': ['quick_draw'],
  quiplash: ['quiplash'],
  rummy: ['rummy'],
  scrabble: ['scrabble'],
  'snake-and-ladder': ['snake_and_ladder'],
  sudoku: ['sudoku'],
  'tic-tac-toe': ['tic_tac_toe'],
  trivia: ['trivia'],
  'troll-run': ['troll_run'],
  'two-truths': ['two_truths'],
  uno: ['uno'],
  whot: ['whot'],
  'word-grouping': ['word_grouping'],
  'word-hunt': ['word_hunt'],
  'word-rush': ['word_rush'],
  'word-scramble': ['word_scramble'],
  'word-search': ['word_search'],
  'wordle-room': ['wordle_room'],
  yahtzee: ['yahtzee'],
  // Not a game — the shared component and its own tests live here.
  community: [],
}

/** Component directories whose finished screen renders the post-your-win button. */
function dirsUsingPostWin(): string[] {
  return readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dir) => {
      const dirPath = join(COMPONENTS_DIR, dir)
      return readdirSync(dirPath).some(
        (file) =>
          file.endsWith('.tsx') &&
          !file.endsWith('.test.tsx') &&
          readFileSync(join(dirPath, file), 'utf8').includes('PostWinToCommunity')
      )
    })
    .sort()
}

/** Every `game_type` value referenced by a community_games INSERT across all migrations. */
function seededGameTypes(): Set<string> {
  const seeded = new Set<string>()
  const removed = new Set<string>()
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const match of sql.matchAll(/insert\s+into\s+community_games[\s\S]*?;/gi)) {
      for (const [, gameType] of match[0].matchAll(/'([a-z_0-9]+)'/g)) seeded.add(gameType)
    }
    for (const [, gameType] of sql.matchAll(
      /delete\s+from\s+community_games\s+where\s+game_type\s*=\s*'([a-z_0-9]+)'/gi
    )) {
      removed.add(gameType)
    }
  }
  for (const gameType of removed) seeded.delete(gameType)
  return seeded
}

describe('community leaderboard board coverage', () => {
  const usingPostWin = dirsUsingPostWin()

  it('finds the game folders that render PostWinToCommunity', () => {
    expect(usingPostWin.length).toBeGreaterThanOrEqual(30)
  })

  it('every component directory using PostWinToCommunity is mapped to its game types', () => {
    const unmapped = usingPostWin.filter((dir) => !(dir in DIR_TO_GAME_TYPES))
    expect(
      unmapped,
      'new game folder renders PostWinToCommunity but this test does not know its game type — ' +
        'add it to DIR_TO_GAME_TYPES so its leaderboard board gets checked'
    ).toEqual([])
  })

  it('every game offering the post-win button has a seeded community_games row', () => {
    const seeded = seededGameTypes()
    const missing = usingPostWin
      .flatMap((dir) => DIR_TO_GAME_TYPES[dir] ?? [])
      .filter((gameType) => !seeded.has(gameType))
    expect(
      [...new Set(missing)].sort(),
      'games render "post your win to the community leaderboard" but no migration creates their ' +
        'board, so the post silently returns not_on_leaderboard. Seed them (see ' +
        'docs/new-game-checklist.md §7).'
    ).toEqual([])
  })

  it('seeds no board for a game type that no longer exists', () => {
    const known = new Set(Object.keys(GAME_TYPE_CONFIG))
    const orphans = [...seededGameTypes()].filter((gameType) => !known.has(gameType))
    expect(orphans, 'community_games row for a retired game type — clean it up in a migration').toEqual([])
  })

  it('the backfill migration exists and sorts after every migration it depends on', () => {
    const backfill = '20261026120100_community_games_backfill.sql'
    expect(existsSync(join(MIGRATIONS_DIR, backfill)), backfill).toBe(true)
    // `game_type` is added to community_games by 20260701121000_community_self_post.sql.
    expect(backfill > '20260701121000_community_self_post.sql').toBe(true)
  })
})
