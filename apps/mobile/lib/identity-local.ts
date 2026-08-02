/**
 * Mobile mirror of `src/lib/identity-local.ts` on web.
 *
 * Layer 1 of the identity plan (`docs/accounts-and-identity-plan.md` §5, Slice 1):
 * a purely local, non-game-keyed record of "who I am on this device", so a returning
 * player doesn't retype their name in every game they join. Everything else about a
 * player lives per game under `kmk_player_<CODE>` (see `./secure-session`).
 *
 * Uses SecureStore purely to stay consistent with `secure-session.ts` and avoid a new
 * dependency — the name isn't a secret, and it's far below SecureStore's size limit.
 *
 * Treat the stored name as a *prefill*, never as a lock.
 */
import * as SecureStore from 'expo-secure-store'

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

export async function getLocalIdentity(): Promise<LocalIdentity> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<LocalIdentity>
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : ''
    return name ? { name } : {}
  } catch {
    return {}
  }
}

/** The name to prefill a join form with, or null if we've never seen one. */
export async function getRememberedName(): Promise<string | null> {
  return (await getLocalIdentity()).name ?? null
}

/**
 * Remember a name the player actually typed.
 *
 * Only call this from surfaces where the player entered the name themselves — not
 * from every `setPlayerSession`, which also fires for server-generated names
 * (anonymous games) and for resumed sessions.
 */
export async function rememberName(name: string): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_NAME)
  if (!trimmed) return
  try {
    const existing = await getLocalIdentity()
    await SecureStore.setItemAsync(KEY, JSON.stringify({ ...existing, name: trimmed }))
  } catch {
    // A forgotten name is not worth breaking a join over.
  }
}

/** Wipe the local record. Used by the "Not you? Switch" action (Slice 4). */
export async function clearLocalIdentity(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY)
  } catch {
    // Nothing the caller can do about this either.
  }
}
