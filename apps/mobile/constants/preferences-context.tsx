import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { setSoundsEnabled } from '@/lib/sounds'
import { setPushEnabled } from '@/lib/push-notifications'

/**
 * App-wide user preferences that live alongside the theme mode: sound effects and
 * push notifications. Persisted the same way as the theme (expo-secure-store), so
 * choices survive relaunches. Both default to `true` until the stored value (if
 * any) loads.
 */

const SOUND_KEY = 'fateround_sound_enabled'
const NOTIFICATIONS_KEY = 'fateround_notifications_enabled'

type PreferencesValue = {
  soundEnabled: boolean
  setSoundEnabled: (value: boolean) => void
  notificationsEnabled: boolean
  setNotificationsEnabled: (value: boolean) => void
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

function readStoredBool(key: string, apply: (value: boolean) => void) {
  void SecureStore.getItemAsync(key)
    .then((stored) => {
      // Only 'false' flips a pref off; anything else keeps the `true` default.
      if (stored === 'false') apply(false)
    })
    .catch(() => {
      // No stored preference (or SecureStore unavailable) — keep the default.
    })
}

function persistBool(key: string, value: boolean) {
  void SecureStore.setItemAsync(key, value ? 'true' : 'false').catch(() => {
    // Persisting is best-effort; ignore write failures.
  })
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabledState] = useState(true)
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true)

  // Load saved preferences once. SecureStore is async, so we start on the
  // defaults and adopt stored values when they arrive.
  useEffect(() => {
    readStoredBool(SOUND_KEY, setSoundEnabledState)
    readStoredBool(NOTIFICATIONS_KEY, setNotificationsEnabledState)
  }, [])

  // Mirror the prefs into the module-level gates that the sound + push layers
  // read, so playback and registration respect the current choice everywhere.
  useEffect(() => {
    setSoundsEnabled(soundEnabled)
  }, [soundEnabled])

  useEffect(() => {
    setPushEnabled(notificationsEnabled)
  }, [notificationsEnabled])

  const value = useMemo<PreferencesValue>(
    () => ({
      soundEnabled,
      setSoundEnabled: (next: boolean) => {
        setSoundEnabledState(next)
        persistBool(SOUND_KEY, next)
      },
      notificationsEnabled,
      setNotificationsEnabled: (next: boolean) => {
        setNotificationsEnabledState(next)
        persistBool(NOTIFICATIONS_KEY, next)
      },
    }),
    [soundEnabled, notificationsEnabled]
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within <PreferencesProvider>')
  return ctx
}
