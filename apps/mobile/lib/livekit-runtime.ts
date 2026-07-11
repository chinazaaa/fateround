import Constants from 'expo-constants'

/** True when running inside the stock Expo Go app (no custom native modules). */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo'
}

let globalsRegistered = false

/** Register LiveKit WebRTC globals — dev builds only; no-op in Expo Go. */
export function ensureLiveKitGlobals(): boolean {
  if (isExpoGo()) return false
  if (globalsRegistered) return true
  try {
    const { registerGlobals } = require('@livekit/react-native') as typeof import('@livekit/react-native')
    registerGlobals()
    globalsRegistered = true
    return true
  } catch {
    return false
  }
}
