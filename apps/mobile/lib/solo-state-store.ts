/**
 * In-progress solo game state persistence (mobile).
 *
 * Mirrors the sessionStorage load/save/clear pattern the web solo clients use
 * (see src/app/play-solo/... Client.tsx): same STORAGE_KEY strings so a user
 * who has an unfinished game on their phone does not lose it across an
 * OS-level app kill. AsyncStorage is used instead of SecureStore because a
 * full serialised session (deck + hands + logs) can exceed SecureStore's
 * ~2 KB per-key cap on Android.
 *
 * SessionStorage on web is per-tab and disappears when the tab closes; on
 * mobile there is no equivalent concept, so AsyncStorage effectively upgrades
 * the survival window to "until the user hits New game." That is the more
 * useful behaviour for a phone anyway.
 *
 * Errors are swallowed: worst case, the user loses their in-progress game.
 * Never rethrow; a storage failure must not crash the play surface.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

export type SoloStateKey =
  | 'solo-whot-state-v1'
  | 'solo-ayo-state-v1'
  | 'solo-ludo-state-v1'
  | 'solo-yahtzee-state-v1'
  | 'solo-uno-state-v1'
  | 'solo-crazy8-state-v1'

// Load a persisted state. Returns null on no entry, JSON parse error, the
// validate() predicate returning false, or an AsyncStorage read failure.
export async function loadSoloState<T>(key: SoloStateKey, validate: (raw: unknown) => raw is T): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!validate(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

// Save a state snapshot. Fire-and-forget; errors swallowed.
export async function saveSoloState<T>(key: SoloStateKey, state: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

// Clear the persisted state; called from restart().
export async function clearSoloState(key: SoloStateKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(key)
  } catch {
    /* noop */
  }
}
