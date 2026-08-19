/**
 * The award pass (`docs/trophies-and-streaks.md` §3.8).
 *
 * Runs once per (profile, finished game): updates that profile's counters and streak, then
 * evaluates the catalog and records anything newly earned.
 *
 * ── WHERE IT RUNS, AND WHY NOT WHERE THE SPEC SAID ──────────────────────────────────────
 * The spec proposed hooking the finish route. That doesn't work here. `players.profile_id` is
 * written by `/api/profile/attribute`, which the player's own client calls when it sees the
 * finished screen — normally *after* the game was marked finished. An award pass at finish
 * would find `profile_id IS NULL` on every player and award nothing. So it runs at
 * attribution, the moment both facts are known: this profile, this finished game.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────────────────
 * Nothing here is ever told what to award. Every number is read from tables the server owns:
 * the game row, the player row, and the persisted winner. The caller supplies only *which*
 * game, and even that is proven by a resume token before we get here. A client that can
 * influence its own payout is the failure this whole feature is shaped around.
 *
 * ── FAILURE POSTURE ─────────────────────────────────────────────────────────────────────
 * Fail-closed on the claim (never award twice), fail-open on the outcome (an unreadable
 * winner costs a counter, never the whole pass). Errors are returned, never thrown: this runs
 * behind a request the player already succeeded at, and a trophy that didn't land must not
 * turn their finished game into an error.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { GLOBAL_SCOPE, evaluateRaw, type PlatinumContext, type ProgressSnapshot } from './criteria'
import { unlockedThisRound } from './instant-unlock'
import { buildGameFacts } from './game-facts'
import { resolveFinishers, resolveWinners } from './outcome'
import { advanceStreak, watDate, watHour, type StreakState } from './streak'

/** Trophy points needed for each level. Deliberately shallow early so level 2 is reachable. */
const LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1200, 2000, 3200, 5000, 8000]

/** Rooms of this size or larger count toward `big_room_games`. */
/**
 * A win needs someone to beat. Solo-capable games (Yahtzee, Sudoku) still record a winner in
 * their session row, and counting that as a win would make every win-based trophy earnable
 * without another player in the room.
 */
const MIN_PLAYERS_FOR_A_WIN = 2

const BIG_ROOM_PLAYERS = 8

export type AwardedTrophy = { id: string; title: string; tier: string; points: number }

export type AwardResult = {
  /** Trophies earned by THIS pass — what the post-win prompt should celebrate. */
  earned: AwardedTrophy[]
  /** False when the pass was a no-op: already awarded, unknown game, or nothing to do. */
  applied: boolean
  reason?: 'already_awarded' | 'game_not_found' | 'never_started' | 'not_a_player' | 'error'
}

const NOOP = (reason: AwardResult['reason']): AwardResult => ({ earned: [], applied: false, reason })

/** Level from cached points. Pure so the UI and the engine can never disagree. */
export function levelForPoints(points: number): number {
  const safe = Number.isFinite(points) && points > 0 ? points : 0
  let level = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) if (safe >= LEVEL_THRESHOLDS[i]) level = i + 1
  return level
}

/** Read the profile's counters into the shape the evaluator understands. */
export async function buildSnapshot(supabase: SupabaseClient, profileId: string): Promise<ProgressSnapshot> {
  const [{ data: stats }, { data: distinct }] = await Promise.all([
    supabase.from('player_stats').select('game_type, games_played, games_won, counters').eq('profile_id', profileId),
    supabase.from('player_distinct').select('key').eq('profile_id', profileId),
  ])

  const counters: ProgressSnapshot['counters'] = {}
  for (const row of stats ?? []) {
    const scope = (row.game_type as string) || GLOBAL_SCOPE
    const extra = (row.counters ?? {}) as Record<string, unknown>
    const bucket: Record<string, number> = {
      games_played: Number(row.games_played) || 0,
      games_won: Number(row.games_won) || 0,
    }
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = value
    }
    counters[scope] = bucket
  }

  // `player_distinct` stores one row per member, so the SIZE of each set is a count of rows —
  // which is why sets live there rather than as an array on player_stats.
  const distinctCounts: Record<string, number> = {}
  for (const row of distinct ?? []) {
    const key = row.key as string
    distinctCounts[key] = (distinctCounts[key] ?? 0) + 1
  }

  return { counters, distinct: distinctCounts }
}

/**
 * Pull reserved `distinct:<setKey>:<member>` entries out of a facts bag, MUTATING it to remove
 * them, and return the (setKey, member) pairs they name.
 *
 * The convention lets a facts builder — which can only return summable counters — contribute to a
 * distinct set instead ("won as the jester"). The value is ignored (membership is binary; the PK
 * dedupes), so the entry is deleted from `extras` and never reaches `bump_player_stats` as a bogus
 * counter. Malformed keys (missing a member segment) are dropped silently: this runs at finish and
 * must never throw. `member` may itself contain colons; only the first two segments are structural.
 */
export function extractDistinctMembers(extras: Record<string, number>): { key: string; member: string }[] {
  const out: { key: string; member: string }[] = []
  for (const rawKey of Object.keys(extras)) {
    if (!rawKey.startsWith('distinct:')) continue
    delete extras[rawKey]
    const rest = rawKey.slice('distinct:'.length)
    const sep = rest.indexOf(':')
    if (sep <= 0 || sep >= rest.length - 1) continue
    out.push({ key: rest.slice(0, sep), member: rest.slice(sep + 1) })
  }
  return out
}

/**
 * Add to one scope's counters, atomically.
 *
 * The arithmetic happens in Postgres because it has to. Reading a row, adding a delta in
 * TypeScript and writing the absolute result loses one of two concurrent updates — and
 * `awarded_sessions` only serializes one (profile, game) pair, so two DIFFERENT games finishing
 * at once both write the same `__global__` row and one game silently vanishes.
 */
async function bumpStats(
  supabase: SupabaseClient,
  profileId: string,
  scope: string,
  deltas: { played?: number; won?: number; counters?: Record<string, number> }
): Promise<void> {
  await supabase.rpc('bump_player_stats', {
    p_profile_id: profileId,
    p_game_type: scope,
    p_played: deltas.played ?? 0,
    p_won: deltas.won ?? 0,
    p_counters: deltas.counters ?? {},
  })
}

/**
 * The idempotency key for one ROUND, not one room.
 *
 * "Play again" UPDATES the same `games` row — same id, status back to `waiting` — so a room
 * plays many rounds under one code. Keying the claim on the code alone meant round one claimed
 * it and every round after hit the conflict and awarded NOTHING: no trophies, no `games_played`,
 * no streak day. A room that played all evening recorded a single game.
 *
 * `finished_at` is what separates rounds. It is rewritten at each finish and stable within a
 * round, so retried attributions for the same round still collapse to one award — which is the
 * entire point of the claim.
 *
 * Falls back to the bare code when `finished_at` is missing: awarding once is a better failure
 * than awarding on every retry.
 */
function roundKey(gameId: string, finishedAt: string | null): string {
  return finishedAt ? `${gameId}#${new Date(finishedAt).toISOString()}` : gameId
}

/**
 * Award for one profile and one finished round. Idempotent per (profile, round).
 */
export async function awardForFinishedGame(
  supabase: SupabaseClient,
  profileId: string,
  gameId: string
): Promise<AwardResult> {
  const sessionId = gameId.toUpperCase()

  // The claim key needs `finished_at`, so it is read before claiming. A plain select with no
  // side effects — the claim is still taken before anything is counted.
  const { data: round } = await supabase.from('games').select('finished_at').eq('id', sessionId).maybeSingle()
  const claimKey = roundKey(sessionId, (round?.finished_at as string) ?? null)

  // ── Claim first ─────────────────────────────────────────────────────────────────────────
  // The PK on (profile_id, session_id) is the lock. Claiming BEFORE doing the work means two
  // concurrent calls can't both award; the loser sees a conflict and stops. The cost is that a
  // crash mid-pass would strand the claim, so the claim is released on any failure below.
  const { error: claimError } = await supabase
    .from('awarded_sessions')
    .insert({ profile_id: profileId, session_id: claimKey })
  if (claimError) return NOOP('already_awarded')

  const releaseClaim = async () => {
    await supabase.from('awarded_sessions').delete().eq('profile_id', profileId).eq('session_id', claimKey)
  }

  try {
    const { data: game } = await supabase
      .from('games')
      // timer_seconds / question_source are read for the per-game facts builders (Trivia uses
      // both). Cheap to carry here; a second round-trip per finish would not be.
      .select(
        'id, game_type, status, max_players, finished_at, session_started_at, timer_seconds, question_source, theme'
      )
      .eq('id', sessionId)
      .maybeSingle()
    if (!game || game.status !== 'finished') {
      await releaseClaim()
      return NOOP('game_not_found')
    }
    if (!game.session_started_at) {
      await releaseClaim()
      return NOOP('never_started')
    }

    const gameType = game.game_type as GameType
    const { data: players } = await supabase
      .from('players')
      .select('id, profile_id, spectator')
      .eq('game_id', sessionId)
    // The shed-your-hand card games flag a player who WENT OUT as a spectator, winner included.
    // Those players played; only a true watcher never did. `finish_order` is who actually
    // finished, so a spectator counts as a participant if they are in it.
    const finishers = new Set(await resolveFinishers(supabase, sessionId, gameType))
    const isParticipant = (p: { id: string; spectator?: boolean | null }) => !p.spectator || finishers.has(p.id)

    const me = players?.find((p) => p.profile_id === profileId)
    // Pure spectators don't earn — no game they played. A finisher (spectator flag set because
    // they went out) is NOT a pure spectator, and must not be dropped or the winner earns nothing.
    if (!me || !isParticipant(me)) {
      await releaseClaim()
      return NOOP('not_a_player')
    }

    const seated = (players ?? []).filter(isParticipant)
    // `null` means the server cannot determine a winner for this game type — which must not be
    // recorded as a loss. Only a definite result moves `games_won`.
    const winners = await resolveWinners(supabase, sessionId, gameType)
    // A game you were the only player in is not a game you WON. Yahtzee and Sudoku allow solo
    // play and still write `winner_player_id`, so without this the whole win vocabulary —
    // `games_won`, every Champion track, every "win N games" rule — is farmable by playing
    // alone against nobody. `games_played` still counts: you did play it.
    const won = seated.length >= MIN_PLAYERS_FOR_A_WIN && winners !== null && winners.includes(me.id)

    const finishedAt = game.finished_at ? new Date(game.finished_at as string) : new Date()
    const extras: Record<string, number> = {}
    if (seated.length >= BIG_ROOM_PLAYERS) extras.big_room_games = 1
    if (watHour(finishedAt) < 5) extras.late_night_games = 1

    // Per-game facts. Merged UNDER nothing — the shared extras above are platform-level and a
    // game builder must not be able to overwrite them, so game facts are namespaced by game
    // type and collisions are impossible by naming.
    //
    // PREFER THE SNAPSHOT taken at finish (`round_facts`). Deriving here would read the game's
    // own tables, which play-again may already have cleared — that is the whole reason the
    // snapshot exists. The live path stays as a fallback for rounds that finished before the
    // snapshot shipped, so nothing needs backfilling; those simply behave as they did before.
    const { data: factsRow } = await supabase
      .from('round_facts')
      .select('facts')
      .eq('game_id', sessionId)
      .eq('player_id', me.id)
      .eq('finished_at', game.finished_at as string)
      .maybeSingle()

    if (factsRow?.facts) {
      Object.assign(extras, factsRow.facts as Record<string, number>)
    } else {
      const live = await buildGameFacts(supabase, gameType, sessionId, {
        timerSeconds: (game.timer_seconds as number) ?? null,
        questionSource: (game.question_source as string) ?? null,
        theme: (game.theme as string) ?? null,
        seated: seated.map((p) => p.id as string),
        winners: winners ?? [],
      })
      Object.assign(extras, live.get(me.id) ?? {})
    }

    // A facts builder can also contribute to a DISTINCT SET — a measure of variety no summable
    // counter can express ("won as N different roles"). It does so with a reserved key shape,
    // `distinct:<setKey>:<member>`, carried through the same `extras` bag (and therefore through
    // `round_facts` too). Split those out here: they belong in `player_distinct`, not in the
    // numeric counters, so pull them from `extras` before it reaches `bump_player_stats`.
    const distinctMembers = extractDistinctMembers(extras)

    // Per-game-type and global scopes both move, so a rule can ask "10 wins" or "10 Whot wins".
    await bumpStats(supabase, profileId, gameType, { played: 1, won: won ? 1 : 0, counters: extras })
    await bumpStats(supabase, profileId, GLOBAL_SCOPE, { played: 1, won: won ? 1 : 0, counters: extras })

    // Distinct sets: the PK does the deduping, so a repeat insert is a harmless conflict.
    const distinctRows = [
      { profile_id: profileId, key: 'modes_played', member: gameType },
      ...distinctMembers.map(({ key, member }) => ({ profile_id: profileId, key, member })),
    ]
    await supabase.from('player_distinct').upsert(distinctRows, { onConflict: 'profile_id,key,member' })

    // ── Streak ────────────────────────────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, last_active_date, trophy_points')
      .eq('id', profileId)
      .maybeSingle()

    const streak = advanceStreak(
      {
        current_streak: Number(profile?.current_streak) || 0,
        longest_streak: Number(profile?.longest_streak) || 0,
        last_active_date: (profile?.last_active_date as string) ?? null,
      } satisfies StreakState,
      watDate(finishedAt)
    )
    // `days_played` only moves when the calendar day actually changed, so several games in one
    // evening count as one day — the same reason advanceStreak is idempotent per day.
    if (streak.last_active_date !== (profile?.last_active_date ?? null)) {
      await bumpStats(supabase, profileId, GLOBAL_SCOPE, { counters: { days_played: 1 } })
    }

    // ── Evaluate the catalog ──────────────────────────────────────────────────────────────
    const snapshot = await buildSnapshot(supabase, profileId)
    // `longest_streak` lives on `profiles`, not in `player_stats`, so it is injected rather
    // than read — otherwise a streak rule could never be satisfied.
    snapshot.counters[GLOBAL_SCOPE] = {
      ...(snapshot.counters[GLOBAL_SCOPE] ?? {}),
      longest_streak: streak.longest_streak,
    }

    // Trophies unlocked mid-round were recorded against the PLAYER, because no profile existed
    // at the time. Fold them in now that we know whose they are. They are granted DIRECTLY, not
    // re-derived: the moment already happened and was verified server-side by the handler that
    // saw it — re-checking it against finish-time counters would silently drop anything the
    // counters can't express, which is the whole reason instant unlocks exist.
    const instant = await unlockedThisRound(supabase, sessionId, me.id)
    const earned = await grantEligible(supabase, profileId, snapshot, instant)

    await supabase
      .from('profiles')
      .update({
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
        last_active_date: streak.last_active_date,
      })
      .eq('id', profileId)

    // Points and level are DERIVED from what the profile holds, not accumulated — so two
    // concurrent passes reach the same total instead of one overwriting the other.
    await supabase.rpc('recompute_profile_points', { p_profile_id: profileId })

    return { earned, applied: true }
  } catch {
    // Release the claim so a later attempt can retry. Leaving it would silently cost the
    // player everything this game should have earned, with no error anywhere.
    await releaseClaim().catch(() => {})
    return NOOP('error')
  }
}

/**
 * Award for one profile and one finished SOLO (vs bot) game. Idempotent per
 * (profile, solo session id).
 *
 * Separate from `awardForFinishedGame` because a solo game has no `games` row, no
 * `players` row, no per-game-fact tables and no winner attribution to read — the outcome
 * comes straight from the client. We reuse the same counter buckets (`player_stats`,
 * `player_distinct`, `profiles`), the same claim table (`awarded_sessions`, prefixed
 * `solo:` so it cannot collide with a real game code), and the same downstream trophy
 * evaluator, so trophies keyed on `games_played` / `games_won` / `days_played` /
 * `modes_played` all fire uniformly for solo and multiplayer.
 *
 * DELIBERATELY NARROW to reduce farming surface:
 * - No per-game facts (no `whot_won_on_whot`, no `perfect_race`). Solo can't beat those
 *   trophies without an anti-cheat surface we haven't shipped yet; adding them here
 *   would need a payload allowlist. Not shipped in v1.
 * - No spectator/finisher gate. Solo is always one human + one bot, i.e. always past the
 *   `MIN_PLAYERS_FOR_A_WIN` bar for the platform counters, so wins over the bot count.
 * - Late-night extra still fires because it is a platform-level counter that any real
 *   play should credit.
 * - Big-room extra never fires (solo is 2 participants by definition).
 */
export async function awardForSoloFinish(
  supabase: SupabaseClient,
  profileId: string,
  input: { gameType: GameType; outcome: 'human' | 'bot' | 'draw'; sessionId: string; finishedAt?: Date }
): Promise<AwardResult> {
  const rawId = String(input.sessionId ?? '').trim()
  if (!rawId) return NOOP('error')
  // Prefixed so the solo claim can never collide with an uppercase game code even if the
  // client sends something odd — the multiplayer path uses `gameId.toUpperCase()`.
  const claimKey = `solo:${rawId}`

  const { error: claimError } = await supabase
    .from('awarded_sessions')
    .insert({ profile_id: profileId, session_id: claimKey })
  if (claimError) return NOOP('already_awarded')

  const releaseClaim = async () => {
    await supabase.from('awarded_sessions').delete().eq('profile_id', profileId).eq('session_id', claimKey)
  }

  try {
    const won = input.outcome === 'human'
    const finishedAt = input.finishedAt ?? new Date()

    const extras: Record<string, number> = {}
    if (watHour(finishedAt) < 5) extras.late_night_games = 1

    await bumpStats(supabase, profileId, input.gameType, { played: 1, won: won ? 1 : 0, counters: extras })
    await bumpStats(supabase, profileId, GLOBAL_SCOPE, { played: 1, won: won ? 1 : 0, counters: extras })

    await supabase
      .from('player_distinct')
      .upsert([{ profile_id: profileId, key: 'modes_played', member: input.gameType }], {
        onConflict: 'profile_id,key,member',
      })

    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, last_active_date, trophy_points')
      .eq('id', profileId)
      .maybeSingle()

    const streak = advanceStreak(
      {
        current_streak: Number(profile?.current_streak) || 0,
        longest_streak: Number(profile?.longest_streak) || 0,
        last_active_date: (profile?.last_active_date as string) ?? null,
      } satisfies StreakState,
      watDate(finishedAt)
    )
    if (streak.last_active_date !== (profile?.last_active_date ?? null)) {
      await bumpStats(supabase, profileId, GLOBAL_SCOPE, { counters: { days_played: 1 } })
    }

    const snapshot = await buildSnapshot(supabase, profileId)
    snapshot.counters[GLOBAL_SCOPE] = {
      ...(snapshot.counters[GLOBAL_SCOPE] ?? {}),
      longest_streak: streak.longest_streak,
    }
    // No instant unlocks: they are checked mid-round against a `players.id`, and solo
    // has no player row for that check to bind to. Trophies still land through the
    // counter-based evaluator, which is what solo can honestly satisfy.
    const earned = await grantEligible(supabase, profileId, snapshot, [])

    await supabase
      .from('profiles')
      .update({
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
        last_active_date: streak.last_active_date,
      })
      .eq('id', profileId)

    await supabase.rpc('recompute_profile_points', { p_profile_id: profileId })

    return { earned, applied: true }
  } catch {
    await releaseClaim().catch(() => {})
    return NOOP('error')
  }
}

/**
 * Grant every active trophy this snapshot satisfies and the profile doesn't already hold.
 *
 * `forceIds` are trophies already verified during play (see `instant-unlock.ts`). They bypass
 * the criteria check but NOT the already-held check — so an instant unlock in round one and
 * again in round two grants once, exactly as a counter-derived trophy would.
 */
async function grantEligible(
  supabase: SupabaseClient,
  profileId: string,
  snapshot: ProgressSnapshot,
  forceIds: string[] = []
): Promise<AwardedTrophy[]> {
  const [{ data: catalog }, { data: alreadyEarned }] = await Promise.all([
    supabase.from('trophies').select('id, game_type, title, tier, points, criteria').eq('is_active', true),
    supabase.from('player_trophies').select('trophy_id').eq('profile_id', profileId),
  ])
  const have = new Set((alreadyEarned ?? []).map((r) => r.trophy_id as string))
  const forced = new Set(forceIds)

  // Build platinum context: per-game lists of non-platinum trophy IDs.
  const gameTrophyIds = new Map<string, string[]>()
  const platinumTrophies: typeof catalog = []
  for (const trophy of catalog ?? []) {
    const gt = trophy.game_type as string | null
    const crit = trophy.criteria as Record<string, unknown> | null
    if (crit?.type === 'platinum') {
      platinumTrophies.push(trophy)
    } else if (gt) {
      const list = gameTrophyIds.get(gt) ?? []
      list.push(trophy.id as string)
      gameTrophyIds.set(gt, list)
    }
  }

  // Pass 1: evaluate non-platinum trophies.
  const earned: AwardedTrophy[] = []
  for (const trophy of catalog ?? []) {
    const id = trophy.id as string
    const crit = trophy.criteria as Record<string, unknown> | null
    if (crit?.type === 'platinum') continue
    if (have.has(id)) continue
    if (!forced.has(id) && !evaluateRaw(trophy.criteria, snapshot).met) continue
    earned.push({
      id,
      title: trophy.title as string,
      tier: trophy.tier as string,
      points: Number(trophy.points) || 0,
    })
  }

  // Update the earned set with what pass 1 just granted.
  const earnedIds = new Set(have)
  for (const t of earned) earnedIds.add(t.id)
  const platinumCtx: PlatinumContext = { gameTrophyIds, earnedIds }

  // Pass 2: evaluate platinum trophies now that we know the full earned set.
  for (const trophy of platinumTrophies) {
    const id = trophy.id as string
    if (earnedIds.has(id)) continue
    if (!evaluateRaw(trophy.criteria, snapshot, platinumCtx).met) continue
    earned.push({
      id,
      title: trophy.title as string,
      tier: trophy.tier as string,
      points: Number(trophy.points) || 0,
    })
  }

  if (earned.length) {
    await supabase.from('player_trophies').upsert(
      earned.map((t) => ({ profile_id: profileId, trophy_id: t.id })),
      { onConflict: 'profile_id,trophy_id', ignoreDuplicates: true }
    )
  }
  return earned
}

/**
 * Catch-up pass: grant anything this profile already qualifies for.
 *
 * WHY THIS IS NEEDED. The award pass is keyed on (profile, game) and runs once per finished
 * game, so a trophy ADDED AFTER someone played is never granted by it. Admin adds "Finish 10
 * Trivia games", and a player with 40 sees it sitting at 100% and locked until they happen to
 * play again. Editing a live catalog is normal, so that can't be the behaviour.
 *
 * Deliberately touches NO counters and no streak — it only grants what existing stats already
 * justify, so running it can never inflate anything. That is what makes it safe to call
 * whenever the trophy list is opened.
 */
export async function syncEligibleTrophies(supabase: SupabaseClient, profileId: string): Promise<AwardedTrophy[]> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('trophy_points, longest_streak')
      .eq('id', profileId)
      .maybeSingle()

    const snapshot = await buildSnapshot(supabase, profileId)
    snapshot.counters[GLOBAL_SCOPE] = {
      ...(snapshot.counters[GLOBAL_SCOPE] ?? {}),
      longest_streak: Number(profile?.longest_streak) || 0,
    }

    const earned = await grantEligible(supabase, profileId, snapshot)
    if (!earned.length) return []

    await supabase.rpc('recompute_profile_points', { p_profile_id: profileId })
    return earned
  } catch {
    return []
  }
}
