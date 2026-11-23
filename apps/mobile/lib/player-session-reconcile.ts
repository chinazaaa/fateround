import { apiUrl } from '@/lib/config'
import { clearPlayerSession, getPlayerSession, setPlayerSession, type PlayerSession } from '@/lib/secure-session'
import type { PlayerGender } from '@fateround/shared'
import { reconcileSession } from '@fateround/shared/session-reconcile'

type ProbeResult =
  | { kind: 'row'; playerId: string; playerName: string; playerGender: PlayerGender; resumeToken: string | null }
  /** Server positively reports the token gone (404) — removed / left / rotated away. */
  | { kind: 'gone' }
  /** Unverifiable (network, 5xx, 429, 400…) — caller must NOT clear. */
  | { kind: 'unknown' }

/** Ask the server which row (if any) owns this resume token. Mirrors web's
 *  resumeFromApi + confirmPlayerExists (both hit /api/players/resume). */
async function probeResume(gameCode: string, resumeToken: string): Promise<ProbeResult> {
  try {
    const res = await fetch(apiUrl('/api/players/resume'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: gameCode.toUpperCase(), resumeToken }),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        playerId?: string
        playerName?: string
        playerGender?: string
        resumeToken?: string
      }
      if (data.playerId && data.playerName) {
        return {
          kind: 'row',
          playerId: data.playerId,
          playerName: data.playerName,
          playerGender: (data.playerGender as PlayerGender) ?? 'both',
          resumeToken: data.resumeToken ?? resumeToken,
        }
      }
      return { kind: 'unknown' }
    }
    // 404 = game or player genuinely not found → definitively gone. Any other
    // status is transient/ambiguous and must never end the session.
    if (res.status === 404) return { kind: 'gone' }
    return { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}

/**
 * Reconcile the locally-stored player session against the freshly-fetched roster,
 * giving mobile the self-heal web already has (src/lib/player-resume.ts). Mobile's
 * bootstrap otherwise trusts the stored `playerId` forever, so a drifted/stale id
 * (host removed then rejoined elsewhere, a reclaim miss, a rotated share token)
 * silently mismatches the id the game dealt a hand to → "Your hand (0)" while the
 * roster shows the real seat.
 *
 * Only acts when the stored id is ABSENT from the roster (the desync signal), and
 * only via the server's token-keyed /api/players/resume — never on roster absence
 * alone (that inference is the "host demoted to watcher" trap):
 *  - server returns the canonical row for the token → re-key the stored session to
 *    it (heals a drifted id to the seat that actually owns the hand).
 *  - definitive 404 → the token is genuinely gone; clear so the shell drops to a
 *    clean rejoin (mirrors web's clear-on-confirmed-404).
 *  - anything ambiguous (offline, 5xx) → keep the session untouched.
 *
 * Returns the session to use for this load (possibly re-keyed), or null if cleared.
 */
export async function reconcilePlayerSession(
  gameCode: string,
  roster: { id: string }[],
  /** False once the calling load was superseded/unmounted: such a run must not write session state. */
  isCurrent?: () => boolean
): Promise<PlayerSession | null> {
  // The decision logic and its race guards (superseded run, session saved after we read it) live in
  // @fateround/shared so they are unit-tested; this file only supplies storage and the network probe.
  return reconcileSession<PlayerSession>(roster, {
    read: () => getPlayerSession(gameCode),
    probe: async (token) => {
      const r = await probeResume(gameCode, token)
      if (r.kind !== 'row') return r
      return {
        kind: 'row',
        session: {
          playerId: r.playerId,
          playerName: r.playerName,
          playerGender: r.playerGender,
          resumeToken: r.resumeToken,
        },
      }
    },
    write: (s) => setPlayerSession(gameCode, s.playerId, s.playerName, s.playerGender, s.resumeToken),
    clear: () => clearPlayerSession(gameCode),
    isCurrent,
  })
}
