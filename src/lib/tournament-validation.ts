import { z } from 'zod/v4'
import { sanitizedString, hostTokenString } from './validation'

const eliminationConfigSchema = z.object({
  mode: z.literal('lives'),
  startingLives: z.coerce.number().int().min(1).max(10),
  livesLostRule: z.literal('bottom-n'),
  eliminateCount: z.coerce.number().int().min(1).max(10),
})

export const createTournamentSchema = z.object({
  title: sanitizedString(1, 100),
  format: z.enum(['round-robin', 'head-to-head']).optional(),
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

// Games eligible for the head-to-head (1v1 bracket) format — 2-player games only.
export const H2H_ELIGIBLE_TYPES = ['chess'] as const
