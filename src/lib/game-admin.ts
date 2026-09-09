import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeGender, type ParticipantGender } from '@/lib/participants'
import { normalizeResumeToken } from '@/lib/utils'
import { touchGameActivity } from '@/lib/game-activity'
import { secretMatches } from '@/lib/secret-compare'

export type PlayerAccessOptions = {
  /**
   * Set on paths that only READ. The default is a write path, so a route added later
   * gets the liveness bump for free and only an explicitly read-only one opts out.
   */
  readOnly?: boolean
}

/**
 * Authorize a player action by its secret resume_token.
 *
 * This is the player-side authorization boundary for server-authoritative
 * writes (Option A). The caller MUST pass a service-role client: once anon
 * loses SELECT on players.resume_token, only the service role can match the
 * token. The resolved `player.id` is authoritative — routes must act on this
 * id, NOT on any client-supplied playerId (which is a public, forgeable value).
 *
 * The resume_token travels with the player across devices, so this preserves
 * cross-device resume: any device presenting the correct token is authorized.
 *
 * `games.last_activity_at` is bumped on WRITE-PATH authorization only. Liveness has
 * to mean a player ACTED: a read that bumps lets a tab left polling in a pocket keep
 * an abandoned game off the idle reaper's list forever. Read-only callers therefore
 * pass `{ readOnly: true }` — see the callers listed on the bump below.
 */
export async function assertPlayer(
  supabase: SupabaseClient,
  gameCode: string,
  resumeToken: string | null | undefined,
  opts: PlayerAccessOptions = {}
) {
  const id = gameCode.toUpperCase()
  const token = normalizeResumeToken(String(resumeToken ?? ''))
  if (token.length < 4) {
    return { error: 'Missing or invalid player code', status: 403 as const, player: null, id }
  }
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', id)
    .eq('resume_token', token)
    .maybeSingle()
  if (!player) return { error: 'Unauthorized', status: 403 as const, player: null, id }
  // A real, authorized player is WRITING to this game — that is the definition of
  // "the game is alive". This is the one chokepoint every player-facing write
  // passes through (~130 route files, every game family, including the
  // anonymous/secret message inboxes) except mahjong, which authorizes through
  // `verifyMahjongPlayerAccess` in src/lib/mahjong-auth.ts and bumps there the same
  // way. None of those routes otherwise write the `games` row, so without this bump
  // a board game an hour into play looks idle to the reaper — which ENDS games.
  //
  // Read paths (`opts.readOnly`) deliberately do NOT bump: polling must not be able to
  // fake liveness and keep an abandoned game alive indefinitely. The read-only callers
  // are /api/mafia/[code]/state, /api/wordle-room/status, /api/two-truths/my-guesses
  // and /api/two-truths/my-statement — all POST-shaped reads (POST only so the resume
  // token stays out of query strings). Every other caller acts on the game.
  //
  // Fire-and-forget and throttled to one write per game per
  // ACTIVITY_THROTTLE_MINUTES — see src/lib/game-activity.ts.
  if (!opts.readOnly) touchGameActivity(supabase, id)
  return { error: null, status: 200 as const, player, id }
}

export type HostAccessOptions = {
  /** Statuses the game may be in. Omit the option entirely (see `assertHostAny`) to skip the gate. */
  allowedStatuses: readonly string[]
  /** 400 body returned when the status gate rejects. */
  statusError: string
}

/**
 * Shared host-authorization check: loads the game, verifies the host token, and — when a
 * status gate is supplied — enforces that the game's status is one of `allowedStatuses`.
 *
 * The failure ladder is ordered on purpose and must stay that way: missing game (404) beats
 * bad token (403) beats bad status (400). A route that reordered it would tell an
 * unauthenticated caller which codes exist and what state they're in.
 *
 * Pass `opts: null` to run the 404/403 ladder with NO status gate — some ~43 routes accept a
 * host action in any state, and could not express that through the fixed-status wrappers.
 */
async function assertHost(
  supabase: SupabaseClient,
  gameCode: string,
  hostToken: string | null | undefined,
  opts: HostAccessOptions | null
) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  // Constant-time, like every other secret comparison in the app (src/lib/secret-compare.ts).
  // `games.host_token` is `text not null` (migration 0001, never relaxed) and all four insert
  // sites mint a token, so the one behaviour `secretMatches` changes versus `!==` — an empty
  // supplied token matching a NULL stored one — is unreachable here, and is a bug if it ever
  // becomes reachable.
  if (!(await secretMatches(hostToken, game.host_token))) {
    return { error: 'Unauthorized', status: 403 as const, game: null, id }
  }
  if (opts && !opts.allowedStatuses.includes(game.status)) {
    return { error: opts.statusError, status: 400 as const, game: null, id }
  }
  return { error: null, status: 200 as const, game, id }
}

/**
 * Host authorization with a caller-supplied status gate — the general form of the fixed-status
 * wrappers below, for routes whose allowed statuses or 400 message are their own.
 */
export async function assertHostWith(
  supabase: SupabaseClient,
  gameCode: string,
  hostToken: string | null | undefined,
  opts: HostAccessOptions
) {
  return assertHost(supabase, gameCode, hostToken, opts)
}

/**
 * Host authorization with NO status gate: the 404/403 ladder only, succeeding whatever state
 * the game is in. For host actions that are valid at any point in a game's life.
 */
export async function assertHostAny(supabase: SupabaseClient, gameCode: string, hostToken: string | null | undefined) {
  return assertHost(supabase, gameCode, hostToken, null)
}

export async function assertHostGame(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  return assertHost(supabase, gameCode, hostToken, {
    allowedStatuses: ['waiting'],
    statusError: 'Game has already started',
  })
}

/** Host may remove a player while the lobby is open or the game is in progress. */
export async function assertHostPlayerRemove(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  return assertHost(supabase, gameCode, hostToken, {
    allowedStatuses: ['waiting', 'active'],
    statusError: 'Players can only be removed while the lobby or game is open',
  })
}

/** Host may tweak lobby/finished settings before the next game starts. */
export async function assertHostGameSettings(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  return assertHost(supabase, gameCode, hostToken, {
    allowedStatuses: ['waiting', 'finished'],
    statusError: 'Settings can only be changed in the lobby or after the game ends',
  })
}

/** Host may act on a game that hasn't opened yet — reschedule / cancel / transfer
 *  a scheduled game. Distinct from lobby-settings so those don't accidentally
 *  let a host mutate lobby knobs before opening. */
export async function assertHostScheduledGame(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  return assertHost(supabase, gameCode, hostToken, {
    allowedStatuses: ['scheduled'],
    statusError: 'This is only available on scheduled games.',
  })
}

/** Host may change who can join after start — including while a game is live. */
export async function assertHostLateJoinSettings(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  return assertHost(supabase, gameCode, hostToken, {
    allowedStatuses: ['waiting', 'active', 'finished'],
    statusError: 'Late join settings cannot be changed for this game',
  })
}

/** Host may hand off control (nominate a successor) any time the game exists. */
export async function assertHostTransfer(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  return assertHost(supabase, gameCode, hostToken, {
    allowedStatuses: ['waiting', 'active', 'finished'],
    statusError: 'Host cannot be transferred for this game',
  })
}

export async function findJoinerParticipant(supabase: SupabaseClient, gameId: string, playerName: string) {
  const { data } = await supabase
    .from('participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('name', playerName)
    .maybeSingle()
  return data
}

export async function deleteJoinerPair(
  supabase: SupabaseClient,
  gameId: string,
  player: { id: string; name: string }
): Promise<{ error: string | null }> {
  // Surface either failure instead of swallowing it — otherwise the caller reports
  // success while a row lingers, and the player reappears on the next reload.
  // Delete the participant first (a player row may FK-reference it); bail before
  // touching players if it fails, so we don't half-remove the pair.
  const { error: participantError } = await supabase
    .from('participants')
    .delete()
    .eq('game_id', gameId)
    .eq('name', player.name)
  if (participantError) return { error: participantError.message }
  const { error } = await supabase.from('players').delete().eq('id', player.id)
  if (error) return { error: error.message }
  return { error: null }
}

export function pollGenderForPlayer(
  voteGender: 'male' | 'female' | 'both',
  rawPollGender: string | undefined,
  fallback: ParticipantGender,
  identityGender?: ParticipantGender | null
): ParticipantGender | null {
  if (voteGender === 'both') {
    return normalizeGender(String(rawPollGender ?? '')) ?? identityGender ?? fallback
  }
  return voteGender
}

/** Which poll (men's/women's rounds) a claimed import-list name appears in. */
export function importBallotGender(
  voteGender: 'male' | 'female' | 'both',
  identityGender: ParticipantGender,
  rawPollGender?: string
): ParticipantGender {
  if (voteGender === 'both') {
    return normalizeGender(String(rawPollGender ?? '')) ?? identityGender
  }
  return identityGender
}

export async function syncImportParticipantBallot(
  supabase: SupabaseClient,
  gameId: string,
  participantId: string,
  voteGender: 'male' | 'female' | 'both',
  identityGender: ParticipantGender,
  rawPollGender?: string
) {
  const gender = importBallotGender(voteGender, identityGender, rawPollGender)
  await supabase.from('participants').update({ gender }).eq('id', participantId).eq('game_id', gameId)
}
