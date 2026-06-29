import { z } from 'zod/v4'
import { sanitizedString, hostTokenString } from './validation'

export const createTournamentSchema = z.object({
  title: sanitizedString(1, 100),
  placementPoints: z.array(z.number().int().min(0)).min(1).max(20).optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
  eliminationConfig: z
    .object({
      mode: z.literal('lives'),
      startingLives: z.coerce.number().int().min(1).max(10),
      livesLostRule: z.literal('bottom-n'),
      eliminateCount: z.coerce.number().int().min(1).max(10),
    })
    .optional(),
})

export const updateTournamentSchema = z.object({
  hostToken: hostTokenString(),
  title: sanitizedString(1, 100).optional(),
  placementPoints: z.array(z.number().int().min(0)).min(1).max(20).optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
})

export const joinTournamentSchema = z.object({
  playerName: sanitizedString(1, 50),
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

export const TOURNAMENT_ELIGIBLE_TYPES = ['trivia'] as const
