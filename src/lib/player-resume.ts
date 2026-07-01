import type { PlayerGender } from '@/types'
import { parsePlayerGenderFromDb } from '@/lib/participants'
import { setPollHostMode } from '@/lib/poll-host-mode'
import { clearPlayerSession, getPlayerSession, normalizeResumeToken, setPlayerSession } from '@/lib/utils'

export const PLAYER_RESUME_QUERY = 'player'

export type ResolvedPlayerSession = {
  playerId: string
  playerName: string
  playerGender: PlayerGender
  resumeToken: string | null
}

type PlayerRow = {
  id: string
  name: string
  gender: string
  resume_token?: string | null
}

export function getResumeTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get(PLAYER_RESUME_QUERY)
  if (!raw?.trim()) return null
  const token = normalizeResumeToken(raw)
  return token.length >= 4 ? token : null
}

function stripResumeTokenFromUrl(): void {
  if (typeof window === 'undefined') return
  // Keep ?player= on host URLs so the combined host+play link stays shareable.
  if (window.location.pathname.startsWith('/host/')) return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PLAYER_RESUME_QUERY)) return
  url.searchParams.delete(PLAYER_RESUME_QUERY)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

async function resumeFromApi(gameCode: string, resumeToken: string): Promise<ResolvedPlayerSession | null> {
  const res = await fetch('/api/players/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameCode, resumeToken }),
  })
  const data = (await res.json()) as {
    playerId?: string
    playerName?: string
    playerGender?: string
    resumeToken?: string
    error?: string
  }
  if (!res.ok || !data.playerId || !data.playerName) return null

  const playerGender = parsePlayerGenderFromDb(data.playerGender)
  if (!playerGender) return null

  const token =
    typeof data.resumeToken === 'string' && data.resumeToken.trim()
      ? normalizeResumeToken(data.resumeToken)
      : normalizeResumeToken(resumeToken)

  setPlayerSession(gameCode, data.playerId, data.playerName, playerGender, token)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/host/')) {
    setPollHostMode(gameCode, 'player')
  }
  stripResumeTokenFromUrl()

  return {
    playerId: data.playerId,
    playerName: data.playerName,
    playerGender,
    resumeToken: token,
  }
}

/**
 * Probe whether a player still exists for this resume token.
 * - `true`  — the server confirms the player exists.
 * - `false` — the server positively reports it gone (404 not-found).
 * - `null`  — unverifiable (network error, 5xx, 429, 400…) → caller must NOT clear.
 */
async function confirmPlayerExists(gameCode: string, resumeToken: string): Promise<boolean | null> {
  try {
    const res = await fetch('/api/players/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode, resumeToken }),
    })
    if (res.ok) return true
    // 404 = game or player genuinely not found → definitively gone. Any other status
    // is a transient/ambiguous failure and must not end the session.
    if (res.status === 404) return false
    return null
  } catch {
    return null
  }
}

/** Restore player identity from URL code or localStorage; validates the player still exists. */
export async function resolvePlayerSession(
  gameCode: string,
  players?: PlayerRow[] | null
): Promise<ResolvedPlayerSession | null> {
  const urlToken = getResumeTokenFromUrl()
  if (urlToken) {
    const resumed = await resumeFromApi(gameCode, urlToken)
    if (resumed) return resumed
  }

  const session = getPlayerSession(gameCode)
  if (!session) return null

  if (players && !players.some((p) => p.id === session.playerId)) {
    // The passed `players` list can be a STALE snapshot — e.g. a load() that started
    // before this player's own join row replicated. This is common when a tournament
    // forwards everyone into a fresh game at once: a racing load resolves the session
    // against a list captured pre-join, the player isn't in it, and we'd wrongly nuke
    // their session — bouncing them to the join screen, where re-joining hits "name
    // already taken" on their own orphaned row. Confirm with the server before clearing,
    // and ONLY clear on a positive "player gone" — a transient/ambiguous failure
    // (network, 5xx, 429) must keep the session so the next load can retry.
    const exists = session.resumeToken ? await confirmPlayerExists(gameCode, session.resumeToken) : null
    if (exists === false) {
      // The server positively reports this player gone — a host removed them (or they
      // left). clearPlayerSession marks them kicked so room-link auto-join won't silently
      // pull them back in; they must deliberately tap "join" to return.
      clearPlayerSession(gameCode)
      return null
    }
    // exists === true (confirmed) or null (unverifiable) — keep the local session.
  }

  // resume_token is the player's secret credential and is no longer readable from the DB
  // by the client (migration 0122) — it lives only in the local session (set at join).
  return {
    playerId: session.playerId,
    playerName: session.playerName,
    playerGender: session.playerGender,
    resumeToken: session.resumeToken ?? null,
  }
}

export async function resumePlayerSession(
  gameCode: string,
  resumeToken: string
): Promise<ResolvedPlayerSession | null> {
  const token = normalizeResumeToken(resumeToken)
  if (token.length < 4) return null
  return resumeFromApi(gameCode, token)
}

export function applyResolvedSession(
  session: ResolvedPlayerSession,
  setters: {
    setMyPlayerId: (id: string) => void
    setMyPlayerName: (name: string) => void
    setMyPlayerGender?: (gender: PlayerGender) => void
  }
): void {
  setters.setMyPlayerId(session.playerId)
  setters.setMyPlayerName(session.playerName)
  setters.setMyPlayerGender?.(session.playerGender)
}
