import { z } from 'zod'
import {
  sanitizedString,
  gameCodeString,
  hostTokenString,
  uuidString,
  stripHtml,
  pairFlagEnum,
  wyrChoiceEnum,
  coercedNumber,
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

// Every Unicode default-ignorable code point (soft hyphen, zero-width spaces, bidi marks, the
// whole U+2060-U+206F block, variation selectors, Hangul fillers, tag characters, BOM ...) plus
// the remaining format characters. A hand-written range list kept missing members (U+206A).
const INVISIBLE_CHARS = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu

// https only (no javascript:/http trackers) and no userinfo (`https://user:pw@host`). An `@` in
// the path or query (`clip@2x.gif`) is legitimate, so check the parsed URL instead of the text.
function isHttpsUrlWithoutCredentials(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.username === '' && u.password === ''
  } catch {
    return false
  }
}

export const createAnonymousMessageSchema = z.object({
  gameId: gameCodeString(),
  // The SENDER's secret, not their public id. Posting used to be authorized by a bare
  // `playerId`, which anon can read off the roster — so anyone could post into an anonymous
  // room as any named player. On boards whose whole premise is "who said this", that is
  // impersonation. The route resolves the author from this token via assertPlayer.
  resumeToken: z.string().min(4),
  text: z
    .string()
    .transform((s) => {
      const cleaned = stripHtml(s.trim())
      // A message made only of zero-width / invisible format characters is empty. ZWJ inside
      // an emoji sequence still leaves visible characters behind, so those are untouched.
      return cleaned.replace(INVISIBLE_CHARS, '').trim() === '' ? '' : cleaned
    })
    .pipe(z.string().max(500))
    .default(''),
  replyToId: uuidString('replyToId').optional(),
  messageType: z.enum(['text', 'gif']).default('text'),
  // GIF messages only (the route rejects it on text); https so no javascript:/http trackers.
  mediaUrl: z
    .string()
    .url()
    .max(2000)
    .refine(isHttpsUrlWithoutCredentials, 'mediaUrl must be an https URL')
    .optional()
    .nullable(),
})

export type CreateAnonymousMessageInput = z.infer<typeof createAnonymousMessageSchema>

export const deleteAnonymousMessageSchema = z.object({
  gameId: gameCodeString(),
  messageId: uuidString('messageId'),
  hostToken: hostTokenString(),
})

export const listSecretMessagesSchema = z.object({
  gameId: gameCodeString(),
  hostToken: hostTokenString(),
})

export type DeleteAnonymousMessageInput = z.infer<typeof deleteAnonymousMessageSchema>

export const anonymousRoomBanSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  hostToken: hostTokenString(),
  durationMinutes: coercedNumber((n) => n.int().min(1).max(120)),
})

export type AnonymousRoomBanInput = z.infer<typeof anonymousRoomBanSchema>

export const anonymousRoomUnbanSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  hostToken: hostTokenString(),
})

export type AnonymousRoomUnbanInput = z.infer<typeof anonymousRoomUnbanSchema>
