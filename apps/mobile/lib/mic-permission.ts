import { Platform, PermissionsAndroid } from 'react-native'

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone access',
      message: 'FateRound needs the microphone for in-game voice chat.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    })
    return granted === PermissionsAndroid.RESULTS.GRANTED
  } catch {
    return false
  }
}
