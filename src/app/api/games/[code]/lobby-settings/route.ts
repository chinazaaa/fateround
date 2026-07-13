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
  parseGameType,
} from '@/lib/game-types'
import { clampAyoTimer, parseAyoVariant } from '@/lib/ayo'
import { clampBoardGameTurnTimer, type BoardGameLobbyType } from '@/lib/board-game-lobby-settings'
import { clampMonopolyGameDuration } from '@/lib/monopoly'
import { clampWhotGameDuration } from '@/lib/whot'
import { clampCrazyEightsGameDuration } from '@/lib/crazy-eights'
import { clampWordHuntTimer } from '@/lib/word-hunt'
import { parseMahjongRuleOptions, parseMahjongRuleset } from '@/lib/mahjong-rulesets'
import { clampSudokuGameDuration } from '@/lib/sudoku'
import { clampCrosswordGameDuration, parseCrosswordDifficulty } from '@/lib/crossword'
import { clampWordSearchGameDuration, parseWordSearchDifficulty } from '@/lib/word-search'
import { clampWordScrambleGameDuration, parseWordScrambleDifficulty } from '@/lib/word-scramble'
import { findCrosswordTheme } from '@/lib/crossword-puzzles'
import { findWordSearchTheme } from '@/lib/word-search-puzzles'
import { findWordScrambleTheme } from '@/lib/word-scramble-puzzles'
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
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = getSupabaseAnon()

function boardGameLobbyType(gameType: string): BoardGameLobbyType | null {
  const parsed = parseGameType(gameType)
  if (isMonopolyGame(parsed)) return 'monopoly'
  if (isYahtzeeGame(parsed)) return 'yahtzee'
  if (isWhotGame(parsed)) return 'whot'
  if (isCrazyEightsGame(parsed)) return 'crazy_eights'
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
    monopoly_no_rent_in_jail,
    whot_pick3_enabled,
    whot_cards_enabled,
    whot_number_calls_enabled,
    whot_pick2_stacking,
    crazy8_action_cards,
    crazy8_jokers,
    crazy8_pick2_stacking,
    ludo_variant,
    mahjong_ruleset,
    mahjong_rule_options,
    mafia_doctor_enabled,
    mafia_detective_enabled,
    mafia_anonymous_votes,
    operative_timer_seconds,
    quick_draw_variant,
    quick_draw_play_mode,
    quick_draw_num_teams,
    ayo_variant,
    crossword_theme,
    crossword_difficulty,
    word_search_theme,
    word_search_difficulty,
    word_scramble_theme,
    word_scramble_difficulty,
  } = parsed.data
  const gameCode = parsed.data.gameId.toUpperCase()

  if (
    is_public === undefined &&
    max_players === undefined &&
    timer_seconds === undefined &&
    game_duration_seconds === undefined &&
    rounds_count === undefined &&
    monopoly_double_go_salary === undefined &&
    monopoly_forced_auctions === undefined &&
    monopoly_no_rent_in_jail === undefined &&
    whot_pick3_enabled === undefined &&
    whot_cards_enabled === undefined &&
    whot_number_calls_enabled === undefined &&
    whot_pick2_stacking === undefined &&
    crazy8_action_cards === undefined &&
    crazy8_jokers === undefined &&
    crazy8_pick2_stacking === undefined &&
    ludo_variant === undefined &&
    mahjong_ruleset === undefined &&
    mahjong_rule_options === undefined &&
    mafia_doctor_enabled === undefined &&
    mafia_detective_enabled === undefined &&
    mafia_anonymous_votes === undefined &&
    operative_timer_seconds === undefined &&
    quick_draw_variant === undefined &&
    quick_draw_play_mode === undefined &&
    quick_draw_num_teams === undefined &&
    ayo_variant === undefined &&
    crossword_theme === undefined &&
    crossword_difficulty === undefined &&
    word_search_theme === undefined &&
    word_search_difficulty === undefined &&
    word_scramble_theme === undefined &&
    word_scramble_difficulty === undefined
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
  const ayoLobby = ayoLobbyType(game.game_type)
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
        : (timedLobbyType ?? limitOnlyType ?? boardLobbyType ?? parseGameType(game.game_type))
  ) as LobbyLimitGameType
  const gameUpdate: Record<string, unknown> = {}

  // Public/private visibility — controls whether the game shows up in Browse. Not
  // tied to a specific board type; any lobby-settings game can toggle it.
  if (is_public !== undefined) {
    gameUpdate.is_public = is_public
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
    } else {
      return NextResponse.json({ error: 'This game type does not support game length settings' }, { status: 400 })
    }
  }

  // Crossword / Word Search puzzle theme + difficulty. Stored on the game and consumed at
  // start (they pick the word bank + grid), so they're safe to change while still waiting.
  if (crossword_theme !== undefined || crossword_difficulty !== undefined) {
    if (limitOnlyType !== 'crossword') {
      return NextResponse.json({ error: 'This game type has no crossword theme settings' }, { status: 400 })
    }
    if (crossword_theme !== undefined) gameUpdate.crossword_theme = findCrosswordTheme(crossword_theme).id
    if (crossword_difficulty !== undefined)
      gameUpdate.crossword_difficulty = parseCrosswordDifficulty(crossword_difficulty)
  }
  if (word_search_theme !== undefined || word_search_difficulty !== undefined) {
    if (limitOnlyType !== 'word_search') {
      return NextResponse.json({ error: 'This game type has no word search theme settings' }, { status: 400 })
    }
    if (word_search_theme !== undefined) gameUpdate.word_search_theme = findWordSearchTheme(word_search_theme).id
    if (word_search_difficulty !== undefined) {
      gameUpdate.word_search_difficulty = parseWordSearchDifficulty(word_search_difficulty)
    }
  }
  if (word_scramble_theme !== undefined || word_scramble_difficulty !== undefined) {
    if (limitOnlyType !== 'word_scramble') {
      return NextResponse.json({ error: 'This game type has no word scramble theme settings' }, { status: 400 })
    }
    if (word_scramble_theme !== undefined)
      gameUpdate.word_scramble_theme = findWordScrambleTheme(word_scramble_theme).id
    if (word_scramble_difficulty !== undefined) {
      gameUpdate.word_scramble_difficulty = parseWordScrambleDifficulty(word_scramble_difficulty)
    }
  }

  if (boardLobbyType === 'monopoly') {
    if (monopoly_double_go_salary !== undefined) gameUpdate.monopoly_double_go_salary = monopoly_double_go_salary
    if (monopoly_forced_auctions !== undefined) gameUpdate.monopoly_forced_auctions = monopoly_forced_auctions
    if (monopoly_no_rent_in_jail !== undefined) gameUpdate.monopoly_no_rent_in_jail = monopoly_no_rent_in_jail
  } else if (
    monopoly_double_go_salary !== undefined ||
    monopoly_forced_auctions !== undefined ||
    monopoly_no_rent_in_jail !== undefined
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
    if (mafia_anonymous_votes !== undefined) gameUpdate.mafia_anonymous_votes = mafia_anonymous_votes
  } else if (
    mafia_doctor_enabled !== undefined ||
    mafia_detective_enabled !== undefined ||
    mafia_anonymous_votes !== undefined
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
