/**
 * Layer 1 of the identity plan (`docs/accounts-and-identity-plan.md` §5, Slice 1):
 * a purely local, non-game-keyed record of "who I am on this device".
 *
 * Everything else about a player is stored per game under `kmk_player_<CODE>`
 * (see `getPlayerSession` in `./utils`), which is why a player has to retype their
 * name in every single game they join. This record is the one thing that carries
 * across games.
 *
 * Deliberately dumb and offline: no network, no auth, no server row. It exists so
 * the majority of players — who will never want an account — still get the main
 * quality-of-life win. Layers 2 and 3 (anonymous auth, email accounts) build on
 * top of this and take over the name once a profile exists.
 *
 * Treat the stored name as a *prefill*, never as a lock: room links, tournament
 * links, and the player themselves all outrank it.
 */

const KEY = 'fateround_identity'

/** Matches the `maxLength` on the join name inputs. */
const MAX_NAME = 50

/**
 * Stored as an object rather than a bare string so later slices can add
 * `avatar`, `identityGender` and prefs without a storage migration.
 */
export type LocalIdentity = {
  name?: string
}

export function getLocalIdentity(): LocalIdentity {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    return name ? { name } : {}
  } catch {
    return {}
  }
}

/** The name to prefill a join form with, or null if we've never seen one. */
export function getRememberedName(): string | null {
  return getLocalIdentity().name ?? null
}

/**
 * Remember a name the player actually typed.
 *
 * Only call this from surfaces where the player entered the name themselves —
 * not from every `setPlayerSession`, which also fires for server-generated names
 * (anonymous games) and for resumed sessions.
 */
export function rememberName(name: string): void {
  if (typeof window === 'undefined') return
  const trimmed = name.trim().slice(0, MAX_NAME)
  if (!trimmed) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getLocalIdentity(), name: trimmed }))
  } catch {
    // Private mode / quota — a forgotten name is not worth breaking a join over.
  }
}

/** Wipe the local record. Used by the "Not you? Switch" action (Slice 4). */
export function clearLocalIdentity(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do — the caller can't act on this either.
  }
}
