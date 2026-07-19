import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { AudioSession, LiveKitRoom, useLocalParticipant, useParticipants } from '@livekit/react-native'
import type { DisconnectReason } from 'livekit-client'
import { voiceDisconnectKind, voiceDisconnectMessage } from '@/lib/voice-errors'
import { LIVEKIT_URL } from '@/lib/config'
import { useVoiceRoom, type VoiceMode } from '@/hooks/useVoiceRoom'
import type { VoiceParticipant } from '@/lib/voice-types'
import { useToast } from '@/components/ui/Toast'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type VoiceRailProps = {
  gameCode: string
  mode: VoiceMode
  hostToken?: string
  /**
   * Extra bottom clearance, for screens with their own pinned bottom bar (the
   * host lobby's Start game / End lobby footer). Measure it rather than
   * hardcoding a height — the footer grows when it shows an error.
   */
  bottomOffset?: number
}

function mapParticipants(participants: ReturnType<typeof useParticipants>): VoiceParticipant[] {
  return participants.map((p) => ({
    id: p.identity,
    name: p.name || p.identity,
    host: p.identity.startsWith('host-'),
    talking: p.isSpeaking,
    muted: !p.isMicrophoneEnabled,
  }))
}

function ConnectedControls({
  displayName,
  onLeave,
  presenceHint,
}: {
  displayName: string
  onLeave: () => void
  presenceHint: number
}) {
  const styles = useThemedStyles(makeStyles)
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const [showList, setShowList] = useState(false)
  const people = mapParticipants(participants)
  const muted = !isMicrophoneEnabled

  return (
    <>
      <View style={styles.pill}>
        <Pressable
          style={[styles.mainBtn, muted ? styles.mainBtnMuted : styles.mainBtnLive]}
          onPress={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <Text style={styles.mainBtnText}>{muted ? '🔇' : '🎙️'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => setShowList(true)}>
          <Text style={styles.secondaryText}>👥 {people.length || presenceHint}</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onLeave}>
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
      </View>

      <Modal visible={showList} transparent animationType="fade" onRequestClose={() => setShowList(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowList(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>In voice · {displayName}</Text>
            {people.length === 0 ? (
              <Text style={styles.modalEmpty}>No participants yet</Text>
            ) : (
              people.map((p) => (
                <View key={p.id} style={styles.modalRow}>
                  <Text style={styles.modalName}>
                    {p.name}
                    {p.host ? ' 👑' : ''}
                  </Text>
                  <Text style={styles.modalState}>{p.muted ? '🔇' : p.talking ? '🗣️' : '🎙️'}</Text>
                </View>
              ))
            )}
            <Text style={styles.modalFoot}>🎙️ live · 🗣️ talking · 🔇 muted</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

function DisconnectedBar({
  presenceCount,
  isConnecting,
  onJoin,
}: {
  presenceCount: number
  isConnecting: boolean
  onJoin: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.pill}>
      <Pressable style={styles.joinBtn} disabled={isConnecting} onPress={onJoin}>
        <Text style={styles.joinText}>
          {isConnecting ? 'Connecting…' : `🎙️ Join voice${presenceCount > 0 ? ` · ${presenceCount}` : ''}`}
        </Text>
      </Pressable>
    </View>
  )
}

function ReconnectingBar({ onCancel }: { onCancel: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.pill}>
      <View style={styles.joinBtn}>
        <Text style={styles.joinText}>Reconnecting…</Text>
      </View>
      <Pressable style={styles.secondaryBtn} onPress={onCancel}>
        <Text style={styles.leaveText}>Leave</Text>
      </Pressable>
    </View>
  )
}

/** LiveKit voice UI — only loaded in dev/production builds, not Expo Go. */
export function VoiceRailNative({ gameCode, mode, hostToken, bottomOffset = 0 }: VoiceRailProps) {
  const { show } = useToast()
  const styles = useThemedStyles(makeStyles)
  const voice = useVoiceRoom({ gameCode, mode, hostToken })

  useEffect(() => {
    if (voice.error) show(voice.error, 'error')
  }, [voice.error, show])

  // Voice intentionally stays connected while the app is backgrounded — the
  // mic/audio keeps running so you can talk while looking at another app or
  // with the screen locked. This relies on the iOS `audio` UIBackgroundMode
  // (app.json) and the Android media-playback foreground-service permissions.
  // A genuine drop (network/takeover) is still surfaced by LiveKitRoom's
  // onDisconnected below, so we no longer tear voice down on AppState changes.
  useEffect(() => {
    if (!voice.token) return
    void AudioSession.startAudioSession()
    return () => {
      void AudioSession.stopAudioSession()
    }
  }, [voice.token])

  if (!LIVEKIT_URL || !voice.ready) return null

  // Floats over the screen (Toast's pattern) rather than sitting in the layout:
  // an in-flow bar cost ~50pt of vertical space on EVERY game screen, which is
  // why voice used to be gated to an allowlist. `box-none` so only the pill
  // itself takes touches — the game underneath stays fully interactive.
  //
  // No safe-area inset here: every shell that mounts this wraps in
  // <SafeAreaView edges={['top','bottom']}>, and absolute children position
  // against the parent's PADDING box — the bottom inset is already applied, so
  // adding it again would float the pill above the home indicator.
  const floating = (children: React.ReactNode) => (
    <View style={[styles.floatWrap, { bottom: 16 + bottomOffset }]} pointerEvents="box-none">
      {children}
    </View>
  )

  if (!voice.token) {
    // Between reconnect attempts (no live token yet) — hold the Reconnecting…
    // pill instead of dropping to Join, so a brief blip stays seamless.
    if (voice.reconnecting) return floating(<ReconnectingBar onCancel={voice.leave} />)
    return floating(
      <DisconnectedBar
        presenceCount={voice.isConnecting ? 0 : voice.presenceCount}
        isConnecting={voice.isConnecting}
        onJoin={() => void voice.join()}
      />
    )
  }

  return floating(
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={voice.token}
      connect
      audio
      video={false}
      onConnected={() => voice.reconnected()}
      onDisconnected={(reason?: DisconnectReason) => {
        const kind = voiceDisconnectKind(reason)
        // Transient drop (network blip): retry silently within the grace window
        // rather than flipping straight back to the Join button.
        if (kind === 'retry') {
          voice.beginReconnect()
          return
        }
        voice.leave()
        // Surface a fatal reason (firewall/timeout, takeover) — except our own Leave.
        const message = voiceDisconnectMessage(reason)
        if (message) show(message, 'error')
      }}
    >
      {voice.reconnecting ? (
        <ReconnectingBar onCancel={voice.leave} />
      ) : (
        <ConnectedControls displayName={voice.displayName} onLeave={voice.leave} presenceHint={voice.presenceCount} />
      )}
    </LiveKitRoom>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Anchored to the shell root (NOT a scroll body — it would scroll away).
    // zIndex sits below Toast's 100 so toasts still render above the pill.
    floatWrap: {
      position: 'absolute',
      right: 12,
      zIndex: 90,
      alignItems: 'flex-end',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.surfaceHover,
      backgroundColor: theme.bgElevated,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 4,
    },
    // Filled primary pill so "Join voice" reads as a clear call-to-action rather
    // than blending into the toolbar as a plain grey circle.
    joinBtn: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      backgroundColor: theme.primary,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // White on the solid primary pill — legible in both schemes.
    joinText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    mainBtn: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: 'center',
    },
    // Translucent state fills kept (semantic green/rose wash); borders use the
    // success/error roles.
    mainBtnLive: { borderColor: theme.success, backgroundColor: '#14532d33' },
    mainBtnMuted: { borderColor: theme.error, backgroundColor: '#3f1d2b33' },
    // alignSelf:'stretch' + textAlign:'center' — RN New Arch clips a lone emoji
    // glyph inside a flexed Text to nothing (the mic button showed blank white).
    mainBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
      alignSelf: 'stretch',
      textAlign: 'center',
    },
    secondaryBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    secondaryText: { color: theme.text, fontSize: 13, fontWeight: '700' },
    leaveText: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    modalBackdrop: {
      flex: 1,
      // Dark scrim over the app — intentional in both schemes.
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    modalTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    modalEmpty: { color: theme.textMuted, fontSize: 14, marginBottom: 8 },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    modalName: { color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 },
    modalState: { fontSize: 16 },
    modalFoot: {
      color: theme.textFaint,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
  })
