import { z } from 'zod'
import { LOBBY_LIMIT_GAME_TYPES } from '@/lib/game-limits'
import { MONOPOLY_TOKEN_ID_LIST } from '@/lib/monopoly-tokens'
import { SCRABBLE_DICTIONARY_OPTIONS } from '@/lib/scrabble-dictionary-meta'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to prevent stored XSS. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

/** Strip Unicode bidi control characters that can mirror adjacent text in inline layouts. */
export function stripBidiControls(s: string): string {
  return s.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
}

/** Zod transform: trim + strip HTML. */
export const sanitizedString = (min: number, max: number) =>
  z
    .string()
    .transform((s) => stripHtml(s.trim()))
    .pipe(z.string().min(min, `Must be at least ${min} character(s)`).max(max, `Must be at most ${max} characters`))

/** Zod transform: trim + strip HTML + uppercase (for game codes). */
const gameCodeString = () =>
  z
    .string()
    .transform((s) => stripHtml(s.trim()).toUpperCase())
    .pipe(
      z
        .string()
        .min(4, 'Game code must be 4-8 characters')
        .max(8, 'Game code must be 4-8 characters')
        .regex(/^[A-Z0-9]+$/, 'Game code must be alphanumeric')
    )

export const hostTokenString = () => z.string().min(1, 'hostToken is required')

const uuidString = (label: string = 'ID') => z.string().uuid(`${label} must be a valid UUID`)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const gameTypeEnum = z.enum([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
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
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
])

const participantModeEnum = z.enum(['import', 'joiners', 'voters'])
const autoSubmitBehaviorEnum = z.enum(['random', 'no_answer'])
const pairVoteModeEnum = z.enum(['any', 'one_each'])
const questionSourceEnum = z.enum(['platform', 'custom'])
const triviaCategoryEnum = z.enum(['tech', 'general'])
const playerQuestionsOrderEnum = z.enum(['players_first', 'uploaded_first', 'mixed'])
const wstQuoteSourceEnum = z.enum(['player', 'anime', 'both'])
const wyrChoiceEnum = z.enum(['a', 'b'])
const participantGenderEnum = z.enum(['male', 'female'])
const playerGenderEnum = z.enum(['male', 'female', 'both'])
const pairFlagEnum = z.enum(['kiss', 'kill'])
const themeEnum = z.enum(['default', 'neon', 'retro', 'elegant', 'tropical'])
const participantFilterEnum = z.enum(['all', 'joined'])
const timerSecondsEnum = z.union([z.literal(10), z.literal(15), z.literal(30), z.literal(60)])

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
  scrabble_dictionary_id: z.enum(SCRABBLE_DICTIONARY_OPTIONS).optional(),
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

export const ROUND_TIMER_OPTIONS = [15, 30, 60] as const
export type RoundTimerSeconds = (typeof ROUND_TIMER_OPTIONS)[number]

export function parseTimerSeconds(raw: unknown): RoundTimerSeconds {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  return ROUND_TIMER_OPTIONS.includes(n as RoundTimerSeconds) ? (n as RoundTimerSeconds) : 30
}

export const updateGameSchema = z.object({
  hostToken: hostTokenString(),
  rounds_count: z.coerce.number().int().min(1, 'rounds_count is required').optional(),
  timer_seconds: z.coerce.number().optional(),
  operative_timer_seconds: z.coerce.number().optional(),
  game_duration_seconds: z.coerce.number().optional(),
  scrabble_dictionary_id: z.enum(SCRABBLE_DICTIONARY_OPTIONS).optional(),
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

// ---------------------------------------------------------------------------
// Participants (POST /api/participants)
// ---------------------------------------------------------------------------

export const createParticipantSchema = z.object({
  gameCode: gameCodeString(),
  hostToken: hostTokenString(),
  name: sanitizedString(1, 80).optional(),
  gender: z.string().optional(),
  participants: z
    .array(
      z.object({
        name: sanitizedString(1, 80),
        gender: z.string().optional(),
      })
    )
    .optional(),
})

export type CreateParticipantInput = z.infer<typeof createParticipantSchema>

// ---------------------------------------------------------------------------
// Participants (PATCH /api/participants)
// ---------------------------------------------------------------------------

export const updateParticipantSchema = z.object({
  gameCode: gameCodeString(),
  hostToken: hostTokenString(),
  participantId: uuidString('participantId'),
  name: sanitizedString(1, 80).optional(),
  gender: z.string().optional(),
  inMltPoll: z.boolean().optional(),
})

export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>

// ---------------------------------------------------------------------------
// Participants (DELETE /api/participants)
// ---------------------------------------------------------------------------

export const deleteParticipantSchema = z.object({
  gameCode: gameCodeString(),
  hostToken: hostTokenString(),
  participantId: uuidString('participantId'),
})

export type DeleteParticipantInput = z.infer<typeof deleteParticipantSchema>

export const createPlayerSchema = z.object({
  gameCode: gameCodeString(),
  playerName: sanitizedString(1, 50).nullish(),
  gender: playerGenderEnum.or(z.string()).nullish(),
  pollGender: participantGenderEnum.or(z.string()).nullish(),
  identityGender: participantGenderEnum.or(z.string()).nullish(),
  participantId: uuidString('participantId').nullish(),
  joinAsViewer: z.boolean().optional(),
  monopolyToken: z.enum(MONOPOLY_TOKEN_ID_LIST as [string, ...string[]]).optional(),
  roomMemberCode: z.string().trim().toUpperCase().max(12).optional(),
})

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>

// ---------------------------------------------------------------------------
// Players (PATCH /api/players)
// ---------------------------------------------------------------------------

export const updatePlayerSchema = z.object({
  gameCode: gameCodeString(),
  playerId: uuidString('playerId'),
  playerName: sanitizedString(1, 50).optional(),
  gender: z.string().optional(),
  pollGender: z.string().optional(),
  identityGender: z.string().optional(),
  participantId: z.string().optional(),
  hostToken: z.string().optional(),
  // Non-host callers must prove ownership of the target player with their resume_token
  // (a player may only edit themselves). Host callers use hostToken instead.
  resumeToken: z.string().optional(),
})

export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>

// ---------------------------------------------------------------------------
// Players (DELETE /api/players)
// ---------------------------------------------------------------------------

export const deletePlayerSchema = z.object({
  gameCode: gameCodeString(),
  playerId: uuidString('playerId'),
  hostToken: z.string().optional(),
  // Non-host callers (a player removing themselves) must prove ownership with resume_token.
  resumeToken: z.string().optional(),
})

export type DeletePlayerInput = z.infer<typeof deletePlayerSchema>

// ---------------------------------------------------------------------------
// Players (POST /api/players/promote)
// ---------------------------------------------------------------------------

export const promotePlayerSchema = z.object({
  gameCode: gameCodeString(),
  // Self-promotion (spectator → player): the caller is resolved from their resume_token; no
  // client-supplied playerId (the actor is always the token's own player).
  resumeToken: z.string().min(4),
})

export type PromotePlayerInput = z.infer<typeof promotePlayerSchema>

// ---------------------------------------------------------------------------
// Votes (POST /api/votes)
// ---------------------------------------------------------------------------

export const createVoteSchema = z.object({
  // Voter authorized by the secret resume_token (resolved to a player server-side),
  // not a client-supplied playerId (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  gameId: gameCodeString(),
  kiss: z.string().optional().nullable(),
  marry: z.string().optional().nullable(),
  kill: z.string().optional().nullable(),
  pairAssignments: z.record(z.string(), pairFlagEnum).optional().nullable(),
  wyrChoice: wyrChoiceEnum.optional().nullable(),
  targetPlayerId: z.string().optional().nullable(),
  targetParticipantId: z.string().optional().nullable(),
  animeChoice: z.string().max(200).optional().nullable(),
  customAssignments: z.record(z.string(), z.string()).optional().nullable(),
  pickedNumber: z.number().int().min(1).max(100).optional().nullable(),
})

export type CreateVoteInput = z.infer<typeof createVoteSchema>

// ---------------------------------------------------------------------------
// Confessions (POST /api/confessions)
// ---------------------------------------------------------------------------

export const createConfessionSchema = z.object({
  gameId: gameCodeString(),
  roundId: uuidString('roundId').optional().nullable(),
  text: sanitizedString(1, 500),
  // Confessions are anonymous to other players, but the poster must still be a real player
  // in the game — gate by resume_token (resolved server-side) to stop anon-key spam.
  resumeToken: z.string().min(4),
})

export type CreateConfessionInput = z.infer<typeof createConfessionSchema>

// ---------------------------------------------------------------------------
// Anonymous messages (POST /api/anonymous-messages)
// ---------------------------------------------------------------------------

export const createAnonymousMessageSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  text: z
    .string()
    .transform((s) => stripHtml(s.trim()))
    .pipe(z.string().max(500))
    .default(''),
  replyToId: uuidString('replyToId').optional(),
  messageType: z.enum(['text', 'gif']).default('text'),
  mediaUrl: z.string().url().max(2000).optional().nullable(),
})

export type CreateAnonymousMessageInput = z.infer<typeof createAnonymousMessageSchema>

export const deleteAnonymousMessageSchema = z.object({
  gameId: gameCodeString(),
  messageId: uuidString('messageId'),
  hostToken: hostTokenString(),
})

export type DeleteAnonymousMessageInput = z.infer<typeof deleteAnonymousMessageSchema>

export const anonymousRoomBanSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  hostToken: hostTokenString(),
  durationMinutes: z.coerce.number().int().min(1).max(120),
})

export type AnonymousRoomBanInput = z.infer<typeof anonymousRoomBanSchema>

export const anonymousRoomUnbanSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  hostToken: hostTokenString(),
})

export type AnonymousRoomUnbanInput = z.infer<typeof anonymousRoomUnbanSchema>

// ---------------------------------------------------------------------------
// Bingo (POST /api/bingo/*)
// ---------------------------------------------------------------------------

export const bingoCallSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
  number: z.coerce.number().int().min(1).max(75).optional(),
  random: z.boolean().optional(),
})

export const bingoMarkSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  cellIndex: z.coerce.number().int().min(0).max(24),
})

export const bingoClaimSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export type BingoCallInput = z.infer<typeof bingoCallSchema>
export type BingoMarkInput = z.infer<typeof bingoMarkSchema>
export type BingoClaimInput = z.infer<typeof bingoClaimSchema>

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

export const triviaAnswerSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  choiceIndex: z.coerce.number().int().min(0).max(3),
})

export type TriviaAnswerInput = z.infer<typeof triviaAnswerSchema>

export const triviaAdvanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1).optional(),
  force: z.boolean().optional(),
})

export type TriviaAdvanceInput = z.infer<typeof triviaAdvanceSchema>

const ttlStatementText = sanitizedString(1, 200)

export const ttlStatementSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  statementA: ttlStatementText,
  statementB: ttlStatementText,
  statementC: ttlStatementText,
  lieIndex: z.coerce.number().int().min(0).max(2),
})

export type TtlStatementInput = z.infer<typeof ttlStatementSchema>

export const ttlGuessSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  guessedIndex: z.coerce.number().int().min(0).max(2),
})

export type TtlGuessInput = z.infer<typeof ttlGuessSchema>

export const ttlAdvanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1).optional(),
  force: z.boolean().optional(),
})

export type TtlAdvanceInput = z.infer<typeof ttlAdvanceSchema>

export const npatSubmitSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  name: z.string().max(80),
  animal: z.string().max(80),
  place: z.string().max(80),
  thing: z.string().max(80),
  food: z.string().max(80),
})

export type NpatSubmitInput = z.infer<typeof npatSubmitSchema>

export const npatDraftSchema = npatSubmitSchema

export type NpatDraftInput = z.infer<typeof npatDraftSchema>

export const npatMarkSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  validName: z.boolean(),
  validAnimal: z.boolean(),
  validPlace: z.boolean(),
  validThing: z.boolean(),
  validFood: z.boolean(),
})

export type NpatMarkInput = z.infer<typeof npatMarkSchema>

const npatHostOverrideEntrySchema = z.object({
  playerId: uuidString('playerId'),
  validName: z.boolean(),
  validAnimal: z.boolean(),
  validPlace: z.boolean(),
  validThing: z.boolean(),
  validFood: z.boolean(),
})

export const npatCallerApproveSchema = z.object({
  gameId: gameCodeString(),
  // Caller (a player) authorized by the secret resume_token; nested overrides[].playerId
  // below are review TARGETS, not the actor, so they stay as ids.
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  overrides: z.array(npatHostOverrideEntrySchema),
})

export type NpatCallerApproveInput = z.infer<typeof npatCallerApproveSchema>

export const npatAdvanceSchema = z.object({
  gameId: gameCodeString(),
  force: z.boolean().optional(),
})

export type NpatAdvanceInput = z.infer<typeof npatAdvanceSchema>

export const npatDisputeSchema = z.object({
  gameId: gameCodeString(),
  // Disputing player authorized by the secret resume_token; targetPlayerId is the
  // disputed answer's owner (a TARGET), so it stays an id.
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  targetPlayerId: uuidString('targetPlayerId'),
  category: z.enum(['name', 'animal', 'place', 'thing', 'food']),
})

export type NpatDisputeInput = z.infer<typeof npatDisputeSchema>

export const monopolyActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const monopolyBuySchema = monopolyActionSchema.extend({
  // 'buy' = purchase it · 'auction' = decline and put it up for auction · 'pass' =
  // decline and skip the auction, the turn just moves on.
  decision: z.enum(['buy', 'auction', 'pass']),
})

export const monopolyJailSchema = monopolyActionSchema.extend({
  method: z.enum(['pay', 'card']),
})

export const monopolyAuctionSchema = monopolyActionSchema.extend({
  action: z.enum(['pass', 'bid']),
  amount: z.number().int().min(1).optional(),
})

export const monopolyBuildSchema = monopolyActionSchema.extend({
  spaceIndex: z.number().int().min(0).max(39),
  action: z.enum(['buy_house', 'sell_house', 'buy_hotel', 'sell_hotel']),
})

export const monopolyMortgageSchema = monopolyActionSchema.extend({
  spaceIndex: z.number().int().min(0).max(39),
  action: z.enum(['mortgage', 'unmortgage']),
})

import { normalizeTradePropertyList } from '@/lib/monopoly-trade-messages'

const monopolyTradePropertyListSchema = z.preprocess(
  (raw) => normalizeTradePropertyList(raw),
  z.array(z.number().int().min(0).max(39))
)

export const monopolyTradeProposeSchema = monopolyActionSchema.extend({
  toPlayerId: uuidString('toPlayerId'),
  offerCash: z.number().int().min(0).default(0),
  offerProperties: monopolyTradePropertyListSchema.default([]),
  offerGetOutCards: z.number().int().min(0).max(2).default(0),
  requestCash: z.number().int().min(0).default(0),
  requestProperties: monopolyTradePropertyListSchema.default([]),
  requestGetOutCards: z.number().int().min(0).max(2).default(0),
})

export const monopolyTradeRespondSchema = monopolyActionSchema.extend({
  accept: z.boolean(),
})

export const monopolyTradeCancelSchema = monopolyActionSchema

export const monopolyTradeRepairSchema = monopolyActionSchema

export type MonopolyActionInput = z.infer<typeof monopolyActionSchema>
export type MonopolyBuyInput = z.infer<typeof monopolyBuySchema>
export type MonopolyJailInput = z.infer<typeof monopolyJailSchema>

// ---------------------------------------------------------------------------
// Yahtzee (POST /api/yahtzee/*)
// ---------------------------------------------------------------------------

export const yahtzeeRollSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const yahtzeeHoldSchema = yahtzeeRollSchema.extend({
  held: z.array(z.boolean()).length(5),
})

export const yahtzeeScoreCategoryEnum = z.enum([
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
])

export const yahtzeeScoreSchema = yahtzeeRollSchema.extend({
  category: yahtzeeScoreCategoryEnum,
})

export type YahtzeeRollInput = z.infer<typeof yahtzeeRollSchema>
export type YahtzeeHoldInput = z.infer<typeof yahtzeeHoldSchema>
export type YahtzeeScoreInput = z.infer<typeof yahtzeeScoreSchema>

// Whot (POST /api/whot/*)

const whotShapeEnum = z.enum(['circle', 'cross', 'triangle', 'square', 'star', 'whot'])

export const whotActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const whotPlaySchema = whotActionSchema.extend({
  cardId: z.string().min(1),
})

export const whotDrawSchema = whotActionSchema

export const whotChooseSchema = whotActionSchema.extend({
  shape: whotShapeEnum.optional(),
  number: z.coerce.number().int().min(1).max(14).optional(),
})

export type WhotPlayInput = z.infer<typeof whotPlaySchema>
export type WhotDrawInput = z.infer<typeof whotDrawSchema>
export type WhotChooseInput = z.infer<typeof whotChooseSchema>

// Ludo (POST /api/ludo/*)

export const ludoActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const ludoMoveSchema = ludoActionSchema.extend({
  pieceId: z.coerce.number().int().min(0).max(3),
  diceIndex: z.coerce.number().int().min(0).max(1).optional(),
})

export const ludoExpireSchema = z.object({
  gameId: gameCodeString(),
})

export type LudoMoveInput = z.infer<typeof ludoMoveSchema>

// Snake & Ladder (POST /api/snake-and-ladder/*)

export const snakeLadderActionSchema = z.object({
  gameId: gameCodeString(),
  // Authorization is by the secret resume_token (resolved to a player server-side),
  // not a client-supplied playerId. The token travels with the player across devices,
  // so cross-device resume keeps working.
  resumeToken: z.string().min(4),
})

export const snakeLadderExpireSchema = z.object({
  gameId: gameCodeString(),
})

// Tic-Tac-Toe (POST /api/tic-tac-toe/*)

export const ticTacToeMoveSchema = z.object({
  gameId: gameCodeString(),
  // Authorization is by the secret resume_token (resolved to a player server-side),
  // not a client-supplied playerId. The token travels with the player across devices,
  // so cross-device resume keeps working.
  resumeToken: z.string().min(4),
  // 0-80: sub-board = floor(cellIndex/9), cell within board = cellIndex % 9.
  cellIndex: z.coerce.number().int().min(0).max(80),
})

export const ticTacToeExpireSchema = z.object({
  gameId: gameCodeString(),
})

export type TicTacToeMoveInput = z.infer<typeof ticTacToeMoveSchema>

const chessSquare = z.string().regex(/^[a-h][1-8]$/, 'Invalid square')

export const chessMoveSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  from: chessSquare,
  to: chessSquare,
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
})

export const chessExpireSchema = z.object({
  gameId: gameCodeString(),
})

export const chessResignSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export type ChessMoveInput = z.infer<typeof chessMoveSchema>

export const describeItTeamSchema = z.object({
  gameId: gameCodeString(),
  team: z.coerce.number().int().min(1).max(4),
  // Two auth paths (route enforces exactly one):
  //  - self-pick: player authorized by their resume_token
  //  - host reassign of another player: hostToken + target playerId
  resumeToken: z.string().min(4).optional(),
  hostToken: z.string().min(1).optional(),
  playerId: uuidString('playerId').optional(),
})

export const describeItClueSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  clue: z.string().trim().min(1).max(100),
})

export const describeItGuessSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  text: z.string().trim().min(1).max(80),
})

export const describeItPlayerActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const describeItGameSchema = z.object({
  gameId: gameCodeString(),
})

export const describeItSettingsSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1),
  mode: z.enum(['team', 'individual']).optional(),
  numTeams: z.coerce.number().int().min(2).max(4).optional(),
  turnSeconds: z.coerce.number().int().optional(),
  rounds: z.coerce.number().int().optional(),
  maxPlayers: z.coerce.number().int().min(4).max(20).optional(),
  words: z.string().max(8000).optional(),
})
// Scrabble (POST /api/scrabble/*)

export const scrabbleActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const scrabblePlaySchema = scrabbleActionSchema.extend({
  tiles: z
    .array(
      z.object({
        row: z.coerce.number().int().min(0).max(14),
        col: z.coerce.number().int().min(0).max(14),
        letter: z.string().regex(/^[A-Za-zÄÖÜÑäöüñ]$/),
        isBlank: z.boolean(),
      })
    )
    .min(1)
    .max(7),
})

export const scrabbleExchangeSchema = scrabbleActionSchema.extend({
  tileIndices: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
})

export const scrabblePassSchema = scrabbleActionSchema

export const scrabbleExpireSchema = z.object({
  gameId: gameCodeString(),
})

export const scrabbleExtendTimeSchema = hostActionSchema.extend({
  extensionSeconds: z.coerce.number().int().positive(),
})

export type ScrabblePlayInput = z.infer<typeof scrabblePlaySchema>
export type ScrabbleExchangeInput = z.infer<typeof scrabbleExchangeSchema>

export const describeItAdvanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1).optional(),
})

export const describeItBalanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

const codewordsTeamEnum = z.enum(['red', 'blue'])
const codewordsRoleEnum = z.enum(['spymaster', 'operative'])

export const codewordsRoleSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  team: codewordsTeamEnum,
  role: codewordsRoleEnum,
})

export const codewordsClueSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  clueWord: sanitizedString(1, 40).refine((s) => !/\s/.test(s), 'Clue must be one word (no spaces)'),
  clueNumber: z.coerce.number().int().min(0).max(9),
})

export const codewordsGuessSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  cellIndex: z.coerce.number().int().min(0).max(24),
})

export const codewordsEndTurnSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const codewordsChatSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  text: z
    .string()
    .transform((s) => stripBidiControls(stripHtml(s.trim())))
    .pipe(z.string().min(1, 'Must be at least 1 character(s)').max(200, 'Must be at most 200 characters')),
})

// ---------------------------------------------------------------------------
// Quote (POST /api/quote)
// ---------------------------------------------------------------------------

export const createQuoteSchema = z.object({
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  gameId: gameCodeString(),
  quoteText: sanitizedString(1, 500),
  authorParticipantId: uuidString('authorParticipantId'),
})

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>

// ---------------------------------------------------------------------------
// Anime quotes (POST /api/anime-quotes)
// ---------------------------------------------------------------------------

export const fetchAnimeQuotesSchema = z.object({
  count: z.coerce.number().int().min(1).max(30),
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

export type FetchAnimeQuotesInput = z.infer<typeof fetchAnimeQuotesSchema>

// ---------------------------------------------------------------------------
// Anime quote reroll (POST /api/anime-quotes/reroll)
// ---------------------------------------------------------------------------

export const rerollAnimeQuoteSchema = z.object({
  gameId: gameCodeString(),
  quoteId: uuidString('quoteId'),
  hostToken: hostTokenString(),
})

export type RerollAnimeQuoteInput = z.infer<typeof rerollAnimeQuoteSchema>

// ---------------------------------------------------------------------------
// Hot Seat submissions (POST /api/hot-seat)
// ---------------------------------------------------------------------------

const hotSeatSubmissionTypeEnum = z.enum(['compliment', 'roast', 'observation'])

export const hotSeatSubmissionSchema = z.object({
  gameId: gameCodeString(),
  roundId: uuidString('roundId'),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  text: sanitizedString(1, 300),
  submissionType: hotSeatSubmissionTypeEnum,
})

export type HotSeatSubmissionInput = z.infer<typeof hotSeatSubmissionSchema>

// ---------------------------------------------------------------------------
// App feedback (POST /api/feedback)
// ---------------------------------------------------------------------------

// Derived from the canonical game-type list (+ 'general') so it can't drift as new
// games are added — previously this was a hand-copied list that had gone stale.
const feedbackGameTypeEnum = z.enum(['general', ...gameTypeEnum.options])

const feedbackCategoryEnum = z.enum(['bug', 'feature', 'improvement', 'other'])

export const createAppFeedbackSchema = z.object({
  gameType: feedbackGameTypeEnum,
  category: feedbackCategoryEnum,
  message: sanitizedString(10, 2000),
  pageUrl: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((s) => (s ? stripHtml(s.trim()) : null)),
})

export type CreateAppFeedbackInput = z.infer<typeof createAppFeedbackSchema>

// ---------------------------------------------------------------------------
// Product updates (admin)
// ---------------------------------------------------------------------------

const productUpdateTypeEnum = z.enum(['new', 'changed', 'upcoming'])

const optionalMonth = z
  .union([z.number().int().min(1).max(12), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value == null ? null : value))

const optionalYear = z
  .union([z.number().int().min(2000).max(2100), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value == null ? null : value))

export const createProductUpdateSchema = z.object({
  type: productUpdateTypeEnum,
  title: sanitizedString(1, 120),
  description: sanitizedString(1, 2000),
  month: optionalMonth,
  year: optionalYear,
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const updateProductUpdateSchema = createProductUpdateSchema.partial()

export type CreateProductUpdateInput = z.infer<typeof createProductUpdateSchema>
export type UpdateProductUpdateInput = z.infer<typeof updateProductUpdateSchema>

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export {
  gameTypeEnum,
  participantModeEnum,
  autoSubmitBehaviorEnum,
  pairVoteModeEnum,
  questionSourceEnum,
  wstQuoteSourceEnum,
  wyrChoiceEnum,
  participantGenderEnum,
  playerGenderEnum,
  pairFlagEnum,
  themeEnum,
  timerSecondsEnum,
  stripHtml,
}
