import { DisconnectReason } from 'livekit-client'

/**
 * Player-facing message for a LiveKit disconnect, or `null` when the disconnect
 * is expected and should stay silent (our own Leave).
 *
 * Deliberately NOT hoisted into `@fateround/shared` alongside the web twin at
 * `src/lib/voice-errors.ts` (the apps do share code — 46 game views import that
 * package). The *policy* — which reasons are silent — is identical, but the
 * copy is intentionally platform-specific: there are no tabs here, and this is
 * a touch UI ("Tap Join voice", not "Join voice again"). Sharing one function
 * would force web's wording onto mobile and make it wrong. Keep the two switches
 * in step by hand; if the policy ever grows past this, share the *classification*
 * (reason → kind) and let each app own its strings.
 *
 * INVARIANT — if you ever add an `onError` to <LiveKitRoom> here, it must stay
 * silent for a teardown we initiated. LiveKit's internal `shouldConnect` guard
 * only clears when the `connect` prop flips false; we unmount instead (token →
 * null), so the cancelled connect lands on `onError` looking like a real
 * failure. That shipped a bogus "Could not connect to voice chat" on web — see
 * the `leavingRef` guard in `src/components/AudioChat.tsx`.
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
