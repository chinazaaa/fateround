import { DisconnectReason } from 'livekit-client'

/**
 * Player-facing message for a LiveKit disconnect, or `null` when the disconnect
 * is expected and should stay silent (our own Leave). Never surfaces raw LiveKit
 * strings — connect-time errors are handled separately by the `onError` paths.
 *
 * Shared by both voice UIs (AudioChat + RoomVoiceRail) so the copy stays in one
 * place.
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
