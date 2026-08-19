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
  // `.nullish()`, not `.optional()`: a caller that sends an explicitly null token means
  // "none chosen", and the handler already answers that with "Pick a player token to join".
  // Under `.optional()` the null died in the schema instead and the player was shown the raw
  // enum list — a validator dump reading "expected one of car|hat|dog…" as if they had typed
  // something wrong.
  monopolyToken: z.enum(MONOPOLY_TOKEN_ID_LIST as [string, ...string[]]).nullish(),
  roomMemberCode: z.string().trim().toUpperCase().max(12).optional(),
  // Private tournament identity secret (see tournament-player-token). Proves the
  // joiner really is the named tournament player, so only they can take/reclaim the seat.
  tournamentToken: z.string().trim().max(100).optional(),
  // The player's own resume_token (saved locally at join). When a device re-enters a
  // game it already holds a seat in — a reconnect, refresh, or new tab — this lets the
  // server reclaim that exact row instead of minting a new (spectator) one. Optional:
  // genuine first-time joiners have none.
  resumeToken: z.string().trim().max(100).optional(),
  // Cross-device continuation override: set true after the client has confirmed
  // the "You're already hosting/playing on another device — continue here?"
  // prompt. Without it Zod would strip the field and the server would keep
  // returning the 409 forever.
  continueOnThisDevice: z.boolean().optional(),
  // The host's own host_token from this device's SecureStore. Proves the caller
  // is the host device (not another device on the same profile), so the server
  // skips the "already hosting elsewhere" 409 — a host playing along in their
  // own lobby must never be treated as a cross-device conflict.
  hostToken: z.string().trim().max(100).optional(),
})

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>

// ---------------------------------------------------------------------------
// Players (PATCH /api/players)
// ---------------------------------------------------------------------------

export const updatePlayerSchema = z.object({
  gameCode: gameCodeString(),
  playerId: uuidString('playerId'),
  playerName: sanitizedString(1, 50).optional(),
  // Monopoly: swap your board token from the lobby before the game starts.
  monopolyToken: z.enum(MONOPOLY_TOKEN_ID_LIST as [string, ...string[]]).optional(),
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
// Players (POST /api/players/spectate) — the inverse of promote
// ---------------------------------------------------------------------------

export const spectatePlayerSchema = z.object({
  gameCode: gameCodeString(),
  // Self-sit-out (player → spectator), mid-active-game. Same shape as promote: the caller is
  // resolved from their own resume_token, so a caller can only ever sit *themselves* out. Used
  // by "Leave game (keep hosting)" — a seated host drops out of play but keeps the host token.
  resumeToken: z.string().min(4),
})

export type SpectatePlayerInput = z.infer<typeof spectatePlayerSchema>
