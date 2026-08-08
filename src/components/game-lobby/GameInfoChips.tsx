'use client'

import { crosswordThemeOptions } from '@/lib/crossword-puzzles'
import { wordSearchThemeOptions } from '@/lib/word-search-puzzles'
import { wordScrambleThemeOptions } from '@/lib/word-scramble-puzzles'
import { THEME_MAP } from '@/lib/themes'
import { parseUnoRules } from '@/lib/uno'
import { Glyph } from '@/components/icons/Glyph'
import {
  UserMultipleIcon,
  StopWatchIcon,
  IncognitoIcon,
  PaintBrush01Icon,
  Megaphone01Icon,
  Mic01Icon,
  Cards01Icon,
  HashIcon,
  Layers01Icon,
  RocketIcon,
  UserGroupIcon,
  ShuffleIcon,
  BalanceScaleIcon,
  FlashIcon,
  Coins01Icon,
  Target01Icon,
  Cancel01Icon,
  BombIcon,
  SparklesIcon,
  MaskIcon,
  Moon02Icon,
  StarIcon,
  ClipboardIcon,
  TableTennisBatIcon,
  Link01Icon,
  DiceIcon,
} from '@hugeicons/core-free-icons'

const CHIP_EMOJI_ICONS: Record<string, any> = {
  '👥': UserMultipleIcon,
  '⏱': StopWatchIcon,
  '⏳': StopWatchIcon,
  '🕶️': IncognitoIcon,
  '🎨': PaintBrush01Icon,
  '🔊': Megaphone01Icon,
  '🎙️': Mic01Icon,
  '🃏': Cards01Icon,
  '🎴': Cards01Icon,
  '🌀': Cards01Icon,
  '🔢': HashIcon,
  '📚': Layers01Icon,
  '🎬': RocketIcon,
  '🤝': UserGroupIcon,
  '🔁': ShuffleIcon,
  '⚖️': BalanceScaleIcon,
  '⚡': FlashIcon,
  '💰': Coins01Icon,
  '🏦': Coins01Icon,
  '🔨': Target01Icon,
  '🚫': Cancel01Icon,
  '💥': BombIcon,
  '💣': BombIcon,
  '✨': SparklesIcon,
  '🕵️': IncognitoIcon,
  '🎭': MaskIcon,
  '🌙': Moon02Icon,
  '☀️': StarIcon,
  '🗳️': ClipboardIcon,
  '🏓': TableTennisBatIcon,
  '🙋': UserMultipleIcon,
  '🎲': DiceIcon,
  '🚪': Link01Icon,
  '0️⃣': Cancel01Icon,
}

function parseChipItem(item: string) {
  // Strip leading emoji if present and map to fr-glyph
  const match = item.match(
    /^((?:[\u{1F0A0}-\u{1F0FF}\u{1F300}-\u{1F9FF}\u{2300}-\u{23FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]|[0-9*#]\u{FE0F}?\u{20E3}|\u{FE0F}|\u{200D})+)\s*/u
  )
  if (match) {
    const rawEmoji = match[1].replace(/\u{FE0F}/gu, '')
    const cleanText = item.slice(match[0].length).trim()
    const IconComponent = CHIP_EMOJI_ICONS[match[1]] ?? CHIP_EMOJI_ICONS[rawEmoji] ?? CHIP_EMOJI_ICONS[match[1][0]]
    return { IconComponent, text: cleanText || item }
  }
  return { IconComponent: undefined, text: item }
}

function puzzleThemeChip(options: { id: string; label: string }[], value: string): string {
  return options.find((o) => o.id === value)?.label ?? value
}

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
  uno_uno_penalty?: number | null
  uno_wd4_challenge_penalty?: number | null
  uno_mode?: string | null
  uno_no_mercy_win?: string | null
  monopoly_double_go_salary?: boolean | null
  monopoly_forced_auctions?: boolean | null
  monopoly_auction_timer_seconds?: number | null
  monopoly_no_rent_in_jail?: boolean | null
  monopoly_estate_dividend?: boolean | null
  landmine_mode?: string | null
  landmine_mine_count?: number | null
  landmine_originality_bonus?: boolean | null
  landmine_mine_source?: string | null
  mafia_advanced_mode?: boolean | null
  mafia_anonymous_votes?: boolean | null
  mafia_day_seconds?: number | null
  mafia_voting_seconds?: number | null
  ping_pong_points_to_win?: number | null
  codewords_player_picks?: boolean | null
  codewords_randomize_teams?: boolean | null
  codewords_late_join?: boolean | null
  operative_timer_seconds?: number | null
}

const FIXED_TWO_PLAYER = new Set([
  'chess',
  'checkers',
  'checkers_international',
  'checkers_nigeria',
  'tic_tac_toe',
  'ping_pong',
])

const DUEL_CLOCK_LABEL: Record<string, string> = {
  chess: 'Time per player',
  checkers: 'Time per player',
  tic_tac_toe: 'Turn timer',
}

const SKIP_MAX_PLAYERS_PILL = new Set(['anonymous_messages'])

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

export function gameInfoItems(game: GameMeta | null | undefined): string[] {
  if (!game) return []
  const items: string[] = []
  const isCustomPool = game.question_source === 'custom'
  const gt = game.game_type ?? ''

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
  } else if (gt === 'mafia') {
    // Mafia has no overall session-length cap — it runs in per-phase timers (night/day/voting,
    // shown in the mafia-specific block below) rather than a duration, so skip the generic
    // "No time limit" chip that would otherwise misleadingly imply untimed phases too.
  } else if (typeof game.game_duration_seconds === 'number') {
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
    // Rule chips must reflect the EFFECTIVE rules, not the raw column values. In High
    // Stakes several rules are forced (stacking + 0-7 + Jump-In locked ON, WD4 challenge
    // + Team-Up + Multi-Play forced OFF) — reading the DB flags directly showed stale
    // Classic values (e.g. "WD4 challenge" on a High Stakes game where challenges are
    // disabled in the engine).
    // GameMeta only carries the uno_* subset the chips need, so cast to satisfy the
    // parseUnoRules signature — the fields it actually reads (uno_mode etc.) are all here.
    const uno = parseUnoRules(game as Parameters<typeof parseUnoRules>[0])
    if (uno.mode === 'no_mercy') {
      // High Stakes locks in stacking + 0-7 + Jump-In and disables WD4/Team-Up/
      // Multi-Play. Every one of those is implied by "High Stakes", so surface the
      // single mode chip instead of the redundant per-rule chips.
      items.push('💥 High Stakes')
    } else {
      if (uno.teamMode) items.push('🤝 Team-Up')
      if (uno.stacking) items.push('📚 Stacking')
      if (uno.zeroSeven) items.push('🔁 0-7 rule')
      if (uno.wd4Challenge) items.push('⚖️ WD4 challenge')
      if (uno.multiPlay !== 'off') items.push('🃏 Multi-Play')
      if (uno.jumpIn) items.push('⚡ Jump-In')
    }
  } else if (gt === 'monopoly') {
    if (game.monopoly_double_go_salary) items.push('💰 Double GO salary')
    if (game.monopoly_forced_auctions) items.push('🔨 Forced auctions')
    if (game.monopoly_no_rent_in_jail) items.push('🚫 No rent in NICKED')
    if (game.monopoly_estate_dividend) items.push('🏦 Estate dividend')
  } else if (gt === 'landmine') {
    items.push(game.landmine_mode === 'elimination' ? '💥 Elimination' : '0️⃣ Zero points')
    if (typeof game.landmine_mine_count === 'number') items.push(`💣 ${game.landmine_mine_count} mines`)
    if (game.landmine_originality_bonus) items.push('✨ Originality bonus')
    if (game.landmine_mine_source === 'manual') items.push('🕵️ Manual setter')
  } else if (gt === 'mafia') {
    items.push(game.mafia_advanced_mode === true ? '🎭 Advanced roles' : '🎭 Classic roles')
    if (typeof game.timer_seconds === 'number' && game.timer_seconds > 0) {
      items.push(`🌙 ${formatDuration(game.timer_seconds)} night`)
    }
    if (typeof game.mafia_day_seconds === 'number' && game.mafia_day_seconds > 0) {
      items.push(`☀️ ${formatDuration(game.mafia_day_seconds)} day`)
    }
    if (typeof game.mafia_voting_seconds === 'number' && game.mafia_voting_seconds > 0) {
      items.push(`🗳️ ${formatDuration(game.mafia_voting_seconds)} voting`)
    }
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

/** Renders {@link gameInfoItems} as a row of subtle pills with vector fr-glyph icons. */
export function GameInfoChips({
  game,
  className = '',
  align = 'center',
}: {
  game: GameMeta | null | undefined
  className?: string
  align?: 'center' | 'left'
}) {
  const rawItems = gameInfoItems(game)
  if (rawItems.length === 0) return null

  return (
    <div className={`flex flex-wrap gap-1.5 ${align === 'center' ? 'justify-center' : ''} ${className}`}>
      {rawItems.map((item, i) => {
        const { IconComponent, text } = parseChipItem(item)
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-1 text-xs font-semibold text-muted"
          >
            {IconComponent && (
              <span className="inline-flex items-center shrink-0 text-[var(--primary)]">
                <Glyph icon={IconComponent} size={14} />
              </span>
            )}
            <span>{text}</span>
          </span>
        )
      })}
    </div>
  )
}
