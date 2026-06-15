import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to prevent stored XSS. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

/** Zod transform: trim + strip HTML. */
const sanitizedString = (min: number, max: number) =>
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

const hostTokenString = () => z.string().min(1, 'hostToken is required')

const uuidString = (label: string = 'ID') => z.string().uuid(`${label} must be a valid UUID`)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const gameTypeEnum = z.enum([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
])

const participantModeEnum = z.enum(['import', 'joiners', 'voters'])
const autoSubmitBehaviorEnum = z.enum(['random', 'no_answer'])
const pairVoteModeEnum = z.enum(['any', 'one_each'])
const questionSourceEnum = z.enum(['platform', 'custom'])
const playerQuestionsOrderEnum = z.enum(['players_first', 'uploaded_first', 'mixed'])
const wstQuoteSourceEnum = z.enum(['player', 'anime', 'both'])
const wyrChoiceEnum = z.enum(['a', 'b'])
const participantGenderEnum = z.enum(['male', 'female'])
const playerGenderEnum = z.enum(['male', 'female', 'both'])
const pairFlagEnum = z.enum(['kiss', 'kill'])
const themeEnum = z.enum(['default', 'neon', 'retro', 'elegant', 'tropical'])
const participantFilterEnum = z.enum(['all', 'joined'])
const timerSecondsEnum = z.union([z.literal(15), z.literal(30), z.literal(60)])

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
  max_players: z.coerce.number().int().min(2).max(20).optional(),
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
  participant_filter: participantFilterEnum.optional(),
  gender_based: z.boolean().optional(),
  pair_vote_mode: pairVoteModeEnum.optional(),
  player_questions_enabled: z.boolean().optional(),
  player_questions_order: playerQuestionsOrderEnum.optional(),
})

export type UpdateGameInput = z.infer<typeof updateGameSchema>

// ---------------------------------------------------------------------------
// Host-only actions (start / next-round / end-round / finish-game / play-again)
// ---------------------------------------------------------------------------

export const hostActionSchema = z.object({
  hostToken: hostTokenString(),
})

export type HostActionInput = z.infer<typeof hostActionSchema>

export const playAgainSchema = hostActionSchema.extend({
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

// ---------------------------------------------------------------------------
// Players (POST /api/players)
// ---------------------------------------------------------------------------

export const createPlayerSchema = z.object({
  gameCode: gameCodeString(),
  playerName: sanitizedString(1, 50).nullish(),
  gender: playerGenderEnum.or(z.string()).nullish(),
  pollGender: participantGenderEnum.or(z.string()).nullish(),
  identityGender: participantGenderEnum.or(z.string()).nullish(),
  participantId: uuidString('participantId').nullish(),
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
})

export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>

// ---------------------------------------------------------------------------
// Players (DELETE /api/players)
// ---------------------------------------------------------------------------

export const deletePlayerSchema = z.object({
  gameCode: gameCodeString(),
  playerId: uuidString('playerId'),
  hostToken: z.string().optional(),
})

export type DeletePlayerInput = z.infer<typeof deletePlayerSchema>

// ---------------------------------------------------------------------------
// Votes (POST /api/votes)
// ---------------------------------------------------------------------------

export const createVoteSchema = z.object({
  playerId: uuidString('playerId'),
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
})

export type CreateVoteInput = z.infer<typeof createVoteSchema>

// ---------------------------------------------------------------------------
// Confessions (POST /api/confessions)
// ---------------------------------------------------------------------------

export const createConfessionSchema = z.object({
  gameId: gameCodeString(),
  roundId: uuidString('roundId').optional().nullable(),
  text: sanitizedString(1, 500),
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
// Quote (POST /api/quote)
// ---------------------------------------------------------------------------

export const createQuoteSchema = z.object({
  playerId: uuidString('playerId'),
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
  playerId: uuidString('playerId'),
  text: sanitizedString(1, 300),
  submissionType: hotSeatSubmissionTypeEnum,
})

export type HotSeatSubmissionInput = z.infer<typeof hotSeatSubmissionSchema>

// ---------------------------------------------------------------------------
// App feedback (POST /api/feedback)
// ---------------------------------------------------------------------------

const feedbackGameTypeEnum = z.enum([
  'general',
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
])

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
