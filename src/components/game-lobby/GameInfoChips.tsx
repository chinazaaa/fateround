'use client'

import { crosswordThemeOptions } from '@/lib/crossword-puzzles'
import { wordSearchThemeOptions } from '@/lib/word-search-puzzles'
import { wordScrambleThemeOptions } from '@/lib/word-scramble-puzzles'
import { THEME_MAP } from '@/lib/themes'

/** Built-in theme id -> its label; an admin theme stores its NAME in the column, so a value
 *  that isn't a known built-in id is shown as-is. */
function puzzleThemeChip(options: { id: string; label: string }[], value: string): string {
  return options.find((o) => o.id === value)?.label ?? value
}

/** The subset of a game row this reads — kept loose so any game object can be passed. */
type GameMeta = {
  game_type?: string | null
  question_source?: string | null
  content_label?: string | null
  theme?: string | null
  max_players?: number | null
  anonymous?: boolean | null
  rounds_count?: number | null
  timer_seconds?: number | null
  game_duration_seconds?: number | null
  crossword_theme?: string | null
  crossword_difficulty?: string | null
  word_search_theme?: string | null
  word_search_difficulty?: string | null
  word_scramble_theme?: string | null
  word_scramble_difficulty?: string | null
  trivia_category?: string | null
  wst_quote_source?: string | null
  ludo_variant?: string | null
  ayo_variant?: string | null
  mahjong_ruleset?: string | null
  scrabble_clock_mode?: string | null
  scrabble_clock_seconds?: number | null
  bingo_call_mode?: string | null
  bingo_call_interval_seconds?: number | null
  whot_pick3_enabled?: boolean | null
  whot_cards_enabled?: boolean | null
  whot_number_calls_enabled?: boolean | null
  whot_pick2_stacking?: boolean | null
  crazy8_action_cards?: boolean | null
  crazy8_jokers?: boolean | null
  crazy8_pick2_stacking?: boolean | null
  uno_team_mode?: boolean | null
  uno_stacking?: boolean | null
  uno_zero_seven?: boolean | null
  uno_wd4_challenge?: boolean | null
  uno_multi_play_mode?: string | null
  uno_jump_in?: boolean | null
  monopoly_double_go_salary?: boolean | null
  monopoly_forced_auctions?: boolean | null
  monopoly_auction_timer_seconds?: number | null
  monopoly_no_rent_in_jail?: boolean | null
  monopoly_estate_dividend?: boolean | null
  landmine_mode?: string | null
  landmine_mine_count?: number | null
  landmine_originality_bonus?: boolean | null
  landmine_mine_source?: string | null
  mafia_doctor_enabled?: boolean | null
  mafia_detective_enabled?: boolean | null
  mafia_anonymous_votes?: boolean | null
  ping_pong_points_to_win?: number | null
  codewords_player_picks?: boolean | null
  codewords_randomize_teams?: boolean | null
  codewords_late_join?: boolean | null
  operative_timer_seconds?: number | null
}

/** Game types with a fixed 2-player format — a "players" pill would be pure noise. */
const FIXED_TWO_PLAYER = new Set([
  'chess',
  'checkers',
  'checkers_international',
  'checkers_nigeria',
  'tic_tac_toe',
  'ping_pong',
])

/** These duel games clock `timer_seconds` themselves (a per-player or per-turn clock set via
 *  HostDuelLobbyPanel) rather than `game_duration_seconds` — shown here instead of the generic
 *  session-length chip below, which would otherwise misreport them as "No time limit". */
const DUEL_CLOCK_LABEL: Record<string, string> = {
  chess: 'Time per player',
  checkers: 'Time per player',
  tic_tac_toe: 'Turn timer',
}

/** Game types that already show their own (correctly defaulted/clamped) player-count chip
 *  via `GameLobbySummary` — skip the generic pill here to avoid a duplicate. */
const SKIP_MAX_PLAYERS_PILL = new Set(['anonymous_messages'])

/** Game types where rounds/per-round timer are the meaningful pace settings (question- or
 *  prompt-based games). Board/card games use their own turn-timer or session-duration fields. */
const ROUNDS_TIMER_TYPES = new Set([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'parent_approval',
  'two_truths',
  'quiplash',
  'describe_it',
  'quick_draw',
  'word_rush',
  'trivia',
  'landmine',
  'matching_pairs',
  'word_hunt',
  'i_call_on',
])

/** Game types where `anonymous` actually changes gameplay (poll-family — hides who said what).
 *  The DB column defaults `true` for every game row regardless of type, so it must be gated
 *  here or every non-poll game would show a meaningless "Anonymous" pill. */
const ANONYMOUS_CAPABLE_TYPES = new Set([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'parent_approval',
  'two_truths',
])

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'No time limit'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (s === 0) return `${m} min`
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function humanize(s: string): string {
  return s.split('_').map(capitalize).join(' ')
}

/**
 * Player-facing summary of a game's settings — so people know what they're joining
 * before they commit (player count, timing, house rules, theme, category, etc.).
 * Returns short chips like "Theme · Animals", "Up to 8 players", "Stacking".
 */
export function gameInfoItems(game: GameMeta | null | undefined): string[] {
  if (!game) return []
  const items: string[] = []
  const isCustomPool = game.question_source === 'custom'
  const gt = game.game_type ?? ''

  // Host-set content label ("Maths", "Bible trivia") leads, so joiners see what the pack
  // is about before committing.
  if (game.content_label?.trim()) items.push(game.content_label.trim())

  if (
    typeof game.max_players === 'number' &&
    game.max_players > 0 &&
    !FIXED_TWO_PLAYER.has(gt) &&
    !SKIP_MAX_PLAYERS_PILL.has(gt)
  ) {
    items.push(`👥 Up to ${game.max_players} players`)
  }

  if (DUEL_CLOCK_LABEL[gt]) {
    items.push(`⏱ ${DUEL_CLOCK_LABEL[gt]} · ${formatDuration(game.timer_seconds ?? 0)}`)
  } else if (typeof game.game_duration_seconds === 'number') {
    // Session-length cap (currently used by Monopoly-style games). Shown even when unlimited —
    // that's exactly what a time-pressed player needs to know before joining.
    items.push(`⏳ ${formatDuration(game.game_duration_seconds)}`)
  }

  if (ROUNDS_TIMER_TYPES.has(gt)) {
    if (typeof game.rounds_count === 'number' && game.rounds_count > 0) {
      items.push(`${game.rounds_count} rounds`)
    }
    if (typeof game.timer_seconds === 'number' && game.timer_seconds > 0) {
      items.push(`⏱ ${game.timer_seconds}s per round`)
    }
  }

  if (game.anonymous && ANONYMOUS_CAPABLE_TYPES.has(gt)) items.push('🕶️ Anonymous')

  if (game.theme && game.theme !== 'default') {
    items.push(`🎨 ${THEME_MAP[game.theme as keyof typeof THEME_MAP]?.label ?? humanize(game.theme)} theme`)
  }

  if (gt === 'crossword') {
    if (!isCustomPool && game.crossword_theme)
      items.push(puzzleThemeChip(crosswordThemeOptions(), game.crossword_theme))
    if (game.crossword_difficulty) items.push(capitalize(game.crossword_difficulty))
  } else if (gt === 'word_search') {
    if (!isCustomPool && game.word_search_theme)
      items.push(puzzleThemeChip(wordSearchThemeOptions(), game.word_search_theme))
    if (game.word_search_difficulty) items.push(capitalize(game.word_search_difficulty))
  } else if (gt === 'word_scramble') {
    if (!isCustomPool && game.word_scramble_theme)
      items.push(puzzleThemeChip(wordScrambleThemeOptions(), game.word_scramble_theme))
    if (game.word_scramble_difficulty) items.push(capitalize(game.word_scramble_difficulty))
  } else if (gt === 'trivia') {
    if (game.trivia_category) items.push(game.trivia_category === 'tech' ? 'Tech' : 'General knowledge')
  } else if (gt === 'who_said_this') {
    if (game.wst_quote_source) {
      const labels: Record<string, string> = {
        player: 'Player quotes',
        anime: 'Anime quotes',
        both: 'Player + anime quotes',
        deck: 'Deck quotes',
      }
      items.push(labels[game.wst_quote_source] ?? humanize(game.wst_quote_source))
    }
  } else if (gt === 'ludo') {
    if (game.ludo_variant) items.push(`${capitalize(game.ludo_variant)} rules`)
  } else if (gt === 'ayo') {
    if (game.ayo_variant) items.push(`${capitalize(game.ayo_variant)} rules`)
  } else if (gt === 'mahjong') {
    if (game.mahjong_ruleset) items.push(humanize(game.mahjong_ruleset))
  } else if (gt === 'scrabble') {
    if (game.scrabble_clock_mode === 'chess' && game.scrabble_clock_seconds) {
      items.push(`⏱ Chess clock · ${formatDuration(game.scrabble_clock_seconds)}`)
    }
  } else if (gt === 'bingo') {
    items.push(game.bingo_call_mode === 'auto' ? '🔊 Auto-call' : '🎙️ Host calls')
    if (game.bingo_call_mode === 'auto' && game.bingo_call_interval_seconds) {
      items.push(`Every ${game.bingo_call_interval_seconds}s`)
    }
  } else if (gt === 'whot') {
    if (game.whot_pick3_enabled) items.push('🃏 Pick 3')
    if (game.whot_cards_enabled) items.push('🌀 WHOT(20)')
    if (game.whot_number_calls_enabled) items.push('🔢 Number calls')
    if (game.whot_pick2_stacking) items.push('📚 Pick 2 stacking')
  } else if (gt === 'crazy_eights') {
    if (game.crazy8_action_cards) items.push('🎬 Action cards')
    if (game.crazy8_jokers) items.push('🃏 Jokers')
    if (game.crazy8_pick2_stacking) items.push('📚 Pick 2 stacking')
  } else if (gt === 'uno') {
    if (game.uno_team_mode) items.push('🤝 Team-Up')
    if (game.uno_stacking) items.push('📚 Stacking')
    if (game.uno_zero_seven) items.push('🔁 0-7 rule')
    if (game.uno_wd4_challenge !== false) items.push('⚖️ WD4 challenge')
    if (game.uno_multi_play_mode && game.uno_multi_play_mode !== 'off') items.push('🃏 Multi-Play')
    if (game.uno_jump_in) items.push('⚡ Jump-In')
  } else if (gt === 'monopoly') {
    if (game.monopoly_double_go_salary) items.push('💰 Double GO salary')
    if (game.monopoly_forced_auctions) items.push('🔨 Forced auctions')
    if (game.monopoly_no_rent_in_jail) items.push('🚫 No rent in jail')
    if (game.monopoly_estate_dividend) items.push('🏦 Estate dividend')
  } else if (gt === 'landmine') {
    items.push(game.landmine_mode === 'elimination' ? '💥 Elimination' : '0️⃣ Zero points')
    if (typeof game.landmine_mine_count === 'number') items.push(`💣 ${game.landmine_mine_count} mines`)
    if (game.landmine_originality_bonus) items.push('✨ Originality bonus')
    if (game.landmine_mine_source === 'manual') items.push('🕵️ Manual setter')
  } else if (gt === 'mafia') {
    if (game.mafia_doctor_enabled) items.push('💉 Doctor')
    if (game.mafia_detective_enabled) items.push('🔍 Detective')
    if (game.mafia_anonymous_votes) items.push('🕶️ Anonymous votes')
  } else if (gt === 'ping_pong') {
    if (game.ping_pong_points_to_win) items.push(`🏓 First to ${game.ping_pong_points_to_win}`)
  } else if (gt === 'codewords') {
    if (game.codewords_player_picks) items.push('🙋 Players pick roles')
    if (game.codewords_randomize_teams) items.push('🎲 Randomized operatives')
    if (game.codewords_late_join) items.push('🚪 Late join allowed')
    if (typeof game.operative_timer_seconds === 'number' && game.operative_timer_seconds > 0) {
      items.push(`⏱ ${game.operative_timer_seconds}s guess timer`)
    }
  }

  return items
}

/** Renders {@link gameInfoItems} as a row of subtle pills. Renders nothing when empty. */
export function GameInfoChips({
  game,
  className = '',
  align = 'center',
}: {
  game: GameMeta | null | undefined
  className?: string
  align?: 'center' | 'left'
}) {
  const items = gameInfoItems(game)
  if (items.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${align === 'center' ? 'justify-center' : ''} ${className}`}>
      {items.map((item, i) => (
        <span
          key={i}
          className="rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-1 text-xs font-semibold text-muted"
        >
          {item}
        </span>
      ))}
    </div>
  )
}
