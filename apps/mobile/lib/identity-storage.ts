/**
 * A Supabase auth-session store backed by SecureStore, with chunking.
 *
 * React Native has no localStorage, so supabase-js needs an explicit storage adapter or it
 * falls back to memory and the session dies with the process — meaning a player would silently
 * lose their streak identity every cold start.
 *
 * Why chunking: a Supabase session (access JWT + refresh token + user object) routinely runs
 * past 2KB, and the Expo SDK 57 SecureStore docs warn that "Large payloads can be rejected by
 * the underlying platform. Historically, some iOS releases refused values above roughly 2048
 * bytes." A single setItemAsync would therefore fail intermittently, on some devices only, in a
 * way that looks like random sign-outs. So values are split across numbered keys.
 *
 * Why not AsyncStorage: it is a native module this app doesn't currently depend on, and adding
 * it would force a dev-client rebuild. SecureStore is already a dependency and already holds the
 * per-game tokens. If chunking ever proves flaky in the field, swapping in AsyncStorage is a
 * drop-in replacement for this file — nothing else imports SecureStore for sessions.
 */
import * as SecureStore from 'expo-secure-store'

/** Comfortably under the ~2048-byte ceiling, leaving room for encoding overhead. */
const CHUNK_SIZE = 1800

/** Hard cap on chunks scanned, so a corrupted store can never spin forever. */
const MAX_CHUNKS = 20

const chunkKey = (key: string, index: number) => `${key}.${index}`

/**
 * SecureStore rejects keys containing characters outside [A-Za-z0-9._-], and Supabase's default
 * storage key is derived from the project URL. Normalise rather than trusting the caller.
 */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_')
}

async function readChunks(key: string): Promise<string | null> {
  const base = safeKey(key)
  const parts: string[] = []
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(base, i))
    if (part === null) break
    parts.push(part)
  }
  if (!parts.length) return null
  try {
    return decodeURIComponent(parts.join(''))
  } catch {
    // A partially-written or corrupted set decodes to nothing usable. Report "no session"
    // rather than handing supabase-js a mangled string it would throw on.
    return null
  }
}

async function clearChunks(key: string): Promise<void> {
  const base = safeKey(key)
  // Delete past the last present chunk so a shrinking session can't leave a stale tail that
  // would be concatenated onto the next read and corrupt the JSON.
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const existing = await SecureStore.getItemAsync(chunkKey(base, i))
    if (existing === null) break
    await SecureStore.deleteItemAsync(chunkKey(base, i))
  }
}

export const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await readChunks(key)
    } catch {
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key)
    try {
      // Percent-encode first, so every stored character is a single ASCII byte. SecureStore's
      // ceiling is in BYTES, but slicing a JS string counts UTF-16 code units — a display name
      // with an accent or emoji makes a chunk larger than it looks, and could also be split
      // mid-surrogate-pair. Encoding sidesteps both.
      const encoded = encodeURIComponent(value)
      const total = Math.ceil(encoded.length / CHUNK_SIZE)

      // Refuse rather than truncate. Writing only the first N chunks leaves a prefix that
      // reads back as corrupt JSON, which is worse than having no session at all: the player
      // would appear signed in until something tried to parse it.
      if (total > MAX_CHUNKS) {
        await clearChunks(key)
        return
      }

      // Clear first: writing a shorter value over a longer one would otherwise orphan the
      // trailing chunks of the old session, and those would be concatenated onto the next read.
      await clearChunks(key)
      for (let i = 0; i < total; i++) {
        await SecureStore.setItemAsync(chunkKey(base, i), encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
      }
    } catch {
      // A session we couldn't persist just means the next cold start is a fresh guest.
      // Never throw — this runs inside supabase-js's auth flow.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await clearChunks(key)
    } catch {
      // Nothing useful to do.
    }
  },
}
