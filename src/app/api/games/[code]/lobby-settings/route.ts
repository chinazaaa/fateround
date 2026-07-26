import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { boardGameLobbySettingsSchema } from '@/lib/validation'
import {
  isLudoGame,
  isMonopolyGame,
  isSnakeAndLadderGame,
  isWhotGame,
  isCrazyEightsGame,
  isUnoGame,
  isYahtzeeGame,
  isMahjongGame,
  isWordHuntGame,
  isSudokuGame,
  isMatchingPairsGame,
  isMafiaGame,
  isQuiplashGame,
  isQuickDrawGame,
  isAyoGame,
  isCrosswordGame,
  isWordSearchGame,
  isWordScrambleGame,
  isPingPongGame,
  isCheckersGame,
  isDraughts10Game,
  isCheckersNigeriaGame,
  parseGameType,
} from '@/lib/game-types'
import { clampAyoTimer, parseAyoVariant } from '@/lib/ayo'
import { clampCheckersTimer } from '@/lib/checkers'
import { clampDraughts10Timer } from '@/lib/draughts10'
import { clampBoardGameTurnTimer, type BoardGameLobbyType } from '@/lib/board-game-lobby-settings'
import { clampMonopolyGameDuration } from '@/lib/monopoly'
import { clampWhotGameDuration } from '@/lib/whot'
import { clampCrazyEightsGameDuration } from '@/lib/crazy-eights'
import { clampUnoGameDuration, parseMultiPlayMode, UNO_TEAM_PLAYERS } from '@/lib/uno'
import { clampWordHuntTimer } from '@/lib/word-hunt'
import { parseMahjongRuleOptions, parseMahjongRuleset } from '@/lib/mahjong-rulesets'
import { clampSudokuGameDuration } from '@/lib/sudoku'
import { clampCrosswordGameDuration, parseCrosswordDifficulty } from '@/lib/crossword'
import { clampWordSearchGameDuration, parseWordSearchDifficulty } from '@/lib/word-search'
import { clampWordScrambleGameDuration, parseWordScrambleDifficulty } from '@/lib/word-scramble'
import { findCrosswordTheme } from '@/lib/crossword-puzzles'
import { findWordSearchTheme } from '@/lib/word-search-puzzles'
import { findWordScrambleTheme } from '@/lib/word-scramble-puzzles'
import {
  parseStoredCrosswordEntries,
  parseStoredWordSearchEntries,
  parseStoredWordScrambleEntries,
} from '@/lib/custom-questions'
import { MATCHING_PAIRS_GAME_DURATION_OPTIONS } from '@/lib/memory-match'
import { clampQuiplashRounds, clampQuiplashSubmitTimer, clampQuiplashVoteTimer } from '@/lib/quiplash'
import {
  clampQuickDrawDrawTimer,
  clampQuickDrawRounds,
  clampQuickDrawTitleTimer,
  clampQuickDrawVariant,
  clampQuickDrawVoteTimer,
} from '@/lib/quick-draw'
import { clampQuickDrawNumTeams, clampQuickDrawPlayMode } from '@/lib/quick-draw-guess'
import {
  clampLobbyMaxPlayers,
  fetchGamePlayerLimits,
  isLobbyLimitGameType,
  type LobbyLimitGameType,
} from '@/lib/game-limits'
import { clampPingPongPoints } from '@/lib/ping-pong'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = getSupabaseAnon()

function boardGameLobbyType(gameType: string): BoardGameLobbyType | null {
  const parsed = parseGameType(gameType)
  if (isMonopolyGame(parsed)) return 'monopoly'
  if (isYahtzeeGame(parsed)) return 'yahtzee'
  if (isWhotGame(parsed)) return 'whot'
  if (isCrazyEightsGame(parsed)) return 'crazy_eights'
  if (isUnoGame(parsed)) return 'uno'
  if (isLudoGame(parsed)) return 'ludo'
  if (isMahjongGame(parsed)) return 'mahjong'
  if (isSnakeAndLadderGame(parsed)) return 'snake_and_ladder'
  return null
}

function timedLobbyLimitType(gameType: string): LobbyLimitGameType | null {
  const parsed = parseGameType(gameType)
  if (isWordHuntGame(parsed)) return 'word_hunt'
  if (isMafiaGame(parsed)) return 'mafia'
  return null
}

function ayoLobbyType(gameType: string): boolean {
  return isAyoGame(parseGameType(gameType))
}

/** American Checkers + International/Nigerian Draughts — same timer options, no house rules
 *  except Nigeria's Street Rules toggle (handled separately below). */
function checkersLobbyType(gameType: string): boolean {
  const parsed = parseGameType(gameType)
  return isCheckersGame(parsed) || isDraughts10Game(parsed)
}

/** Games with only a max-players lobby setting — no timer or house rules. */
function limitOnlyLobbyType(gameType: string): LobbyLimitGameType | null {
  const parsed = parseGameType(gameType)
  if (isSudokuGame(parsed)) return 'sudoku'
  if (isMatchingPairsGame(parsed)) return 'matching_pairs'
  if (isCrosswordGame(parsed)) return 'crossword'
  if (isWordSearchGame(parsed)) return 'word_search'
  if (isWordScrambleGame(parsed)) return 'word_scramble'
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = boardGameLobbySettingsSchema.safeParse({ ...raw, gameId: raw.gameId ?? code })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    hostToken,
    is_public,
    max_players,
    timer_seconds,
    game_duration_seconds,
    rounds_count,
    monopoly_double_go_salary,
    monopoly_forced_auctions,
    monopoly_auction_timer_seconds,
    monopoly_no_rent_in_jail,
    monopoly_estate_dividend,
    whot_pick3_enabled,
    whot_cards_enabled,
    whot_number_calls_enabled,
    whot_pick2_stacking,
    crazy8_action_cards,
    crazy8_jokers,
    crazy8_pick2_stacking,
    uno_wd4_challenge,
    uno_uno_penalty,
    uno_zero_seven,
    uno_stacking,
    uno_multi_play_mode,
    uno_team_mode,
    uno_jump_in,
    ludo_variant,
    mahjong_ruleset,
    mahjong_rule_options,
    mafia_doctor_enabled,
    mafia_detective_enabled,
    mafia_aura_seer_enabled,
    mafia_medium_enabled,
    mafia_priest_enabled,
    mafia_witch_enabled,
    mafia_little_girl_enabled,
    mafia_trapper_enabled,
    mafia_seer_enabled,
    mafia_mafia_seer_enabled,
    mafia_red_lady_enabled,
    mafia_bodyguard_enabled,
    mafia_mayor_enabled,
    mafia_vigilante_enabled,
    mafia_tracker_enabled,
    mafia_alpha_wolf_enabled,
    mafia_wolf_cub_enabled,
    mafia_framer_enabled,
    mafia_jester_enabled,
    mafia_serial_killer_enabled,
    mafia_arsonist_enabled,
    mafia_cupid_enabled,
    mafia_cursed_villager_enabled,
    mafia_anonymous_votes,
    mafia_advanced_mode,
    mafia_day_seconds,
    mafia_voting_seconds,
    operative_timer_seconds,
    quick_draw_variant,
    quick_draw_play_mode,
    quick_draw_num_teams,
    ayo_variant,
    checkers_nigeria_street_rules,
    crossword_theme,
    crossword_difficulty,
    word_search_theme,
    word_search_difficulty,
    word_scramble_theme,
    word_scramble_difficulty,
    puzzle_theme_id,
    puzzle_custom_questions,
    ping_pong_points_to_win,
    content_label,
  } = parsed.data
  const gameCode = parsed.data.gameId.toUpperCase()

  if (
    content_label === undefined &&
    is_public === undefined &&
    max_players === undefined &&
    timer_seconds === undefined &&
    game_duration_seconds === undefined &&
    rounds_count === undefined &&
    monopoly_double_go_salary === undefined &&
    monopoly_forced_auctions === undefined &&
    monopoly_auction_timer_seconds === undefined &&
    monopoly_no_rent_in_jail === undefined &&
    monopoly_estate_dividend === undefined &&
    whot_pick3_enabled === undefined &&
    whot_cards_enabled === undefined &&
    whot_number_calls_enabled === undefined &&
    whot_pick2_stacking === undefined &&
    crazy8_action_cards === undefined &&
    crazy8_jokers === undefined &&
    crazy8_pick2_stacking === undefined &&
    uno_wd4_challenge === undefined &&
    uno_uno_penalty === undefined &&
    uno_zero_seven === undefined &&
    uno_stacking === undefined &&
    uno_multi_play_mode === undefined &&
    uno_team_mode === undefined &&
    uno_jump_in === undefined &&
    ludo_variant === undefined &&
    mahjong_ruleset === undefined &&
    mahjong_rule_options === undefined &&
    mafia_doctor_enabled === undefined &&
    mafia_detective_enabled === undefined &&
    mafia_aura_seer_enabled === undefined &&
    mafia_medium_enabled === undefined &&
    mafia_priest_enabled === undefined &&
    mafia_witch_enabled === undefined &&
    mafia_little_girl_enabled === undefined &&
    mafia_trapper_enabled === undefined &&
    mafia_seer_enabled === undefined &&
    mafia_mafia_seer_enabled === undefined &&
    mafia_red_lady_enabled === undefined &&
    mafia_bodyguard_enabled === undefined &&
    mafia_mayor_enabled === undefined &&
    mafia_vigilante_enabled === undefined &&
    mafia_tracker_enabled === undefined &&
    mafia_alpha_wolf_enabled === undefined &&
    mafia_wolf_cub_enabled === undefined &&
    mafia_framer_enabled === undefined &&
    mafia_jester_enabled === undefined &&
    mafia_serial_killer_enabled === undefined &&
    mafia_arsonist_enabled === undefined &&
    mafia_cupid_enabled === undefined &&
    mafia_cursed_villager_enabled === undefined &&
    mafia_anonymous_votes === undefined &&
    mafia_advanced_mode === undefined &&
    mafia_day_seconds === undefined &&
    mafia_voting_seconds === undefined &&
    operative_timer_seconds === undefined &&
    quick_draw_variant === undefined &&
    quick_draw_play_mode === undefined &&
    quick_draw_num_teams === undefined &&
    ayo_variant === undefined &&
    checkers_nigeria_street_rules === undefined &&
    crossword_theme === undefined &&
    crossword_difficulty === undefined &&
    word_search_theme === undefined &&
    word_search_difficulty === undefined &&
    word_scramble_theme === undefined &&
    word_scramble_difficulty === undefined &&
    puzzle_theme_id === undefined &&
    puzzle_custom_questions === undefined &&
    ping_pong_points_to_win === undefined
  ) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game } = await getSupabaseAdmin().from('games').select('*').eq('id', gameCode).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Settings can only be changed in the lobby before the game starts' },
      { status: 400 }
    )
  }

  const boardLobbyType = boardGameLobbyType(game.game_type)
  const timedLobbyType = timedLobbyLimitType(game.game_type)
  const limitOnlyType = limitOnlyLobbyType(game.game_type)
  const quiplashLobby = isQuiplashGame(parseGameType(game.game_type))
  const quickDrawLobby = isQuickDrawGame(parseGameType(game.game_type))
  const pingPongLobby = isPingPongGame(parseGameType(game.game_type))
  const ayoLobby = ayoLobbyType(game.game_type)
  const checkersLobby = checkersLobbyType(game.game_type)
  // max_players + is_public are generic to every lobby-limit game; the more
  // specific classifications below only gate the per-game fields (timers, rules,
  // etc.). So accept any lobby-limit game here — otherwise games with their own
  // settings routes (codewords, describe_it, trivia…) were rejected outright when
  // the mobile sheet sent max_players through this route.
  if (
    !boardLobbyType &&
    !timedLobbyType &&
    !limitOnlyType &&
    !quiplashLobby &&
    !quickDrawLobby &&
    !pingPongLobby &&
    !ayoLobby &&
    !isLobbyLimitGameType(game.game_type)
  ) {
    return NextResponse.json({ error: 'This game type does not support lobby settings here' }, { status: 400 })
  }

  const lobbyLimits = await fetchGamePlayerLimits(supabase)
  const limitKey = (
    quiplashLobby
      ? 'quiplash'
      : quickDrawLobby
        ? 'quick_draw'
        : pingPongLobby
          ? 'ping_pong'
          : (timedLobbyType ?? limitOnlyType ?? boardLobbyType ?? parseGameType(game.game_type))
  ) as LobbyLimitGameType
  const gameUpdate: Record<string, unknown> = {}

  // Public/private visibility — controls whether the game shows up in Browse. Not
  // tied to a specific board type; any lobby-settings game can toggle it.
  if (is_public !== undefined) {
    gameUpdate.is_public = is_public
  }

  // Content label — trimmed + capped; empty string clears it.
  if (content_label !== undefined) {
    const trimmed = content_label.trim()
    gameUpdate.content_label = trimmed ? trimmed.slice(0, 40) : null
  }

  if (max_players !== undefined) {
    const nextMax = clampLobbyMaxPlayers(limitKey, max_players, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameCode)
    if ((playerCount ?? 0) > nextMax) {
      return NextResponse.json(
        { error: `Already have ${playerCount} players — remove someone or pick at least ${playerCount}` },
        { status: 400 }
      )
    }
    gameUpdate.max_players = nextMax
  }

  if (timer_seconds !== undefined) {
    if (quiplashLobby) {
      gameUpdate.timer_seconds = clampQuiplashSubmitTimer(timer_seconds)
    } else if (quickDrawLobby) {
      gameUpdate.timer_seconds = clampQuickDrawDrawTimer(timer_seconds)
    } else if (timedLobbyType === 'word_hunt') {
      gameUpdate.timer_seconds = clampWordHuntTimer(timer_seconds)
    } else if (timedLobbyType === 'mafia') {
      gameUpdate.timer_seconds = [30, 45, 60, 90, 120, 180].includes(timer_seconds) ? timer_seconds : 60
    } else if (boardLobbyType) {
      gameUpdate.timer_seconds = clampBoardGameTurnTimer(timer_seconds, boardLobbyType)
    } else if (ayoLobby) {
      gameUpdate.timer_seconds = clampAyoTimer(timer_seconds)
    } else if (checkersLobby) {
      gameUpdate.timer_seconds = isCheckersGame(parseGameType(game.game_type))
        ? clampCheckersTimer(timer_seconds)
        : clampDraughts10Timer(timer_seconds)
    } else if (limitOnlyType === 'matching_pairs') {
      // Matching Pairs game time limit (0 = no limit)
      const maxOption = MATCHING_PAIRS_GAME_DURATION_OPTIONS[MATCHING_PAIRS_GAME_DURATION_OPTIONS.length - 1]
      gameUpdate.timer_seconds = Math.max(0, Math.min(maxOption, Math.round(timer_seconds)))
    } else {
      // Limit-only games (sudoku) have no timer — an update here would otherwise
      // fall through silently and hit the DB with an empty patch.
      return NextResponse.json({ error: 'This game type does not support timer settings' }, { status: 400 })
    }
  }

  if (limitOnlyType === 'matching_pairs') {
    if (rounds_count !== undefined) {
      gameUpdate.rounds_count = Math.max(1, Math.min(100, Math.round(rounds_count)))
    }
  } else if (quiplashLobby) {
    if (rounds_count !== undefined) {
      gameUpdate.rounds_count = clampQuiplashRounds(rounds_count)
    }
  } else if (quickDrawLobby) {
    if (rounds_count !== undefined) {
      gameUpdate.rounds_count = clampQuickDrawRounds(rounds_count)
    }
  } else if (rounds_count !== undefined) {
    return NextResponse.json(
      { error: 'Rounds count only applies to Matching Pairs, Quiplash, and Quick Draw games' },
      { status: 400 }
    )
  }

  if (operative_timer_seconds !== undefined) {
    if (quiplashLobby) {
      gameUpdate.operative_timer_seconds = clampQuiplashVoteTimer(operative_timer_seconds)
    } else if (quickDrawLobby) {
      gameUpdate.operative_timer_seconds = clampQuickDrawTitleTimer(operative_timer_seconds)
    } else {
      return NextResponse.json(
        { error: 'Secondary timer only applies to Quiplash and Quick Draw games' },
        { status: 400 }
      )
    }
  }

  if (game_duration_seconds !== undefined) {
    if (quickDrawLobby) {
      gameUpdate.game_duration_seconds = clampQuickDrawVoteTimer(game_duration_seconds)
    } else if (limitOnlyType === 'sudoku') {
      gameUpdate.game_duration_seconds = clampSudokuGameDuration(game_duration_seconds)
    } else if (limitOnlyType === 'crossword') {
      gameUpdate.game_duration_seconds = clampCrosswordGameDuration(game_duration_seconds)
    } else if (limitOnlyType === 'word_search') {
      gameUpdate.game_duration_seconds = clampWordSearchGameDuration(game_duration_seconds)
    } else if (limitOnlyType === 'word_scramble') {
      gameUpdate.game_duration_seconds = clampWordScrambleGameDuration(game_duration_seconds)
    } else if (limitOnlyType === 'matching_pairs') {
      // Matching Pairs stores grid size as game_duration_seconds (0=8 pairs, 16=16 pairs)
      gameUpdate.game_duration_seconds = game_duration_seconds === 16 ? 16 : 0
    } else if (!boardLobbyType) {
      return NextResponse.json({ error: 'This game type does not support game length settings' }, { status: 400 })
    } else if (boardLobbyType === 'monopoly') {
      gameUpdate.game_duration_seconds = clampMonopolyGameDuration(game_duration_seconds)
    } else if (boardLobbyType === 'whot') {
      gameUpdate.game_duration_seconds = clampWhotGameDuration(game_duration_seconds)
    } else if (boardLobbyType === 'crazy_eights') {
      gameUpdate.game_duration_seconds = clampCrazyEightsGameDuration(game_duration_seconds)
    } else if (boardLobbyType === 'uno') {
      gameUpdate.game_duration_seconds = clampUnoGameDuration(game_duration_seconds)
    } else if (parseGameType(game.game_type) === 'ping_pong') {
      gameUpdate.game_duration_seconds = Math.max(0, game_duration_seconds)
    } else {
      return NextResponse.json({ error: 'This game type does not support game length settings' }, { status: 400 })
    }
  }

  // Crossword / Word Search / Word Scramble puzzle theme + difficulty. Stored on the game and
  // consumed at start (they pick the word bank + grid), so they're safe to change while waiting.
  // Selecting a BUILT-IN theme also clears any custom/admin word pool so the game reverts to the
  // built-in code path (otherwise a stale pool from an earlier admin-theme pick would still win).
  if (crossword_theme !== undefined || crossword_difficulty !== undefined) {
    if (limitOnlyType !== 'crossword') {
      return NextResponse.json({ error: 'This game type has no crossword theme settings' }, { status: 400 })
    }
    if (crossword_theme !== undefined) {
      gameUpdate.crossword_theme = findCrosswordTheme(crossword_theme).id
      gameUpdate.custom_questions = null
      gameUpdate.question_source = 'platform'
    }
    if (crossword_difficulty !== undefined)
      gameUpdate.crossword_difficulty = parseCrosswordDifficulty(crossword_difficulty)
  }
  if (word_search_theme !== undefined || word_search_difficulty !== undefined) {
    if (limitOnlyType !== 'word_search') {
      return NextResponse.json({ error: 'This game type has no word search theme settings' }, { status: 400 })
    }
    if (word_search_theme !== undefined) {
      gameUpdate.word_search_theme = findWordSearchTheme(word_search_theme).id
      gameUpdate.custom_questions = null
      gameUpdate.question_source = 'platform'
    }
    if (word_search_difficulty !== undefined) {
      gameUpdate.word_search_difficulty = parseWordSearchDifficulty(word_search_difficulty)
    }
  }
  if (word_scramble_theme !== undefined || word_scramble_difficulty !== undefined) {
    if (limitOnlyType !== 'word_scramble') {
      return NextResponse.json({ error: 'This game type has no word scramble theme settings' }, { status: 400 })
    }
    if (word_scramble_theme !== undefined) {
      gameUpdate.word_scramble_theme = findWordScrambleTheme(word_scramble_theme).id
      gameUpdate.custom_questions = null
      gameUpdate.question_source = 'platform'
    }
    if (word_scramble_difficulty !== undefined) {
      gameUpdate.word_scramble_difficulty = parseWordScrambleDifficulty(word_scramble_difficulty)
    }
  }

  // Switch to an admin theme from the lobby: fold its saved pool + locked difficulty into the
  // game (mirrors POST /api/games). Its words are secret, so resolved server-side. Stores the
  // theme NAME in the *_theme column for the join-screen chips.
  if (puzzle_theme_id !== undefined) {
    const puzzleKind =
      limitOnlyType === 'crossword'
        ? 'crossword'
        : limitOnlyType === 'word_search'
          ? 'word_search'
          : limitOnlyType === 'word_scramble'
            ? 'word_scramble'
            : null
    if (!puzzleKind) {
      return NextResponse.json({ error: 'This game type has no puzzle themes' }, { status: 400 })
    }
    const { data: pt } = await getSupabaseAdmin()
      .from('puzzle_themes')
      .select('game_type, name, difficulty, entries')
      .eq('id', puzzle_theme_id)
      .maybeSingle()
    if (!pt || pt.game_type !== puzzleKind || !Array.isArray(pt.entries) || pt.entries.length < 4) {
      return NextResponse.json({ error: 'Theme not found' }, { status: 400 })
    }
    gameUpdate.custom_questions = pt.entries as unknown[]
    gameUpdate.question_source = 'platform'
    gameUpdate[`${puzzleKind}_theme`] = pt.name as string
    const d = pt.difficulty as string | null
    if (d === 'easy' || d === 'medium' || d === 'hard') gameUpdate[`${puzzleKind}_difficulty`] = d
  }

  // Host-supplied puzzle pool from the lobby: a Library pack pick or a "Your own" CSV upload.
  // Re-validate + normalise per game type (never trust the client's array), require 4+ entries,
  // then store it as a custom pool. question_source='custom' makes start ignore the built-in theme.
  if (puzzle_custom_questions !== undefined) {
    const normalised =
      limitOnlyType === 'crossword'
        ? parseStoredCrosswordEntries(puzzle_custom_questions)
        : limitOnlyType === 'word_search'
          ? parseStoredWordSearchEntries(puzzle_custom_questions)
          : limitOnlyType === 'word_scramble'
            ? parseStoredWordScrambleEntries(puzzle_custom_questions)
            : null
    if (!normalised) {
      return NextResponse.json({ error: 'This game type has no custom word pool' }, { status: 400 })
    }
    if (normalised.length < 4) {
      return NextResponse.json({ error: 'Add at least 4 words' }, { status: 400 })
    }
    gameUpdate.custom_questions = normalised
    gameUpdate.question_source = 'custom'
  }

  if (boardLobbyType === 'monopoly') {
    if (monopoly_double_go_salary !== undefined) gameUpdate.monopoly_double_go_salary = monopoly_double_go_salary
    if (monopoly_forced_auctions !== undefined) gameUpdate.monopoly_forced_auctions = monopoly_forced_auctions
    if (monopoly_auction_timer_seconds !== undefined)
      gameUpdate.monopoly_auction_timer_seconds = monopoly_auction_timer_seconds
    if (monopoly_no_rent_in_jail !== undefined) gameUpdate.monopoly_no_rent_in_jail = monopoly_no_rent_in_jail
    if (monopoly_estate_dividend !== undefined) gameUpdate.monopoly_estate_dividend = monopoly_estate_dividend
  } else if (
    monopoly_double_go_salary !== undefined ||
    monopoly_forced_auctions !== undefined ||
    monopoly_auction_timer_seconds !== undefined ||
    monopoly_no_rent_in_jail !== undefined ||
    monopoly_estate_dividend !== undefined
  ) {
    return NextResponse.json({ error: 'These rules only apply to Monopoly games' }, { status: 400 })
  }

  if (boardLobbyType === 'whot') {
    if (whot_pick3_enabled !== undefined) gameUpdate.whot_pick3_enabled = whot_pick3_enabled
    if (whot_cards_enabled !== undefined) gameUpdate.whot_cards_enabled = whot_cards_enabled
    if (whot_number_calls_enabled !== undefined) {
      gameUpdate.whot_number_calls_enabled = whot_number_calls_enabled
    }
    if (whot_pick2_stacking !== undefined) gameUpdate.whot_pick2_stacking = whot_pick2_stacking
  } else if (
    whot_pick3_enabled !== undefined ||
    whot_cards_enabled !== undefined ||
    whot_number_calls_enabled !== undefined ||
    whot_pick2_stacking !== undefined
  ) {
    return NextResponse.json({ error: 'House rules only apply to Whot games' }, { status: 400 })
  }

  if (boardLobbyType === 'crazy_eights') {
    if (crazy8_action_cards !== undefined) gameUpdate.crazy8_action_cards = crazy8_action_cards
    if (crazy8_jokers !== undefined) gameUpdate.crazy8_jokers = crazy8_jokers
    if (crazy8_pick2_stacking !== undefined) gameUpdate.crazy8_pick2_stacking = crazy8_pick2_stacking
  } else if (crazy8_action_cards !== undefined || crazy8_jokers !== undefined || crazy8_pick2_stacking !== undefined) {
    return NextResponse.json({ error: 'House rules only apply to Crazy Eights games' }, { status: 400 })
  }

  if (boardLobbyType === 'uno') {
    if (uno_wd4_challenge !== undefined) gameUpdate.uno_wd4_challenge = uno_wd4_challenge
    if (uno_uno_penalty !== undefined) gameUpdate.uno_uno_penalty = Number(uno_uno_penalty) === 4 ? 4 : 2
    if (uno_zero_seven !== undefined) gameUpdate.uno_zero_seven = uno_zero_seven
    if (uno_stacking !== undefined) gameUpdate.uno_stacking = uno_stacking
    if (uno_multi_play_mode !== undefined) gameUpdate.uno_multi_play_mode = parseMultiPlayMode(uno_multi_play_mode)
    if (uno_team_mode !== undefined) {
      gameUpdate.uno_team_mode = uno_team_mode
      // Team-Up is strictly 2v2 — enabling it caps the room at 4 (mirrors create).
      // Turning it off leaves max_players for the host to adjust separately.
      if (uno_team_mode === true) gameUpdate.max_players = UNO_TEAM_PLAYERS
    }
    if (uno_jump_in !== undefined) gameUpdate.uno_jump_in = uno_jump_in
  } else if (
    uno_wd4_challenge !== undefined ||
    uno_uno_penalty !== undefined ||
    uno_zero_seven !== undefined ||
    uno_stacking !== undefined ||
    uno_multi_play_mode !== undefined ||
    uno_team_mode !== undefined ||
    uno_jump_in !== undefined
  ) {
    return NextResponse.json({ error: 'House rules only apply to UNO games' }, { status: 400 })
  }

  if (boardLobbyType === 'ludo') {
    if (ludo_variant !== undefined) gameUpdate.ludo_variant = ludo_variant
  } else if (ludo_variant !== undefined) {
    return NextResponse.json({ error: 'The Ludo variant only applies to Ludo games' }, { status: 400 })
  }

  if (ayoLobby) {
    if (ayo_variant !== undefined) gameUpdate.ayo_variant = parseAyoVariant(ayo_variant)
  } else if (ayo_variant !== undefined) {
    return NextResponse.json({ error: 'The Ayo variant only applies to Ayo games' }, { status: 400 })
  }

  if (isCheckersNigeriaGame(parseGameType(game.game_type))) {
    if (checkers_nigeria_street_rules !== undefined) {
      gameUpdate.checkers_nigeria_street_rules = checkers_nigeria_street_rules
    }
  } else if (checkers_nigeria_street_rules !== undefined) {
    return NextResponse.json({ error: 'Street Rules only applies to Nigerian Draughts games' }, { status: 400 })
  }

  if (boardLobbyType === 'mahjong') {
    if (mahjong_ruleset !== undefined) gameUpdate.mahjong_ruleset = parseMahjongRuleset(mahjong_ruleset)
    if (mahjong_rule_options !== undefined) {
      gameUpdate.mahjong_rule_options = parseMahjongRuleOptions({
        ...(game.mahjong_rule_options ?? {}),
        ...mahjong_rule_options,
      })
    }
  } else if (mahjong_ruleset !== undefined || mahjong_rule_options !== undefined) {
    return NextResponse.json({ error: 'Mahjong rules only apply to Mahjong games' }, { status: 400 })
  }

  if (timedLobbyType === 'mafia') {
    if (mafia_doctor_enabled !== undefined) gameUpdate.mafia_doctor_enabled = mafia_doctor_enabled
    if (mafia_detective_enabled !== undefined) gameUpdate.mafia_detective_enabled = mafia_detective_enabled
    if (mafia_aura_seer_enabled !== undefined) gameUpdate.mafia_aura_seer_enabled = mafia_aura_seer_enabled
    if (mafia_medium_enabled !== undefined) gameUpdate.mafia_medium_enabled = mafia_medium_enabled
    if (mafia_priest_enabled !== undefined) gameUpdate.mafia_priest_enabled = mafia_priest_enabled
    if (mafia_witch_enabled !== undefined) gameUpdate.mafia_witch_enabled = mafia_witch_enabled
    if (mafia_little_girl_enabled !== undefined) gameUpdate.mafia_little_girl_enabled = mafia_little_girl_enabled
    if (mafia_trapper_enabled !== undefined) gameUpdate.mafia_trapper_enabled = mafia_trapper_enabled
    if (mafia_seer_enabled !== undefined) gameUpdate.mafia_seer_enabled = mafia_seer_enabled
    if (mafia_mafia_seer_enabled !== undefined) gameUpdate.mafia_mafia_seer_enabled = mafia_mafia_seer_enabled
    if (mafia_red_lady_enabled !== undefined) gameUpdate.mafia_red_lady_enabled = mafia_red_lady_enabled
    if (mafia_bodyguard_enabled !== undefined) gameUpdate.mafia_bodyguard_enabled = mafia_bodyguard_enabled
    if (mafia_mayor_enabled !== undefined) gameUpdate.mafia_mayor_enabled = mafia_mayor_enabled
    if (mafia_vigilante_enabled !== undefined) gameUpdate.mafia_vigilante_enabled = mafia_vigilante_enabled
    if (mafia_tracker_enabled !== undefined) gameUpdate.mafia_tracker_enabled = mafia_tracker_enabled
    if (mafia_alpha_wolf_enabled !== undefined) gameUpdate.mafia_alpha_wolf_enabled = mafia_alpha_wolf_enabled
    if (mafia_wolf_cub_enabled !== undefined) gameUpdate.mafia_wolf_cub_enabled = mafia_wolf_cub_enabled
    if (mafia_framer_enabled !== undefined) gameUpdate.mafia_framer_enabled = mafia_framer_enabled
    if (mafia_jester_enabled !== undefined) gameUpdate.mafia_jester_enabled = mafia_jester_enabled
    if (mafia_serial_killer_enabled !== undefined) gameUpdate.mafia_serial_killer_enabled = mafia_serial_killer_enabled
    if (mafia_arsonist_enabled !== undefined) gameUpdate.mafia_arsonist_enabled = mafia_arsonist_enabled
    if (mafia_cupid_enabled !== undefined) gameUpdate.mafia_cupid_enabled = mafia_cupid_enabled
    if (mafia_cursed_villager_enabled !== undefined) {
      gameUpdate.mafia_cursed_villager_enabled = mafia_cursed_villager_enabled
    }
    if (mafia_anonymous_votes !== undefined) gameUpdate.mafia_anonymous_votes = mafia_anonymous_votes
    if (mafia_advanced_mode !== undefined) gameUpdate.mafia_advanced_mode = mafia_advanced_mode
    if (mafia_day_seconds !== undefined) gameUpdate.mafia_day_seconds = mafia_day_seconds
    if (mafia_voting_seconds !== undefined) gameUpdate.mafia_voting_seconds = mafia_voting_seconds
  } else if (
    mafia_doctor_enabled !== undefined ||
    mafia_detective_enabled !== undefined ||
    mafia_aura_seer_enabled !== undefined ||
    mafia_medium_enabled !== undefined ||
    mafia_priest_enabled !== undefined ||
    mafia_witch_enabled !== undefined ||
    mafia_little_girl_enabled !== undefined ||
    mafia_trapper_enabled !== undefined ||
    mafia_seer_enabled !== undefined ||
    mafia_mafia_seer_enabled !== undefined ||
    mafia_red_lady_enabled !== undefined ||
    mafia_bodyguard_enabled !== undefined ||
    mafia_mayor_enabled !== undefined ||
    mafia_vigilante_enabled !== undefined ||
    mafia_tracker_enabled !== undefined ||
    mafia_alpha_wolf_enabled !== undefined ||
    mafia_wolf_cub_enabled !== undefined ||
    mafia_framer_enabled !== undefined ||
    mafia_jester_enabled !== undefined ||
    mafia_serial_killer_enabled !== undefined ||
    mafia_arsonist_enabled !== undefined ||
    mafia_cupid_enabled !== undefined ||
    mafia_cursed_villager_enabled !== undefined ||
    mafia_anonymous_votes !== undefined ||
    mafia_advanced_mode !== undefined ||
    mafia_day_seconds !== undefined ||
    mafia_voting_seconds !== undefined
  ) {
    return NextResponse.json({ error: 'Special rules only apply to Mafia games' }, { status: 400 })
  }

  if (quickDrawLobby) {
    if (quick_draw_variant !== undefined) {
      gameUpdate.quick_draw_variant = clampQuickDrawVariant(quick_draw_variant)
    }
    if (quick_draw_play_mode !== undefined) {
      gameUpdate.quick_draw_play_mode = clampQuickDrawPlayMode(quick_draw_play_mode)
    }
    if (quick_draw_num_teams !== undefined) {
      gameUpdate.quick_draw_num_teams = clampQuickDrawNumTeams(quick_draw_num_teams)
    }
  } else if (
    quick_draw_variant !== undefined ||
    quick_draw_play_mode !== undefined ||
    quick_draw_num_teams !== undefined
  ) {
    return NextResponse.json({ error: 'Quick Draw settings only apply to Quick Draw games' }, { status: 400 })
  }

  if (pingPongLobby) {
    if (ping_pong_points_to_win !== undefined) {
      gameUpdate.ping_pong_points_to_win = clampPingPongPoints(ping_pong_points_to_win)
    }
  } else if (ping_pong_points_to_win !== undefined) {
    return NextResponse.json({ error: 'Points to win only applies to Ping Pong games' }, { status: 400 })
  }

  const { data: updated, error } = await getSupabaseAdmin()
    .from('games')
    .update(gameUpdate)
    .eq('id', gameCode)
    .select()
    .single()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('games/code/lobby-settings', error) }, { status: 500 })

  if (quickDrawLobby && quick_draw_num_teams !== undefined) {
    const { error: cleanupError } = await getSupabaseAdmin()
      .from('quick_draw_guess_players')
      .delete()
      .eq('game_id', gameCode)
      .gt('team', clampQuickDrawNumTeams(quick_draw_num_teams))
    if (cleanupError) {
      return NextResponse.json(
        { error: internalErrorMessage('games/code/lobby-settings', cleanupError) },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true, game: updated })
}
