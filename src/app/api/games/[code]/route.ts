import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { assertHostGameSettings, assertHostLateJoinSettings } from '@/lib/game-admin'
import { questionPoolCap } from '@/lib/custom-questions'
import { parseTimerSeconds, updateGameSchema } from '@/lib/validation'
import { parseThemeId } from '@/lib/themes'
import {
  MONOPOLY_EDITION_TO_THEME,
  MONOPOLY_THEME_TO_EDITION,
  checkMonopolyEditionEntitlement,
  editionEntitlementError,
} from '@/lib/coins/editions'
import { parseJsonBody } from '@/lib/parse-body'
import { HOST_GAME_SELECT } from '@/lib/supabase-selects'
import {
  parseGameType,
  isHotSeat,
  isPairGame,
  parsePairVoteMode,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isCodewordsGame,
  isPickANumber,
  isICallOnGame,
  isWordHuntGame,
  isScrabbleGame,
  isChessGame,
  isCheckersGame,
  isDraughts10Game,
  isCheckersNigeriaGame,
  isTicTacToeGame,
  isLandmineGame,
} from '@/lib/game-types'
import {
  clampLandmineCategoryTimer,
  clampLandmineElimSeconds,
  clampLandmineMarkingTimer,
  clampLandmineMineCount,
  clampLandmineReviewTimer,
  clampLandmineWritingTimer,
  parseLandmineMineSource,
  parseLandmineMode,
} from '@/lib/landmine'
import { clampNpatGameDuration, clampNpatMarkingTimer, clampNpatTimer } from '@/lib/npat'
import { clampWordHuntTimer } from '@/lib/word-hunt'
import { clampChessTimer, clampChessBoardTheme, clampChessPieceSet } from '@/lib/chess'
import { clampCheckersTimer } from '@/lib/checkers'
import { clampDraughts10Timer } from '@/lib/draughts10'
import { clampTicTacToeTimer } from '@/lib/tic-tac-toe'
import {
  clampScrabbleTimer,
  clampScrabbleGameDuration,
  clampScrabbleClockSeconds,
  parseScrabbleClockMode,
} from '@/lib/scrabble'
import { parseScrabbleDictionaryId } from '@/lib/scrabble-dictionary-meta'
import { isCustomTwoSlotGame } from '@/lib/custom-game'
import { clampHotSeatMaxCap, HOT_SEAT_MIN_PLAYERS, hotSeatJoinedPlayers, hotSeatMaxCapUpperBound } from '@/lib/hot-seat'
import { parsePlayerQuestionsEnabled, parsePlayerQuestionsOrder } from '@/lib/player-question-pool'
import { supportsPlayerNameSubmissions } from '@/lib/player-participant-pool'
import { gameSupportsViewerSetting, lateJoinPolicyToFields, gameAllowsLatePlayerJoin } from '@/lib/viewers'
import { clampPanRounds } from '@/lib/pick-a-number'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { scheduleNewPublicGameFanout } from '@/lib/notification-subscriptions'

const supabase = getSupabaseAnon()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, updateGameSchema)
  if (bodyError) return bodyError

  const {
    hostToken,
    is_public: rawIsPublic,
    content_label: rawContentLabel,
    theme: rawTheme,
    edition_slug: rawEditionSlug,
    rounds_count: rawRoundsCount,
    timer_seconds: rawTimerSeconds,
    operative_timer_seconds: rawOperativeTimerSeconds,
    game_duration_seconds: rawGameDurationSeconds,
    scrabble_dictionary_id: rawScrabbleDictionaryId,
    scrabble_clock_mode: rawScrabbleClockMode,
    scrabble_clock_seconds: rawScrabbleClockSeconds,
    chess_board_theme: rawChessBoardTheme,
    chess_piece_set: rawChessPieceSet,
    wst_quote_source: rawWstQuoteSource,
    codewords_player_picks: rawCwPlayerPicks,
    codewords_randomize_teams: rawCwRandomize,
    participant_filter,
    keep_lobby_alive: rawKeepLobbyAlive,
  } = body

  // Fail-closed: treat this PATCH as "changeable while live" iff every provided setting is a
  // key that's safe to edit after the game starts (late-join controls + public/private
  // visibility, which just governs Browse listing). Deriving this from the provided keys
  // (rather than denylisting every other field) means any newly-added setting defaults to the
  // stricter assertHostGameSettings path instead of silently widening the weaker auth.
  const LIVE_EDITABLE_SETTING_KEYS = new Set([
    'late_join_policy',
    'allow_viewers',
    'allow_late_players',
    'is_public',
    'content_label',
    // Idle-lobby "Keep open" tap — safe to accept post-start (no-op except in
    // a waiting lobby anyway) and needs the weaker lobby-only auth.
    'keep_lobby_alive',
  ])
  const providedSettingKeys = Object.entries(body)
    .filter(([key, value]) => key !== 'hostToken' && value !== undefined)
    .map(([key]) => key)
  const lateJoinOnly =
    providedSettingKeys.length > 0 && providedSettingKeys.every((key) => LIVE_EDITABLE_SETTING_KEYS.has(key))

  const auth = lateJoinOnly
    ? await assertHostLateJoinSettings(getSupabaseAdmin(), code, hostToken)
    : await assertHostGameSettings(getSupabaseAdmin(), code, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const updatePayload: Record<string, unknown> = {}
  const gameType = parseGameType(auth.game!.game_type)

  // Public/private visibility — controls whether the game is listed in Browse.
  // Applies to every game type, so it's handled up front with no per-type gating.
  if (rawIsPublic !== undefined) {
    // Guard: a Public game with max_players < 2 has no seat to fill, and the
    // /browse feed excludes those rows — silently accepting would strand the
    // host with a toggle that never surfaces. Mirrors the create-route + lobby-
    // settings-route rejections.
    if (rawIsPublic === true) {
      const currentMax = Number(auth.game?.max_players ?? 0)
      if (currentMax > 0 && currentMax < 2) {
        return NextResponse.json({ error: 'Bump the max players above 1 to make this game Public.' }, { status: 400 })
      }
    }
    updatePayload.is_public = rawIsPublic
    // Discovery Phase B — false → true transition fans out to per-game-type
    // subscribers. Fire only on the transition (not on redundant true→true
    // writes) so a host toggling settings back and forth doesn't rate-limit
    // the whole fleet. Rate limit is a secondary guard.
    if (rawIsPublic === true && auth.game?.is_public !== true) {
      scheduleNewPublicGameFanout(
        auth.id!,
        String(auth.game?.game_type ?? ''),
        String(auth.game?.title ?? ''),
        (auth.game as { host_user_id?: string | null } | null)?.host_user_id ?? null
      )
    }
  }

  // T-13min "Keep open" tap — bump activity + stamp the warning column so the
  // pg_cron close job holds off and the client-side banner never re-fires for
  // this game. One bite per game (see docs/mobile-discovery-plan.md).
  if (rawKeepLobbyAlive === true) {
    updatePayload.last_activity_at = new Date().toISOString()
    updatePayload.host_idle_warning_sent_at = new Date().toISOString()
  }

  // Content label ("Maths", "Bible trivia") — trimmed + capped; empty string clears it.
  // Harmless display text, so editable even while the game is live.
  if (rawContentLabel !== undefined) {
    const trimmed = rawContentLabel.trim()
    updatePayload.content_label = trimmed ? trimmed.slice(0, 40) : null
  }

  // Theme / Monopoly edition. Safe pre-start (board isn't generated until start),
  // gated to waiting/finished by the assertHostGameSettings path above. For
  // Monopoly the theme and edition_slug fields are the same pick expressed
  // two ways — the engine reads `theme` for its rendering and `edition_slug`
  // as the durable pointer (Phase 4). Keeping them in lockstep here avoids
  // the split-brain "board renders as London but rules say USA" state
  // reviewer flagged.
  //
  // Ownership is server-authoritative: a host can't PATCH their room to a
  // paid edition they don't own, matching the shop's purchase_item pattern.
  // Free grandfathered editions (price 0 in game_editions) pass through
  // unconditionally.
  if (rawTheme !== undefined || rawEditionSlug !== undefined) {
    if (gameType === 'monopoly') {
      // Reconcile theme + edition_slug. If both provided, edition_slug wins
      // as the more specific pointer. Unknown-for-Monopoly themes (e.g.
      // theme:'dark') never map to a bogus edition_slug — we reject; a
      // newly-seeded edition slug without its theme-map entry also rejects
      // rather than silently downgrading theme to 'default'.
      const editionFromTheme = rawTheme !== undefined ? MONOPOLY_THEME_TO_EDITION[parseThemeId(rawTheme)] : undefined
      const editionExplicit = typeof rawEditionSlug === 'string' && rawEditionSlug.length > 0 ? rawEditionSlug : undefined
      const targetEdition = editionExplicit ?? editionFromTheme
      if (rawTheme !== undefined && !editionFromTheme) {
        return NextResponse.json({ error: 'Theme not valid for Monopoly' }, { status: 400 })
      }
      if (!targetEdition) {
        return NextResponse.json({ error: 'Unknown edition' }, { status: 400 })
      }
      const mappedTheme = MONOPOLY_EDITION_TO_THEME[targetEdition]
      if (!mappedTheme) {
        return NextResponse.json({ error: 'Unknown edition' }, { status: 400 })
      }
      const profileId =
        (auth.game as { host_user_id?: string | null } | null)?.host_user_id ?? null
      const entitlement = await checkMonopolyEditionEntitlement(getSupabaseAdmin(), profileId, targetEdition)
      if (!entitlement.ok) {
        const { status, error } = editionEntitlementError(entitlement.reason)
        return NextResponse.json({ error }, { status })
      }
      updatePayload.edition_slug = targetEdition
      updatePayload.theme = mappedTheme
    } else if (rawTheme !== undefined) {
      // Non-Monopoly game: theme is a plain cosmetic pick, edition_slug is
      // ignored (no other game type uses editions yet).
      updatePayload.theme = parseThemeId(rawTheme)
    }
  }

  // Who Said This quote source (player / anime / both). Consumed at start to pick which
  // quote pool(s) to draw from; the player + anime pools are stored independently, so
  // switching just re-selects and never clears either. Gated to waiting/finished by the
  // assertHostGameSettings path above. Schema already validated it to the enum.
  if (rawWstQuoteSource !== undefined) {
    if (gameType !== 'who_said_this') {
      return NextResponse.json({ error: 'Quote source only applies to Who Said This games' }, { status: 400 })
    }
    updatePayload.wst_quote_source = rawWstQuoteSource
  }

  // Codewords team-assignment mode (players pick / host assigns / randomize),
  // stored as two flags. Lobby-only: assertHostGameSettings already restricts
  // this PATCH to a game that hasn't started.
  if (gameType === 'codewords') {
    if (rawCwPlayerPicks !== undefined) updatePayload.codewords_player_picks = rawCwPlayerPicks
    if (rawCwRandomize !== undefined) updatePayload.codewords_randomize_teams = rawCwRandomize
  }

  if (rawRoundsCount !== undefined) {
    const min = isHotSeat(gameType) ? HOT_SEAT_MIN_PLAYERS : 1
    let rounds_count: number

    if (isHotSeat(gameType)) {
      const [{ data: playersData }, { data: participantsData }] = await Promise.all([
        supabase.from('players').select('id, participant_id, name').eq('game_id', auth.id),
        supabase.from('participants').select('id, name').eq('game_id', auth.id),
      ])
      const joinedCount = hotSeatJoinedPlayers(
        playersData ?? [],
        participantsData ?? [],
        auth.game!.participant_mode
      ).length
      const upper = hotSeatMaxCapUpperBound(joinedCount, participantsData?.length ?? 0)
      rounds_count = clampHotSeatMaxCap(rawRoundsCount, upper)
    } else if (isPickANumber(gameType)) {
      rounds_count = clampPanRounds(rawRoundsCount)
    } else {
      let cap = questionPoolCap(auth.game!)
      if (isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType)) {
        const questionType = isMostLikelyTo(gameType) ? 'mlt' : 'wyr'
        const { count } = await supabase
          .from('player_questions')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', auth.id)
          .eq('question_type', questionType)
        cap = questionPoolCap(auth.game!, count ?? 0)
      }
      if (rawRoundsCount > cap) {
        return NextResponse.json({ error: `Too many rounds — pick ${cap} or fewer` }, { status: 400 })
      }
      rounds_count = Math.min(Math.max(rawRoundsCount, min), cap)
    }

    updatePayload.rounds_count = rounds_count
  }

  if (rawTimerSeconds !== undefined) {
    updatePayload.timer_seconds = isICallOnGame(gameType)
      ? clampNpatTimer(rawTimerSeconds)
      : isWordHuntGame(gameType)
        ? clampWordHuntTimer(rawTimerSeconds)
        : isScrabbleGame(gameType)
          ? clampScrabbleTimer(rawTimerSeconds)
          : isChessGame(gameType)
            ? clampChessTimer(rawTimerSeconds)
            : isCheckersGame(gameType)
              ? clampCheckersTimer(rawTimerSeconds)
              : isDraughts10Game(gameType)
                ? clampDraughts10Timer(rawTimerSeconds)
                : isTicTacToeGame(gameType)
                  ? clampTicTacToeTimer(rawTimerSeconds)
                  : parseTimerSeconds(rawTimerSeconds)
  }

  // Chess host-default appearance (board colours + piece set). Cosmetic — the pre-start
  // gating from assertHostGameSettings already restricts this PATCH to a waiting/finished
  // game. Values are validated to known ids server-side (unknown → the default).
  if (isChessGame(gameType)) {
    if (rawChessBoardTheme !== undefined) updatePayload.chess_board_theme = clampChessBoardTheme(rawChessBoardTheme)
    if (rawChessPieceSet !== undefined) updatePayload.chess_piece_set = clampChessPieceSet(rawChessPieceSet)
  } else if (rawChessBoardTheme !== undefined || rawChessPieceSet !== undefined) {
    return NextResponse.json({ error: 'Board and piece appearance only apply to Chess games' }, { status: 400 })
  }

  // Landmine host-lobby settings. Pre-start only (assertHostGameSettings restricts this PATCH to a
  // waiting/finished game). The landmine timers live on the shared timer columns, so they're
  // clamped here rather than in the generic timer blocks below.
  if (isLandmineGame(gameType)) {
    if (body.landmine_mode !== undefined) updatePayload.landmine_mode = parseLandmineMode(body.landmine_mode)
    if (body.landmine_mine_source !== undefined) {
      updatePayload.landmine_mine_source = parseLandmineMineSource(body.landmine_mine_source)
    }
    if (body.landmine_mine_count !== undefined) {
      updatePayload.landmine_mine_count = clampLandmineMineCount(body.landmine_mine_count)
    }
    if (body.landmine_originality_bonus !== undefined) {
      updatePayload.landmine_originality_bonus = body.landmine_originality_bonus !== false
    }
    if (body.landmine_elim_seconds !== undefined) {
      updatePayload.landmine_elim_seconds = clampLandmineElimSeconds(body.landmine_elim_seconds)
    }
    if (body.landmine_review !== undefined) {
      updatePayload.landmine_review = body.landmine_review !== false
    }
    if (body.landmine_review_seconds !== undefined) {
      updatePayload.landmine_review_seconds = clampLandmineReviewTimer(body.landmine_review_seconds)
    }
    if (rawTimerSeconds !== undefined) updatePayload.timer_seconds = clampLandmineWritingTimer(rawTimerSeconds)
    if (rawOperativeTimerSeconds !== undefined) {
      updatePayload.operative_timer_seconds = clampLandmineMarkingTimer(rawOperativeTimerSeconds)
    }
    if (rawGameDurationSeconds !== undefined) {
      updatePayload.game_duration_seconds = clampLandmineCategoryTimer(rawGameDurationSeconds)
    }
  }

  // Nigerian Draughts "Street Rules" (huffing) toggle. Pre-start only, same as the timer.
  if (isCheckersNigeriaGame(gameType) && body.checkers_nigeria_street_rules !== undefined) {
    updatePayload.checkers_nigeria_street_rules = body.checkers_nigeria_street_rules === true
  }

  if (rawOperativeTimerSeconds !== undefined) {
    if (isICallOnGame(gameType)) {
      updatePayload.operative_timer_seconds = clampNpatMarkingTimer(rawOperativeTimerSeconds)
    }
  }

  if (rawGameDurationSeconds !== undefined) {
    if (isICallOnGame(gameType)) {
      updatePayload.game_duration_seconds = clampNpatGameDuration(rawGameDurationSeconds)
    } else if (isScrabbleGame(gameType)) {
      updatePayload.game_duration_seconds = clampScrabbleGameDuration(rawGameDurationSeconds)
    }
  }

  if (rawScrabbleDictionaryId !== undefined && isScrabbleGame(gameType)) {
    updatePayload.scrabble_dictionary_id = parseScrabbleDictionaryId(rawScrabbleDictionaryId)
  }

  if (isScrabbleGame(gameType)) {
    if (rawScrabbleClockMode !== undefined) {
      const clockMode = parseScrabbleClockMode(rawScrabbleClockMode)
      updatePayload.scrabble_clock_mode = clockMode
      // Leaving chess mode zeroes the (now unused) bank; entering it takes the bank
      // sent alongside (if any) — init falls back to the default when it's still 0.
      if (clockMode === 'standard') {
        updatePayload.scrabble_clock_seconds = 0
      } else {
        // Chess mode has no whole-game cap; zero it so the whole-game expiry can't
        // fire against a chess game switched over from a timed standard config.
        updatePayload.game_duration_seconds = 0
        if (rawScrabbleClockSeconds !== undefined)
          updatePayload.scrabble_clock_seconds = clampScrabbleClockSeconds(rawScrabbleClockSeconds)
      }
    } else if (rawScrabbleClockSeconds !== undefined) {
      updatePayload.scrabble_clock_seconds = clampScrabbleClockSeconds(rawScrabbleClockSeconds)
    }
  }

  if (participant_filter !== undefined) {
    updatePayload.participant_filter = participant_filter === 'joined' ? 'joined' : 'all'
  }

  if (body.gender_based !== undefined) {
    return NextResponse.json(
      { error: "Who's in each round is set when the game is created — create a new game to change it" },
      { status: 400 }
    )
  }

  if (body.pair_vote_mode !== undefined) {
    const gameType = parseGameType(auth.game!.game_type)
    if (!isPairGame(gameType) && !isCustomTwoSlotGame(auth.game!)) {
      return NextResponse.json({ error: 'This game type does not support pair voting settings' }, { status: 400 })
    }
    updatePayload.pair_vote_mode = parsePairVoteMode(body.pair_vote_mode)
  }

  const gameTypeForLobby = gameType
  const isLobbyQuestions = isBinaryChoiceGame(gameTypeForLobby) || isMostLikelyTo(gameTypeForLobby)
  const supportsPlayerSubmissions =
    isLobbyQuestions ||
    supportsPlayerNameSubmissions({ game_type: gameType, participant_mode: auth.game!.participant_mode })

  if (body.player_questions_enabled !== undefined) {
    if (!supportsPlayerSubmissions) {
      return NextResponse.json({ error: 'This game type does not support player submission settings' }, { status: 400 })
    }
    updatePayload.player_questions_enabled = parsePlayerQuestionsEnabled(body.player_questions_enabled)
  }

  if (body.player_questions_order !== undefined) {
    if (!supportsPlayerSubmissions) {
      return NextResponse.json({ error: 'This game type does not support player submission settings' }, { status: 400 })
    }
    updatePayload.player_questions_order = parsePlayerQuestionsOrder(body.player_questions_order)
  }

  if (body.ai_questions_enabled !== undefined) {
    updatePayload.ai_questions_enabled = body.ai_questions_enabled
  }

  if (body.ai_questions_config !== undefined) {
    updatePayload.ai_questions_config = body.ai_questions_config
  }

  if (body.late_join_policy !== undefined) {
    if (!gameSupportsViewerSetting(gameType)) {
      return NextResponse.json({ error: 'This game type does not support late join settings' }, { status: 400 })
    }
    let policy = body.late_join_policy
    if (!gameAllowsLatePlayerJoin(gameType) && policy === 'viewers_and_players') {
      policy = 'viewers_only'
    }
    const fields = lateJoinPolicyToFields(policy)
    updatePayload.allow_viewers = fields.allow_viewers
    updatePayload.allow_late_players = fields.allow_late_players
    if (isCodewordsGame(gameType)) {
      updatePayload.codewords_late_join = fields.allow_late_players
    }
  } else if (body.allow_viewers !== undefined || body.allow_late_players !== undefined) {
    if (!gameSupportsViewerSetting(gameType)) {
      return NextResponse.json({ error: 'This game type does not support late join settings' }, { status: 400 })
    }
    const allowViewersValue =
      body.allow_viewers !== undefined ? body.allow_viewers !== false : auth.game!.allow_viewers !== false
    const allowLatePlayersValue =
      body.allow_late_players !== undefined
        ? body.allow_late_players !== false
        : auth.game!.allow_late_players !== false
    updatePayload.allow_viewers = allowViewersValue
    updatePayload.allow_late_players = allowViewersValue && allowLatePlayersValue
    if (isCodewordsGame(gameType)) {
      updatePayload.codewords_late_join = updatePayload.allow_late_players
    }
  }

  if (
    isLobbyQuestions &&
    (body.player_questions_enabled !== undefined || body.player_questions_order !== undefined) &&
    rawRoundsCount === undefined
  ) {
    const nextGame = {
      ...auth.game!,
      player_questions_enabled:
        body.player_questions_enabled !== undefined
          ? parsePlayerQuestionsEnabled(body.player_questions_enabled)
          : auth.game!.player_questions_enabled,
      player_questions_order:
        body.player_questions_order !== undefined
          ? parsePlayerQuestionsOrder(body.player_questions_order)
          : auth.game!.player_questions_order,
    }
    const questionType = isMostLikelyTo(gameType) ? 'mlt' : 'wyr'
    const { count } = await supabase
      .from('player_questions')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', auth.id)
      .eq('question_type', questionType)
    const cap = questionPoolCap(nextGame, count ?? 0)
    if (auth.game!.rounds_count > cap) {
      updatePayload.rounds_count = cap
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game, error } = await getSupabaseAdmin()
    .from('games')
    .update(updatePayload)
    .eq('id', auth.id)
    // Return the host-safe column set — never echo host_token back to the client.
    .select(HOST_GAME_SELECT)
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('games/code', error) }, { status: 500 })

  return NextResponse.json({ game })
}
