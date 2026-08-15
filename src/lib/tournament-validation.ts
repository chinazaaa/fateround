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
  timerSeconds: z.coerce.number().int().min(0).max(3600).optional(),
  // Whot/Scrabble max room length in seconds (0 = no limit); re-clamped per game.
  gameDurationSeconds: z.coerce.number().int().min(0).max(14400).optional(),
  // Whot house rules.
  whotPick3: z.boolean().optional(),
  whotCards: z.boolean().optional(),
  whotNumberCalls: z.boolean().optional(),
  whotPick2Stacking: z.boolean().optional(),
  // Scrabble word list.
  scrabbleDictionary: z.string().min(1).max(40).optional(),
  // Scrabble timing: 'standard' per-turn timer vs 'chess' per-player bank (+ bank size).
  scrabbleClockMode: z.enum(['standard', 'chess']).optional(),
  scrabbleClockSeconds: z.coerce.number().int().min(0).max(3600).optional(),
  // School format: ladder length (number of classes). Re-clamped server-side.
  schoolClassCount: z.coerce.number().int().min(2).max(16).optional(),
})

// One entry in a round-robin tournament's pre-planned playlist. Each entry
// becomes one spawned game, in order. Wide bounds here — the values are
// re-clamped per game type server-side when the game row is inserted.
export const tournamentQueueEntrySchema = z.object({
  gameType: z.string().min(1).max(40),
  roundsCount: z.coerce.number().int().min(1).max(100).optional(),
  timerSeconds: z.coerce.number().int().min(1).max(600).optional(),
  bigScreenMode: z.enum(['phone_only', 'projector']).optional(),
})

// Event branding: two brand colours (validated against #rrggbb) + optional
// logo URL. The logo is uploaded via a separate route and its URL captured
// here; the create/update JSON body doesn't accept arbitrary URLs — only the
// one the upload route just produced.
const hexColorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
export const tournamentBrandingSchema = z.object({
  primaryColor: z.string().regex(hexColorRegex, 'Colour must be a hex value like #ff5c00').nullable().optional(),
  accentColor: z.string().regex(hexColorRegex, 'Colour must be a hex value like #ff5c00').nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
})

export const createTournamentSchema = z.object({
  title: sanitizedString(1, 100),
  format: z.enum(['round-robin', 'head-to-head', 'knockout', 'school']).optional(),
  gameType: z.string().min(1).max(40).optional(),
  gameConfig: gameConfigSchema.optional(),
  placementPoints: z.array(z.number().int().min(0)).min(1).max(20).optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
  maxPlayers: z.coerce.number().int().min(2).max(100).optional().nullable(),
  eliminationConfig: eliminationConfigSchema.optional(),
  // Round-robin only: a pre-planned ordered list of games. When present the
  // detail page's "Start Next Game" spawns each entry in turn instead of
  // asking the host to pick live. Omitted/empty = freestyle (today's flow).
  gameQueue: z.array(tournamentQueueEntrySchema).min(1).max(20).optional(),
  // Optional shared trivia pack (CSV upload or AI-generated) used by every
  // planned Trivia round in this tournament. Loose type here — the route
  // re-validates via parseStoredTriviaQuestions before storing so a malformed
  // upload can't reach the DB.
  customTriviaPack: z.array(z.unknown()).max(500).optional(),
  // Event branding — two colours + a logo URL previously produced by the
  // per-tournament logo-upload route. Every field optional; null/absent = use
  // the app's default palette.
  branding: tournamentBrandingSchema.optional(),
  // Optional scheduled start time (ISO 8601). Display + reminder only — the
  // host still starts the event manually on the day. Pass null to clear.
  scheduledAt: z.string().datetime().nullable().optional(),
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
  // Edited game setup (house rules, dictionary, timers, ladder). The route rejects
  // it unless the tournament is still 'waiting', so an in-progress room is untouched.
  gameConfig: gameConfigSchema.optional(),
  // Reorder / extend the round-robin playlist mid-tournament. The route enforces
  // that the first N entries of the new queue match the current queue's first N
  // (where N = number of already-spawned games), so already-played rounds can't
  // be rewritten. Only the still-upcoming tail can change. Not accepted while a
  // round is live (a game is in progress).
  gameQueue: z.array(tournamentQueueEntrySchema).min(1).max(20).optional(),
  // Event branding — hosts can update at any time (colours + previously
  // uploaded logo URL). The logo itself is uploaded via the separate
  // /branding/logo route, not through this PATCH body.
  branding: tournamentBrandingSchema.optional(),
  // Update or clear the scheduled start time. Pass null to remove.
  scheduledAt: z.string().datetime().nullable().optional(),
})

export const joinTournamentSchema = z.object({
  playerName: sanitizedString(1, 50),
})

// Head-to-head: host stages the next bracket round. `timerSeconds` is the shared
// per-player chess clock applied to every match in the round (0 = untimed).
// Knockout trivia additionally accepts a per-round question pack: `questionSource`
// picks built-in vs custom, and `customQuestions` carries the CSV the host uploaded
// for this specific round (re-validated server-side via parseStoredTriviaQuestions).
// This lets the host ramp difficulty round to round; omitting a new pack reuses the
// previous round's. Ignored by head-to-head/school rounds.
export const startTournamentRoundSchema = z.object({
  hostToken: hostTokenString(),
  timerSeconds: z.coerce.number().int().min(0).max(3600).optional(),
  questionSource: z.enum(['platform', 'custom']).optional(),
  customQuestions: z.array(z.unknown()).max(1000).optional().nullable(),
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
  // Freestyle-mode display mode (planned mode pulls this from the queue entry).
  bigScreenMode: z.enum(['phone_only', 'projector']).optional(),
})

// Games eligible for the round-robin (all-vs-all) format — the host picks a game
// per round, so a tournament can mix rounds of different games and share one
// leaderboard. Restricted to "everyone in one lobby" games that produce
// placements via awardTournamentPlacements.
export const TOURNAMENT_ELIGIBLE_TYPES = ['trivia', 'i_call_on', 'two_truths', 'who_said_this'] as const

// Head-to-head eligibility + room sizes live in tournament-bracket (a dependency-
// free module) so the bracket-resolution libs can read them without importing this
// schema file — which would form an import cycle through ./validation. Re-exported
// here so the create route/page keep their existing import site.
export { H2H_ELIGIBLE_TYPES, H2H_GROUP_SIZES, h2hGroupSize, resolveGroupSize } from './tournament-bracket'

// Games eligible for the knockout (group elimination) format — the field is cut
// by score each round. Trivia seats the whole field in one game; Scrabble plays in
// rooms of up to 4 but everyone is ranked together by score, so it doesn't matter
// which room a player was in — the bottom half of the whole field is knocked out.
export const KNOCKOUT_ELIGIBLE_TYPES = ['trivia', 'scrabble'] as const

// Games eligible for the school (class-ladder) format. School Whot is the classic
// — a 1-v-1 Whot match each round where the winner climbs a class. Other 1-v-1
// games can be added here later.
export const SCHOOL_ELIGIBLE_TYPES = ['whot'] as const
