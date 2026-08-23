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

function makeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const uuid = g.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

export async function getDeviceId(): Promise<string | null> {
  if (cached) return cached
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
  }
}
