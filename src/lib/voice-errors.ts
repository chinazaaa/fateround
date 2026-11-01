import { DisconnectReason } from 'livekit-client'

/**
 * Player-facing message for a LiveKit disconnect, or `null` when the disconnect
 * is expected and should stay silent (our own Leave). Never surfaces raw LiveKit
 * strings — connect-time errors are handled separately by the `onError` paths.
 *
 * Shared by both voice UIs (AudioChat + RoomVoiceRail) so the copy stays in one
 * place. There is a deliberate twin at `apps/mobile/lib/voice-errors.ts`: same
 * policy (which reasons are silent), platform-specific strings — mobile has no
 * tabs and is a touch UI. Change the policy here, change it there too; see that
 * file's header for why they aren't one shared function.
 */
export function voiceDisconnectMessage(reason?: DisconnectReason): string | null {
  switch (reason) {
    // The user pressed Leave (token cleared → room unmounts) — nothing to say.
    case DisconnectReason.CLIENT_INITIATED:
      return null
    // Another tab/device joined with the same identity and took the call over.
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Voice chat is now active in another tab or on another device.'
    // Signalling connected but the media path (WebRTC/UDP) never established —
    // almost always a firewall/VPN on the current network blocking calls. Point
    // the user at their network rather than leaving them to guess.
    case DisconnectReason.CONNECTION_TIMEOUT:
    case DisconnectReason.MEDIA_FAILURE:
      return "Voice chat couldn't connect on this network — it may be blocking calls. Try a different network (e.g. mobile data) or turn off any VPN."
    default:
      return 'Voice chat disconnected. Join voice again to reconnect.'
  }
}

/**
 * Player-facing message for a failed mute/unmute (`setMicrophoneEnabled`). The toggle
 * used to be fired with `void`, so every rejection escaped as an unhandled promise
 * rejection: Sentry JAVASCRIPT-NEXTJS-1D ("publishing rejected as engine not connected
 * within timeout", the room was mid-reconnect) and JAVASCRIPT-NEXTJS-16 ("NotAllowedError:
 * Permission dismissed", the player closed the browser's mic prompt). Neither is a bug
 * we can fix; both need a clear message instead of a silent no-op.
 *
 * Twin at `apps/mobile/lib/voice-errors.ts` (same classification, touch-UI copy).
 */
export function micToggleErrorMessage(err: unknown): string {
  // Not just `instanceof Error`: react-native-webrtc rejects with a MediaStreamError that
  // carries a DOMException-style `name` but does not extend Error.
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Microphone access wasn't allowed. Tap unmute again and allow the prompt — if it doesn't appear, allow the microphone in your browser's site settings."
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect one and try again.'
  }
  if (name === 'NotReadableError') {
    return 'Your microphone is being used by another app. Close it and try again.'
  }
  return "Couldn't change your microphone. Try again in a moment."
}
