import { z } from 'zod'
import { sanitizedString, gameCodeString, hostTokenString, uuidString, stripHtml, stripBidiControls } from './shared'

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

const quiplashAnswerText = sanitizedString(1, 120)

export const quiplashAnswerSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
  roundId: uuidString('roundId'),
  text: quiplashAnswerText,
})

export type QuiplashAnswerInput = z.infer<typeof quiplashAnswerSchema>

export const quiplashVoteSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
  battleId: uuidString('battleId'),
  chosenAnswerId: uuidString('chosenAnswerId'),
})

export type QuiplashVoteInput = z.infer<typeof quiplashVoteSchema>

export const quiplashAdvanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1).optional(),
  force: z.boolean().optional(),
})

export type QuiplashAdvanceInput = z.infer<typeof quiplashAdvanceSchema>

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

export const describeItAdvanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1).optional(),
})

export const describeItBalanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

export const wordRushBalanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

export const wordRushShuffleSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

export const wordRushSubmitSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
  text: z.string().trim().min(1).max(80),
})

export const wordRushPromptSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
  startLetter: z.string().trim().min(1).max(1),
  endLetter: z.string().trim().min(1).max(1),
})

export const wordRushTeamSchema = z.object({
  gameId: gameCodeString(),
  team: z.coerce.number().int().min(1).max(4),
  resumeToken: z.string().min(4).optional(),
  hostToken: z.string().min(1).optional(),
  playerId: uuidString('playerId').optional(),
})

export const wordRushGameSchema = z.object({
  gameId: gameCodeString(),
})

export const wordRushEndRoundSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

export const wordRushAdvanceSchema = z.object({
  gameId: gameCodeString(),
  hostToken: z.string().min(1).optional(),
})

export const wordRushSettingsSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
  mode: z.enum(['team', 'individual']).optional(),
  promptMode: z.enum(['automatic', 'manual']).optional(),
  numTeams: z.coerce.number().int().min(2).max(4).optional(),
  turnSeconds: z.coerce.number().int().optional(),
  rounds: z.coerce.number().int().optional(),
  maxPlayers: z.coerce.number().int().min(2).max(20).optional(),
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
