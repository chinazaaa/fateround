import { ensureLiveKitGlobals, isExpoGo } from '@/lib/livekit-runtime'
import type { VoiceRailProps } from '@/components/voice/VoiceRailNative'

export type { VoiceRailProps }

/** Voice chat rail — hidden in Expo Go (LiveKit needs a dev build). */
export function VoiceRail(props: VoiceRailProps) {
  if (isExpoGo()) return null
  if (!ensureLiveKitGlobals()) return null

  const { VoiceRailNative } = require('./VoiceRailNative') as typeof import('./VoiceRailNative')
  return <VoiceRailNative {...props} />
}
