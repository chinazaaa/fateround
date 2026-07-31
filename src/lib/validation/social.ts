import { z } from 'zod'
import {
  sanitizedString,
  gameCodeString,
  hostTokenString,
  uuidString,
  stripHtml,
  optionalUrlOrPath,
  pairFlagEnum,
  wyrChoiceEnum,
} from './shared'

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
  // Poster identity is resolved server-side from the secret resume_token (see
  // assertPlayer), NOT from a client-supplied playerId — a public, forgeable
  // value that let a muted/banned user post as any other roster member.
  resumeToken: z.string().min(4),
  text: z
    .string()
    .transform((s) => stripHtml(s.trim()))
    .pipe(z.string().max(500))
    .default(''),
  replyToId: uuidString('replyToId').optional(),
  messageType: z.enum(['text', 'gif']).default('text'),
  // Rendered as <img src>, so restrict to http(s) URLs or root-relative paths —
  // z.string().url() also allowed data:/blob: and arbitrary off-origin beacons.
  mediaUrl: optionalUrlOrPath(2000).nullable(),
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
