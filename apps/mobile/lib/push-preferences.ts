import * as SecureStore from 'expo-secure-store'

const gameMuteKey = (gameCode: string) => `push_muted_${gameCode.toUpperCase()}`
const LOCAL_ALERTS_KEY = 'local_turn_alerts_enabled'

export async function isPushMutedForGame(gameCode: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(gameMuteKey(gameCode))
    return raw === '1'
  } catch {
    return false
  }
}

export async function setPushMutedForGame(gameCode: string, muted: boolean): Promise<void> {
  try {
    if (muted) await SecureStore.setItemAsync(gameMuteKey(gameCode), '1')
    else await SecureStore.deleteItemAsync(gameMuteKey(gameCode))
  } catch {
    // best-effort
  }
}

export async function areLocalTurnAlertsEnabled(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(LOCAL_ALERTS_KEY)
    return raw !== '0'
  } catch {
    return true
  }
}

export async function setLocalTurnAlertsEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await SecureStore.deleteItemAsync(LOCAL_ALERTS_KEY)
    else await SecureStore.setItemAsync(LOCAL_ALERTS_KEY, '0')
  } catch {
    // best-effort
  }
}
