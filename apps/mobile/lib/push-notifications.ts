import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { apiUrl } from '@/lib/config'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export type PushPlatform = 'ios' | 'android' | 'unknown'

// User preference (Settings › Notifications). Defaults to on; the
// PreferencesProvider mirrors the persisted choice here on launch + change.
// When off, `registerGamePush` opts out so no permission prompt / subscription
// happens.
let notificationsEnabled = true

/** Toggle the user's notifications preference. When off, new push registration is skipped. */
export function setPushEnabled(value: boolean) {
  notificationsEnabled = value
}

export function pushSupportedOnDevice(): boolean {
  return Device.isDevice
}

function resolveProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  const fromExtra = extra?.eas?.projectId
  if (fromExtra && !fromExtra.includes('replace-with')) return fromExtra
  const fromEas = Constants.easConfig?.projectId
  if (fromEas && !fromEas.includes('replace-with')) return fromEas
  return null
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null

  const projectId = resolveProjectId()
  if (!projectId) return null

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    return token.data
  } catch {
    return null
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (!Device.isDevice) return false

  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true

  const next = await Notifications.requestPermissionsAsync()
  return next.granted
}

export function pushPlatform(): PushPlatform {
  if (Platform.OS === 'ios') return 'ios'
  if (Platform.OS === 'android') return 'android'
  return 'unknown'
}

export async function subscribeGamePush(
  gameCode: string,
  resumeToken: string,
  expoPushToken: string
): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/games/${gameCode}/push/expo-subscribe`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken,
        expoPushToken,
        platform: pushPlatform(),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function unsubscribeGamePush(gameCode: string, expoPushToken: string): Promise<void> {
  try {
    await fetch(apiUrl(`/api/games/${gameCode}/push/expo-unsubscribe`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expoPushToken }),
    })
  } catch {
    // best-effort
  }
}

/**
 * Device-wide opt-out: removes this device's push subscription across all games
 * (the Settings › Notifications master switch). Best-effort — a failure here
 * shouldn't block the UI; the toggle also stops all future registration.
 */
export async function unsubscribeAllPush(expoPushToken: string): Promise<void> {
  try {
    await fetch(apiUrl('/api/push/expo-unsubscribe-all'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expoPushToken }),
    })
  } catch {
    // best-effort
  }
}

export async function registerGamePush(gameCode: string, resumeToken: string): Promise<boolean> {
  // Respect the user's opt-out: skip permission prompt + subscription entirely.
  if (!notificationsEnabled) return false

  const permitted = await requestPushPermission()
  if (!permitted) return false

  const token = await getExpoPushToken()
  if (!token) return false

  return subscribeGamePush(gameCode, resumeToken, token)
}
