/**
 * Coin awarding for the game-finish path (`docs/coins-and-shop-plan.md`
 * §"Earning" and §"Anti-farming rules").
 *
 * Runs alongside the trophy award pass in `awardForFinishedGame` — same
 * (profile, round) idempotency, same fail-open posture. The RPC
 * `award_coins()` enforces the 2-human floor and the 0.5× multiplier for
 * 2-human rooms; this file's job is to decide WHICH reasons fired and pass
 * the RAW `unique_humans` count. Never pre-multiply.
 *
 * For pure guests (no attributed profile) we write to `guest_pending_grants`
 * instead — held server-side until signup materialises them.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { COIN_AMOUNTS, COIN_REASONS, streakMultiplier, type CoinReason } from './reasons'

export type CoinAwardLine = {
  reason: CoinReason
  /** Base amount pre-multiplier as offered to the RPC. */
  requested: number
  /** Amount actually credited (post floor + 0.5× multiplier). Zero if the floor blocked. */
  credited: number
  /** Human copy for the result-screen panel — "Won", "Full lobby", "Streak x2". */
  label: string
}

export type CoinAwardResult = {
  lines: CoinAwardLine[]
  /** Post-multiplier total actually credited. */
  total: number
  /** How the awarding thinks about this room — echoed to analytics for audits. */
  uniqueHumans: number
}

const EMPTY: CoinAwardResult = { lines: [], total: 0, uniqueHumans: 0 }

/**
 * Count unique humans in a set of players. A "human" is anything that isn't a
 * bot; uniqueness is by profile_id when present, otherwise by player row id.
 * Two seats one player took (rejoin) collapse to one; two bots don't count at
 * all. The RPC uses this to enforce the 2-human floor.
 */
export function countUniqueHumans(
  players: ReadonlyArray<{ id?: string | null; profile_id?: string | null; is_bot?: boolean | null }>
): number {
  const seen = new Set<string>()
  for (const p of players) {
    if (p.is_bot) continue
    const key = p.profile_id ?? p.id ?? null
    if (!key) continue
    seen.add(key)
  }
  return seen.size
}

/**
 * Award coins for a finished multiplayer game — profile-attributed path.
 *
 * Best-effort by design: called after `awardForFinishedGame` has already done
 * its work, and a failed coin credit must not turn a finished game into an
 * error. Every credit is idempotent per (profile, ref_id) at the ledger level
 * ONLY through the trophy claim-first pattern in the caller (`awarded_sessions`
 * gates the whole pass), so this function trusts that upstream lock.
 */
export async function awardCoinsForFinishedGame(
  admin: SupabaseClient,
  input: {
    profileId: string
    gameId: string
    won: boolean
    seatedHumans: number
    uniqueHumans: number
    isFirstTimeForMode: boolean
    hostBounty: boolean
    streakDays: number
  }
): Promise<CoinAwardResult> {
  const { profileId, gameId, won, seatedHumans, uniqueHumans, isFirstTimeForMode, hostBounty } = input

  const lines: CoinAwardLine[] = []
  let total = 0

  const call = async (reason: CoinReason, amount: number, label: string) => {
    if (amount <= 0) return
    let credited = 0
    try {
      const { data, error } = await admin.rpc('award_coins', {
        p_profile_id: profileId,
        p_delta: amount,
        p_reason: reason,
        p_ref_id: gameId,
        p_unique_humans: uniqueHumans,
        p_exempt_from_floor: false,
      })
      if (!error) credited = Number(data) || 0
    } catch {
      credited = 0
    }
    lines.push({ reason, requested: amount, credited, label })
    total += credited
  }

  if (won) {
    // The plan bundles the "full lobby" +10 into the win credit (no
    // dedicated reason enum for it). Room-size logic lives on the caller
    // side; the RPC still applies the anti-farm gate to the combined amount.
    const winAmount =
      COIN_AMOUNTS.winBase +
      (seatedHumans >= COIN_AMOUNTS.fullLobbyThreshold ? COIN_AMOUNTS.fullLobbyBonus : 0)
    const label = seatedHumans >= COIN_AMOUNTS.fullLobbyThreshold ? 'Won (full lobby)' : 'Won'
    await call(COIN_REASONS.win, winAmount, label)
  }

  if (isFirstTimeForMode) {
    await call(COIN_REASONS.firstModeBonus, COIN_AMOUNTS.firstModeBonus, 'First time on this mode')
  }

  if (hostBounty) {
    await call(COIN_REASONS.hostBounty, COIN_AMOUNTS.hostBounty, 'Host bounty (5+ rounds)')
  }

  return { lines, total, uniqueHumans }
}

/**
 * Daily-challenge coin award. Runs on the submit path where a `daily_scores`
 * row is written. Streak multiplier is applied by the CALLER (this function)
 * because it depends on profile-level streak state the RPC deliberately does
 * not touch — see plan §"Streak multiplier ramp".
 *
 * Two credits are written to keep the ledger explanation legible on the
 * history table: the flat `daily_challenge` amount and, separately, the
 * `streak_multiplier` delta above 1x. A single lumped credit would read as
 * "Daily challenge +60" with no way to explain the extra 30.
 */
export async function awardCoinsForDailyChallenge(
  admin: SupabaseClient,
  input: { profileId: string; refId: string; streakDays: number }
): Promise<CoinAwardResult> {
  const lines: CoinAwardLine[] = []
  let total = 0

  const base = COIN_AMOUNTS.dailyChallenge
  try {
    const { data, error } = await admin.rpc('award_coins', {
      p_profile_id: input.profileId,
      p_delta: base,
      p_reason: COIN_REASONS.dailyChallenge,
      p_ref_id: input.refId,
      p_unique_humans: null,
      p_exempt_from_floor: true,
    })
    if (!error) {
      const credited = Number(data) || 0
      lines.push({ reason: COIN_REASONS.dailyChallenge, requested: base, credited, label: 'Daily challenge' })
      total += credited
    }
  } catch {
    // best effort
  }

  const multiplier = streakMultiplier(input.streakDays)
  const extra = Math.floor(base * multiplier) - base
  if (extra > 0) {
    try {
      const { data, error } = await admin.rpc('award_coins', {
        p_profile_id: input.profileId,
        p_delta: extra,
        p_reason: COIN_REASONS.streakMultiplier,
        p_ref_id: input.refId,
        p_unique_humans: null,
        p_exempt_from_floor: true,
      })
      if (!error) {
        const credited = Number(data) || 0
        lines.push({
          reason: COIN_REASONS.streakMultiplier,
          requested: extra,
          credited,
          label: `Streak x${multiplier.toFixed(1)}`,
        })
        total += credited
      }
    } catch {
      // best effort
    }
  }

  return { lines, total, uniqueHumans: 0 }
}

/**
 * Tournament placement — flat per-game + placement bonus. Both are exempt
 * from the 2-human floor (bracket minimums already enforce a floor).
 */
export async function awardTournamentCoins(
  admin: SupabaseClient,
  input: { profileId: string; refId: string; placement?: number | null }
): Promise<CoinAwardResult> {
  const lines: CoinAwardLine[] = []
  let total = 0

  const push = async (amount: number, label: string) => {
    try {
      const { data } = await admin.rpc('award_coins', {
        p_profile_id: input.profileId,
        p_delta: amount,
        p_reason: COIN_REASONS.tournamentPlacement,
        p_ref_id: input.refId,
        p_unique_humans: null,
        p_exempt_from_floor: true,
      })
      const credited = Number(data) || 0
      lines.push({ reason: COIN_REASONS.tournamentPlacement, requested: amount, credited, label })
      total += credited
    } catch {
      // best effort
    }
  }

  if (COIN_AMOUNTS.tournamentPerGame > 0) {
    await push(COIN_AMOUNTS.tournamentPerGame, 'Tournament game')
  }
  if (input.placement && COIN_AMOUNTS.tournamentPlacement[input.placement]) {
    const amt = COIN_AMOUNTS.tournamentPlacement[input.placement]
    await push(amt, `Tournament placement (#${input.placement})`)
  }

  return { lines, total, uniqueHumans: 0 }
}

/**
 * Guest earning path — no profile, so we hold the intent server-side keyed
 * on device_id. `migrate_guest_grants()` at signup time materialises these
 * into `coin_ledger` under `reason='guest_migration'` (see plan §"Guest
 * earnings & migration").
 *
 * The same anti-farm gate as the profile path applies here IN PRINCIPLE, but
 * we deliberately still write the pending row and let `migrate_guest_grants`
 * decide the final credit. Writing the row is what the sign-up CTA displays
 * as "Sign up to claim X coins" for this game, and dropping the row would
 * make that number 0 for a legitimate 2-player friend duo — the same shape
 * the 0.5× multiplier exists to soften rather than block.
 */
export async function recordGuestPendingGrant(
  admin: SupabaseClient,
  input: {
    deviceId: string
    sessionId: string | null
    gameId: string
    reason: CoinReason
    delta: number
  }
): Promise<{ ok: boolean; delta: number }> {
  if (!input.deviceId || input.delta <= 0) return { ok: false, delta: 0 }
  try {
    const { error } = await admin.from('guest_pending_grants').insert({
      device_id: input.deviceId,
      session_id: input.sessionId,
      game_id: input.gameId,
      delta: input.delta,
      reason: input.reason,
    })
    if (error) return { ok: false, delta: 0 }
    return { ok: true, delta: input.delta }
  } catch {
    return { ok: false, delta: 0 }
  }
}

export type GuestPendingResult = {
  lines: CoinAwardLine[]
  total: number
}

/**
 * The guest-earning equivalent of `awardCoinsForFinishedGame`. Returns the
 * same shape so the finish screen renders the same "would earn" panel for
 * a signed-out player as it does for a signed-in one; the amount is what
 * the sign-up CTA quotes.
 */
export async function recordGuestFinishedGameGrants(
  admin: SupabaseClient,
  input: {
    deviceId: string
    sessionId: string | null
    gameId: string
    won: boolean
    seatedHumans: number
    uniqueHumans: number
    isFirstTimeForMode: boolean
  }
): Promise<GuestPendingResult> {
  const lines: CoinAwardLine[] = []
  let total = 0

  // Guests still respect the 2-human floor client-side: award zero-value lines
  // when the floor blocks. The guest_pending_grants row is skipped, but the
  // panel can still explain "no coins in a solo/bot lobby".
  const belowFloor = input.uniqueHumans < 2
  const halfRate = input.uniqueHumans === 2

  const stage = async (reason: CoinReason, amount: number, label: string) => {
    if (amount <= 0) return
    if (belowFloor) {
      lines.push({ reason, requested: amount, credited: 0, label })
      return
    }
    const credited = halfRate ? Math.floor(amount / 2) : amount
    if (credited <= 0) {
      lines.push({ reason, requested: amount, credited: 0, label })
      return
    }
    const { ok } = await recordGuestPendingGrant(admin, {
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      gameId: input.gameId,
      reason,
      delta: credited,
    })
    lines.push({ reason, requested: amount, credited: ok ? credited : 0, label })
    if (ok) total += credited
  }

  if (input.won) {
    const winAmount =
      COIN_AMOUNTS.winBase +
      (input.seatedHumans >= COIN_AMOUNTS.fullLobbyThreshold ? COIN_AMOUNTS.fullLobbyBonus : 0)
    const label =
      input.seatedHumans >= COIN_AMOUNTS.fullLobbyThreshold ? 'Won (full lobby)' : 'Won'
    await stage(COIN_REASONS.win, winAmount, label)
  }

  if (input.isFirstTimeForMode) {
    await stage(COIN_REASONS.firstModeBonus, COIN_AMOUNTS.firstModeBonus, 'First time on this mode')
  }

  return { lines, total }
}

/** No-op result — handy when a caller decides not to award (guest with no device id, etc.). */
export const EMPTY_COIN_AWARD_RESULT = EMPTY
