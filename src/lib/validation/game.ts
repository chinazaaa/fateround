import { z } from 'zod'
import { LOBBY_LIMIT_GAME_TYPES } from '@/lib/game-limits'
import { SCRABBLE_DICTIONARY_OPTIONS } from '@/lib/scrabble-dictionary-meta'
import {
  sanitizedString,
  gameCodeString,
  hostTokenString,
  uuidString,
  autoSubmitBehaviorEnum,
  participantModeEnum,
  pairVoteModeEnum,
  questionSourceEnum,
  playerQuestionsOrderEnum,
  gameTypeEnum,
  themeEnum,
  wstQuoteSourceEnum,
  participantFilterEnum,
  triviaCategoryEnum,
} from './shared'

const mahjongRulesetEnum = z.enum(['fate_round', 'hong_kong', 'riichi', 'mcr'])
const mahjongRuleOptionsSchema = z
  .object({
    matchLength: z.enum(['east', 'hanchan']).optional(),
    startingScore: z.coerce.number().int().min(0).max(100000).optional(),
    returnScore: z.coerce.number().int().min(0).max(100000).optional(),
    bankruptcyEndsMatch: z.boolean().optional(),
    agariYame: z.boolean().optional(),
    okaEnabled: z.boolean().optional(),
    uma: z
      .tuple([
        z.coerce.number().int().min(-100000).max(100000),
        z.coerce.number().int().min(-100000).max(100000),
        z.coerce.number().int().min(-100000).max(100000),
        z.coerce.number().int().min(-100000).max(100000),
      ])
      .optional(),
    doubleYakuman: z.boolean().optional(),
    kazoeYakuman: z.boolean().optional(),
    kiriageMangan: z.boolean().optional(),
    openTanyao: z.boolean().optional(),
    redFives: z.boolean().optional(),
    abortiveDraws: z.boolean().optional(),
    nagashiMangan: z.boolean().optional(),
    renhou: z.enum(['off', 'mangan', 'yakuman']).optional(),
    chomboPenalty: z.enum(['mangan', 'none']).optional(),
    hongKongMinimumFan: z.coerce.number().int().min(0).max(13).optional(),
    hongKongLimitFan: z.coerce.number().int().min(3).max(13).optional(),
    mcrMinimumPoints: z.coerce.number().int().min(0).max(88).optional(),
  })
  .optional()

// ---------------------------------------------------------------------------
// Game creation (POST /api/games)
// ---------------------------------------------------------------------------

const participantItemSchema = z.union([
  sanitizedString(1, 80),
  z.object({
    name: sanitizedString(1, 80),
    gender: z.string().optional(),
  }),
])

export const createGameSchema = z.object({
  title: sanitizedString(1, 100),
  rounds_count: z.coerce.number().int().min(1).max(100).optional(),
  timer_seconds: z.coerce.number().optional(),
  operative_timer_seconds: z.coerce.number().optional(),
  anonymous: z.boolean().optional(),
  auto_reveal: z.boolean().optional(),
  auto_submit_behavior: autoSubmitBehaviorEnum.optional(),
  participant_mode: participantModeEnum.optional(),
  pair_vote_mode: pairVoteModeEnum.optional(),
  question_source: questionSourceEnum.optional(),
  custom_questions: z.array(z.unknown()).optional().nullable(),
  player_questions_enabled: z.boolean().optional(),
  player_questions_order: playerQuestionsOrderEnum.optional(),
  game_type: gameTypeEnum.optional(),
  theme: themeEnum.optional(),
  wst_quote_source: wstQuoteSourceEnum.optional(),
  participant_filter: participantFilterEnum.optional(),
  gender_based: z.boolean().optional(),
  max_players: z.coerce.number().int().min(1).max(100).optional(),
  codewords_player_picks: z.boolean().optional(),
  codewords_late_join: z.boolean().optional(),
  describe_it_num_teams: z.coerce.number().int().min(2).max(4).optional(),
  describe_it_mode: z.enum(['team', 'individual']).optional(),
  allow_viewers: z.boolean().optional(),
  allow_late_players: z.boolean().optional(),
  late_join_policy: z.enum(['lobby_only', 'viewers_only', 'viewers_and_players']).optional(),
  codewords_randomize_teams: z.boolean().optional(),
  trivia_category: triviaCategoryEnum.optional(),
  bingo_call_mode: z.enum(['manual', 'auto']).optional(),
  bingo_call_interval_seconds: z.coerce.number().optional(),
  game_duration_seconds: z.coerce.number().optional(),
  whot_pick3_enabled: z.boolean().optional(),
  whot_cards_enabled: z.boolean().optional(),
  whot_number_calls_enabled: z.boolean().optional(),
  ai_questions_enabled: z.boolean().optional(),
  ai_questions_config: z
    .object({
      ratio: z.enum(['all_ai', 'mostly_ai', 'half', 'mostly_platform']),
      theme: z.string().max(100).optional(),
      customPrompt: z.string().max(500).optional(),
    })
    .optional()
    .nullable(),
  whot_pick2_stacking: z.boolean().optional(),
  crazy8_action_cards: z.boolean().optional(),
  crazy8_jokers: z.boolean().optional(),
  crazy8_pick2_stacking: z.boolean().optional(),
  ludo_variant: z.enum(['modern', 'traditional']).optional(),
  mahjong_ruleset: mahjongRulesetEnum.optional(),
  mahjong_rule_options: mahjongRuleOptionsSchema,
  scrabble_dictionary_id: z.enum(SCRABBLE_DICTIONARY_OPTIONS).optional(),
  scrabble_clock_mode: z.enum(['standard', 'chess']).optional(),
  scrabble_clock_seconds: z.coerce.number().optional(),
  chess_board_theme: z.string().optional(),
  chess_piece_set: z.string().optional(),
  custom_slots: z
    .object({
      slots: z
        .array(
          z.object({
            key: z.string(),
            label: sanitizedString(1, 20),
            emoji: z.string().min(1).max(4),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          })
        )
        .min(2)
        .max(5),
      title: sanitizedString(1, 100),
      gender_based: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  participants: z.array(participantItemSchema).optional(),
})

export type CreateGameInput = z.infer<typeof createGameSchema>

// ---------------------------------------------------------------------------
// Update game settings (PATCH /api/games/[code])
// ---------------------------------------------------------------------------

export const updateGameSchema = z.object({
  hostToken: hostTokenString(),
  rounds_count: z.coerce.number().int().min(1, 'rounds_count is required').optional(),
  timer_seconds: z.coerce.number().optional(),
  operative_timer_seconds: z.coerce.number().optional(),
  game_duration_seconds: z.coerce.number().optional(),
  scrabble_dictionary_id: z.enum(SCRABBLE_DICTIONARY_OPTIONS).optional(),
  scrabble_clock_mode: z.enum(['standard', 'chess']).optional(),
  scrabble_clock_seconds: z.coerce.number().optional(),
  participant_filter: participantFilterEnum.optional(),
  gender_based: z.boolean().optional(),
  pair_vote_mode: pairVoteModeEnum.optional(),
  player_questions_enabled: z.boolean().optional(),
  player_questions_order: playerQuestionsOrderEnum.optional(),
  ai_questions_enabled: z.boolean().optional(),
  ai_questions_config: z
    .object({
      ratio: z.enum(['all_ai', 'mostly_ai', 'half', 'mostly_platform']),
      theme: z.string().max(100).optional(),
      customPrompt: z.string().max(500).optional(),
    })
    .optional()
    .nullable(),
  allow_viewers: z.boolean().optional(),
  allow_late_players: z.boolean().optional(),
  late_join_policy: z.enum(['lobby_only', 'viewers_only', 'viewers_and_players']).optional(),
})

export type UpdateGameInput = z.infer<typeof updateGameSchema>

// ---------------------------------------------------------------------------
// Host-only actions (start / next-round / end-round / finish-game / play-again)
// ---------------------------------------------------------------------------

export const hostActionSchema = z.object({
  hostToken: hostTokenString(),
})

export type HostActionInput = z.infer<typeof hostActionSchema>

export const monopolyExtendTimeSchema = hostActionSchema.extend({
  extensionSeconds: z.coerce.number().int().positive(),
})

export const playAgainSchema = hostActionSchema.extend({
  hostPlayerId: uuidString('hostPlayerId').optional(),
  custom_questions: z.array(z.unknown()).optional(),
  participants: z
    .array(
      z.union([
        sanitizedString(1, 80),
        z.object({
          name: sanitizedString(1, 80),
          gender: z.string().optional(),
        }),
      ])
    )
    .optional(),
  question_source: z.enum(['platform', 'custom']).optional(),
  trivia_category: z.enum(['tech', 'general']).optional(),
  timer_seconds: z.union([z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).optional(),
  rounds_count: z.number().int().min(3).max(25).optional(),
})

export type PlayAgainInput = z.infer<typeof playAgainSchema>

export const bingoSettingsSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
  bingo_call_mode: z.enum(['manual', 'auto']).optional(),
  bingo_call_interval_seconds: z.coerce.number().optional(),
  max_players: z.coerce.number().int().min(2).max(100).optional(),
})

export const codewordsLobbySettingsSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
  max_players: z.coerce.number().int().min(2).max(100).optional(),
  spymasterTimerSeconds: z.coerce.number().optional(),
  operativeTimerSeconds: z.coerce.number().optional(),
})

export type BingoSettingsInput = z.infer<typeof bingoSettingsSchema>

export const boardGameLobbySettingsSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
  max_players: z.coerce.number().int().min(1).max(100).optional(),
  timer_seconds: z.coerce.number().optional(),
  game_duration_seconds: z.coerce.number().optional(),
  whot_pick3_enabled: z.boolean().optional(),
  whot_cards_enabled: z.boolean().optional(),
  whot_number_calls_enabled: z.boolean().optional(),
  whot_pick2_stacking: z.boolean().optional(),
  crazy8_action_cards: z.boolean().optional(),
  crazy8_jokers: z.boolean().optional(),
  crazy8_pick2_stacking: z.boolean().optional(),
  ludo_variant: z.enum(['modern', 'traditional']).optional(),
  mahjong_ruleset: mahjongRulesetEnum.optional(),
  mahjong_rule_options: mahjongRuleOptionsSchema,
})

export type BoardGameLobbySettingsInput = z.infer<typeof boardGameLobbySettingsSchema>

// ---------------------------------------------------------------------------
// Admin game player limits
// ---------------------------------------------------------------------------

export const patchGamePlayerLimitsSchema = z.object({
  limits: z
    .array(
      z.object({
        game_type: z.enum(LOBBY_LIMIT_GAME_TYPES),
        max_players: z.coerce.number().int().min(2).max(100),
      })
    )
    .min(1),
})

export type PatchGamePlayerLimitsInput = z.infer<typeof patchGamePlayerLimitsSchema>
