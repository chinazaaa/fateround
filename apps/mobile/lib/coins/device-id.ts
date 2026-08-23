import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Mobile mirror of `src/lib/coins/device-id.ts`.
 *
 * A stable, self-managed device id for the coin-earning path. Held in
 * AsyncStorage so it survives an OS-level app kill (SecureStore would work
 * too — but the id isn't a secret and doesn't need enclave protection).
 * Deliberately independent of any other identity key.
 */
const KEY = 'fateround_device_id'

let cached: string | null = null
// Memoized in-flight read/create so two concurrent first-launch callers can't
// each read null, each generate a UUID, and each write — leaving the losing
// UUID cached in memory while storage holds the winning one. Guest grants
// would then split across the two ids and one set would never migrate at
// signup.
let inflight: Promise<string | null> | null = null

function makeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const uuid = g.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

export async function getDeviceId(): Promise<string | null> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const existing = await AsyncStorage.getItem(KEY)
      if (existing) {
        cached = existing
        return existing
      }
      const fresh = makeId()
      await AsyncStorage.setItem(KEY, fresh)
      cached = fresh
      return fresh
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}
