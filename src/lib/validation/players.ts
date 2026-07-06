import { z } from 'zod'
import { MONOPOLY_TOKEN_ID_LIST } from '@/lib/monopoly-tokens'
import { sanitizedString, gameCodeString, uuidString, playerGenderEnum, participantGenderEnum } from './shared'

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
  // Private tournament identity secret (see tournament-player-token). Proves the
  // joiner really is the named tournament player, so only they can take/reclaim the seat.
  tournamentToken: z.string().trim().max(100).optional(),
  // The player's own resume_token (saved locally at join). When a device re-enters a
  // game it already holds a seat in — a reconnect, refresh, or new tab — this lets the
  // server reclaim that exact row instead of minting a new (spectator) one. Optional:
  // genuine first-time joiners have none.
  resumeToken: z.string().trim().max(100).optional(),
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
