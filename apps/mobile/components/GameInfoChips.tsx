import { StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { CREATE_THEMES } from '@fateround/shared/create-themes'
import { CROSSWORD_THEME_OPTIONS } from '@fateround/shared/crossword'
import { WORD_SEARCH_THEME_OPTIONS } from '@fateround/shared/word-search'
import { WORD_SCRAMBLE_THEME_OPTIONS } from '@fateround/shared/word-scramble'
import { parseUnoRules } from '@fateround/shared/uno'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

function puzzleThemeLabel(options: { id: string; label: string }[], id: string | null | undefined): string | null {
  if (!id) return null
  // Built-in id -> its label; an admin theme stores its NAME in the column, so a value that
  // isn't a known built-in id is shown as-is (rather than dropped).
  return options.find((o) => o.id === id)?.label ?? id
}

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

/** These duel games clock `timer_seconds` themselves (a per-player or per-turn clock) rather
 *  than `game_duration_seconds` — labeled here instead of the generic session-length fallback
 *  below, which would otherwise misreport them as "No time limit". */
const DUEL_CLOCK_LABEL: Record<string, string> = {
  chess: 'Time per player',
  checkers: 'Time per player',
  checkers_international: 'Time per player',
  checkers_nigeria: 'Time per player',
  tic_tac_toe: 'Turn timer',
}

/** Game types with a fixed 2-player format — a "players" pill would be pure noise. */
const FIXED_TWO_PLAYER = new Set(['chess', 'checkers', 'checkers_international', 'checkers_nigeria'])

/** Game types that already show their own (correctly defaulted/clamped) player-count chip
 *  elsewhere (the room-capacity counter) — skip the generic pill here to avoid a duplicate. */
const SKIP_MAX_PLAYERS_PILL = new Set(['anonymous_messages'])

/** Game types where rounds/per-round timer are the meaningful pace settings (question- or
 *  prompt-based games). Board/card/duel games use their own turn-timer or session-duration
 *  fields (handled separately above). */
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

/**
 * Player/host-facing summary of a game's settings — so people know what they're joining or
 * hosting before they commit (player count, timing, house rules, theme, category, etc.).
 * Returns short chips like "Up to 8 players", "No time limit", "Stacking".
 */
export function gameInfoItems(game: Game | null | undefined): string[] {
  if (!game) return []
  const items: string[] = []
  const isCustomPool = game.question_source === 'custom'
  const gt = game.game_type

  // Host-set content label ("Maths", "Bible trivia") leads, so joiners see what the pack
  // is about before committing.
  if (game.content_label?.trim()) items.push(game.content_label.trim())

  if (
    typeof game.max_players === 'number' &&
    game.max_players > 0 &&
    !FIXED_TWO_PLAYER.has(gt) &&
    !SKIP_MAX_PLAYERS_PILL.has(gt)
  ) {
    items.push(`Up to ${game.max_players} players`)
  }

  const duelLabel = DUEL_CLOCK_LABEL[gt]
  if (duelLabel) {
    items.push(`${duelLabel} · ${formatDuration(game.timer_seconds ?? 0)}`)
  } else if (typeof game.game_duration_seconds === 'number') {
    // Session-length cap (currently used by Monopoly-style games). Shown even when unlimited —
    // that's exactly what a time-pressed player needs to know before joining.
    items.push(formatDuration(game.game_duration_seconds))
  }

  if (!duelLabel && ROUNDS_TIMER_TYPES.has(gt)) {
    if (typeof game.rounds_count === 'number' && game.rounds_count > 0) {
      items.push(`${game.rounds_count} rounds`)
    }
    if (typeof game.timer_seconds === 'number' && game.timer_seconds > 0) {
      items.push(`${game.timer_seconds}s per round`)
    }
  }

  if (game.anonymous && ANONYMOUS_CAPABLE_TYPES.has(gt)) items.push('Anonymous')

  if (game.theme && game.theme !== 'default') {
    const label = CREATE_THEMES.find((t) => t.id === game.theme)?.label ?? humanize(game.theme)
    items.push(`${label} theme`)
  }

  if (gt === 'crossword') {
    if (!isCustomPool) {
      const label = puzzleThemeLabel(CROSSWORD_THEME_OPTIONS, game.crossword_theme)
      if (label) items.push(label)
    }
    if (game.crossword_difficulty) items.push(capitalize(String(game.crossword_difficulty)))
  } else if (gt === 'word_search') {
    if (!isCustomPool) {
      const label = puzzleThemeLabel(WORD_SEARCH_THEME_OPTIONS, game.word_search_theme)
      if (label) items.push(label)
    }
    if (game.word_search_difficulty) items.push(capitalize(String(game.word_search_difficulty)))
  } else if (gt === 'word_scramble') {
    if (!isCustomPool) {
      const label = puzzleThemeLabel(WORD_SCRAMBLE_THEME_OPTIONS, game.word_scramble_theme)
      if (label) items.push(label)
    }
    if (game.word_scramble_difficulty) items.push(capitalize(String(game.word_scramble_difficulty)))
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
    if (game.mahjong_ruleset) items.push(humanize(String(game.mahjong_ruleset)))
  } else if (gt === 'scrabble') {
    if (game.scrabble_clock_mode === 'chess' && game.scrabble_clock_seconds) {
      items.push(`Chess clock · ${formatDuration(game.scrabble_clock_seconds)}`)
    }
  } else if (gt === 'bingo') {
    items.push(game.bingo_call_mode === 'auto' ? 'Auto-call' : 'Host calls')
    if (game.bingo_call_mode === 'auto' && game.bingo_call_interval_seconds) {
      items.push(`Every ${game.bingo_call_interval_seconds}s`)
    }
  } else if (gt === 'whot') {
    if (game.whot_pick3_enabled) items.push('Pick 3')
    if (game.whot_cards_enabled) items.push('WHOT(20)')
    if (game.whot_number_calls_enabled) items.push('Number calls')
    if (game.whot_pick2_stacking) items.push('Pick 2 stacking')
  } else if (gt === 'crazy_eights') {
    if (game.crazy8_action_cards) items.push('Action cards')
    if (game.crazy8_jokers) items.push('Jokers')
    if (game.crazy8_pick2_stacking) items.push('Pick 2 stacking')
  } else if (gt === 'uno') {
    // Mirror web GameInfoChips — chips must reflect the EFFECTIVE rules, not raw DB
    // flags. In High Stakes stacking + 0-7 are locked ON; WD4 challenge, Team-Up and
    // Jump-In are forced OFF; Multi-Play is host-picked. Collapse everything under a
    // single "💥 High Stakes" chip + optional Multi-Play chip alongside it; in Classic,
    // list the individual toggles as before.
    const uno = parseUnoRules(game)
    if (uno.mode === 'no_mercy') {
      items.push('💥 High Stakes')
      if (uno.multiPlay !== 'off') items.push('Multi-Play')
    } else {
      if (uno.teamMode) items.push('Team-Up')
      if (uno.stacking) items.push('Stacking')
      if (uno.zeroSeven) items.push('0-7 rule')
      if (uno.wd4Challenge) items.push('WD4 challenge')
      if (uno.multiPlay !== 'off') items.push('Multi-Play')
      if (uno.jumpIn) items.push('Jump-In')
    }
  } else if (gt === 'monopoly') {
    if (game.monopoly_double_go_salary) items.push('Double GO salary')
    if (game.monopoly_forced_auctions) items.push('Forced auctions')
    if (game.monopoly_no_rent_in_jail) items.push('No rent in NICKED')
    if (game.monopoly_estate_dividend) items.push('Estate dividend')
  } else if (gt === 'landmine') {
    items.push(game.landmine_mode === 'elimination' ? 'Elimination' : 'Zero points')
    if (typeof game.landmine_mine_count === 'number') items.push(`${game.landmine_mine_count} mines`)
    if (game.landmine_originality_bonus) items.push('Originality bonus')
    if (game.landmine_mine_source === 'manual') items.push('Manual setter')
  } else if (gt === 'mafia') {
    if (game.mafia_doctor_enabled) items.push('Doctor')
    if (game.mafia_detective_enabled) items.push('Detective')
    if (game.mafia_anonymous_votes) items.push('Anonymous votes')
  } else if (gt === 'codewords') {
    if (game.codewords_player_picks) items.push('Players pick roles')
    if (game.codewords_randomize_teams) items.push('Randomized operatives')
    if (game.codewords_late_join) items.push('Late join allowed')
    if (typeof game.operative_timer_seconds === 'number' && game.operative_timer_seconds > 0) {
      items.push(`${game.operative_timer_seconds}s guess timer`)
    }
  } else if (gt === 'checkers_nigeria') {
    if (game.checkers_nigeria_street_rules) items.push('Street Rules')
  }

  return items
}

/** Row of subtle pills built from {@link gameInfoItems}. Renders nothing when empty. */
export function GameInfoChips({ game }: { game: Game | null | undefined }) {
  const styles = useThemedStyles(makeStyles)
  const items = gameInfoItems(game)
  if (items.length === 0) return null
  return (
    <View style={styles.row}>
      {items.map((item, i) => (
        <Text key={i} style={styles.chip}>
          {item}
        </Text>
      ))}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center',
    },
    chip: {
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 999,
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
  })
