import { DisconnectReason } from 'livekit-client'

/**
 * Player-facing message for a LiveKit disconnect, or `null` when the disconnect
 * is expected and should stay silent (our own Leave). Mirrors the web helper at
 * `src/lib/voice-errors.ts`; kept separate because the two apps don't share code.
 */
export function voiceDisconnectMessage(reason?: DisconnectReason): string | null {
  switch (reason) {
    // The user tapped Leave (token cleared → room unmounts) — nothing to say.
    case DisconnectReason.CLIENT_INITIATED:
      return null
    // Another tab/device joined with the same identity and took the call over.
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Voice chat is now active on another device.'
    // Signalling connected but the media path (WebRTC/UDP) never established —
    // almost always a firewall/VPN on the current network blocking calls.
    case DisconnectReason.CONNECTION_TIMEOUT:
    case DisconnectReason.MEDIA_FAILURE:
      return "Voice chat couldn't connect on this network — it may be blocking calls. Try a different network or turn off any VPN."
    default:
      return 'Voice chat disconnected. Tap Join voice to reconnect.'
  }
}
