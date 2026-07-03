import { z } from 'zod'
import { sanitizedString, gameCodeString, hostTokenString, uuidString } from './shared'

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
