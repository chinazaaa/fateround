import { z } from 'zod/v4'
import { sanitizedString, hostTokenString } from './validation'

const eliminationConfigSchema = z.object({
  mode: z.literal('lives'),
  startingLives: z.coerce.number().int().min(1).max(10),
  livesLostRule: z.literal('bottom-n'),
  eliminateCount: z.coerce.number().int().min(1).max(10),
})

// Per-round game setup for head-to-head/knockout, chosen at creation. Trivia
// knockout uses questionsPerRound + timerSeconds for each round's group game;
// Whot/Scrabble head-to-head carry their house rules / dictionary + per-turn timer
// here so every spawned room plays with the settings the host chose. Values are
// re-clamped per game type server-side, so the wide bounds here are just guards.
const gameConfigSchema = z.object({
  questionSource: z.enum(['platform', 'custom']).optional(),
  roundsCount: z.coerce.number().int().min(1).max(50).optional(),
  timerSeconds: z.coerce.number().int().min(0).max(300).optional(),
  // Whot/Scrabble max room length in seconds (0 = no limit); re-clamped per game.
  gameDurationSeconds: z.coerce.number().int().min(0).max(14400).optional(),
  // Whot house rules.
  whotPick3: z.boolean().optional(),
  whotCards: z.boolean().optional(),
  whotNumberCalls: z.boolean().optional(),
  whotPick2Stacking: z.boolean().optional(),
  // Scrabble word list.
  scrabbleDictionary: z.string().min(1).max(40).optional(),
})

export const createTournamentSchema = z.object({
  title: sanitizedString(1, 100),
  format: z.enum(['round-robin', 'head-to-head', 'knockout']).optional(),
  gameType: z.string().min(1).max(40).optional(),
  gameConfig: gameConfigSchema.optional(),
  placementPoints: z.array(z.number().int().min(0)).min(1).max(20).optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
  maxPlayers: z.coerce.number().int().min(2).max(100).optional().nullable(),
  eliminationConfig: eliminationConfigSchema.optional(),
})

export const updateTournamentSchema = z.object({
  hostToken: hostTokenString(),
  title: sanitizedString(1, 100).optional(),
  placementPoints: z.array(z.number().int().min(0)).min(1).max(20).optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
  maxPlayers: z.coerce.number().int().min(2).max(100).optional().nullable(),
  // Provided only when editing lives: an object enables/updates lives, null disables.
  // The route rejects this unless the tournament is still in 'waiting'.
  eliminationConfig: eliminationConfigSchema.nullable().optional(),
})

export const joinTournamentSchema = z.object({
  playerName: sanitizedString(1, 50),
})

// Head-to-head: host stages the next bracket round. `timerSeconds` is the shared
// per-player chess clock applied to every match in the round (0 = untimed).
export const startTournamentRoundSchema = z.object({
  hostToken: hostTokenString(),
  timerSeconds: z.coerce.number().int().min(0).max(3600).optional(),
})

export const tournamentHostActionSchema = z.object({
  hostToken: hostTokenString(),
})

// Host removes a player from a tournament (e.g. a no-show blocking a match).
export const removeTournamentPlayerSchema = z.object({
  hostToken: hostTokenString(),
  playerId: z.string().uuid(),
})

export const addTournamentGameSchema = z.object({
  hostToken: hostTokenString(),
  gameType: z.string().min(1),
  gameSettings: z
    .object({
      rounds_count: z.coerce.number().int().min(1).max(100).optional(),
      timer_seconds: z.coerce.number().optional(),
    })
    .optional(),
  questionSource: z.enum(['platform', 'custom']).optional(),
  // Custom trivia questions uploaded by the host. Loosely typed here and
  // re-validated server-side at game start via parseStoredTriviaQuestions.
  customQuestions: z.array(z.unknown()).max(1000).optional().nullable(),
})

// Games eligible for the round-robin (all-vs-all) format.
export const TOURNAMENT_ELIGIBLE_TYPES = ['trivia'] as const

// Head-to-head eligibility + room sizes live in tournament-bracket (a dependency-
// free module) so the bracket-resolution libs can read them without importing this
// schema file — which would form an import cycle through ./validation. Re-exported
// here so the create route/page keep their existing import site.
export { H2H_ELIGIBLE_TYPES, H2H_GROUP_SIZES, h2hGroupSize, resolveGroupSize } from './tournament-bracket'

// Games eligible for the knockout (group elimination) format — group games where
// everyone plays at once and the field is cut by score each round.
export const KNOCKOUT_ELIGIBLE_TYPES = ['trivia'] as const
