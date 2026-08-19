import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Line, Path } from 'react-native-svg'
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

// Inline SVGs instead of emoji: U+1F399 (studio microphone) falls back to a
// monochrome text glyph — rendered as a dark dot — on many Android builds when
// the containing Text has explicit color/weight. SVG paths sidestep the
// emoji font entirely.
function MicIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill={color} />
      <Path
        d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11Z"
        fill={color}
      />
    </Svg>
  )
}

function MicOffIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill={color} />
      <Path
        d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11Z"
        fill={color}
      />
      <Line x1="3" y1="3" x2="21" y2="21" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

function PeopleIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 2c-3.31 0-6 1.79-6 4v2h12v-2c0-2.21-2.69-4-6-4Zm7 .5c-.86 0-1.66.12-2.36.34 1.15.86 1.86 2.01 1.86 3.16V19h6v-1.75c0-2.07-2.46-3.75-5.5-3.75Z"
        fill={color}
      />
    </Svg>
  )
}

function SpeakingIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill={color} />
      <Path
        d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11Z"
        fill={color}
      />
      <Path d="M2 9 Q0 12 2 15" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Path d="M22 9 Q24 12 22 15" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </Svg>
  )
}

function CrownIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 7l4 4 5-6 5 6 4-4v10H3V7z" fill={color} />
    </Svg>
  )
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
          <View style={styles.iconWrap}>
            {muted ? (
              <MicOffIcon color={styles.mainBtnText.color as string} />
            ) : (
              <MicIcon color={styles.mainBtnText.color as string} />
            )}
          </View>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => setShowList(true)}>
          <View style={styles.iconRow}>
            <PeopleIcon color={styles.secondaryText.color as string} size={16} />
            <Text style={styles.secondaryText}>{people.length || presenceHint}</Text>
          </View>
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
                  <View style={styles.modalNameWrap}>
                    <Text style={styles.modalName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.host ? <CrownIcon color={styles.modalName.color as string} size={12} /> : null}
                  </View>
                  {p.muted ? (
                    <MicOffIcon color={styles.modalName.color as string} size={16} />
                  ) : p.talking ? (
                    <SpeakingIcon color={styles.modalName.color as string} size={16} />
                  ) : (
                    <MicIcon color={styles.modalName.color as string} size={16} />
                  )}
                </View>
              ))
            )}
            <View style={styles.modalFootRow}>
              <MicIcon color={styles.modalFoot.color as string} size={12} />
              <Text style={styles.modalFoot}>live</Text>
              <SpeakingIcon color={styles.modalFoot.color as string} size={12} />
              <Text style={styles.modalFoot}>talking</Text>
              <MicOffIcon color={styles.modalFoot.color as string} size={12} />
              <Text style={styles.modalFoot}>muted</Text>
            </View>
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
      <Pressable
        style={[styles.joinBtn, isConnecting && styles.joinBtnConnecting]}
        disabled={isConnecting}
        onPress={onJoin}
        accessibilityRole="button"
        accessibilityLabel={
          isConnecting
            ? 'Connecting to voice'
            : `Join voice chat${presenceCount > 0 ? `, ${presenceCount} in call` : ''}`
        }
      >
        {isConnecting ? (
          <ActivityIndicator size="small" color={styles.joinText.color as string} />
        ) : (
          <View style={styles.iconRow}>
            <MicIcon color={styles.joinText.color as string} size={18} />
            {presenceCount > 0 ? <Text style={styles.joinCount}>{presenceCount}</Text> : null}
          </View>
        )}
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

/**
 * Absolute-positioned wrapper the player can drag anywhere on screen when the
 * pill is blocking something (a card, a control, a timer). Taps still pass
 * through to the buttons inside — the pan responder only takes over once the
 * finger moves past a small threshold, so short taps hit the underlying
 * Pressables. On release, the pill is clamped back on-screen so it can't be
 * lost off an edge.
 */
function DraggableFloat({ bottomOffset, children }: { bottomOffset: number; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles)
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const sizeRef = useRef({ w: 0, h: 0 })
  const posRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const id = pan.addListener((v) => {
      posRef.current = { x: v.x, y: v.y }
    })
    return () => pan.removeListener(id)
  }, [pan])

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only claim the gesture once the finger has moved past a few pixels, so a
      // simple tap on the mic / participants / leave button still reaches the
      // underlying Pressable.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        pan.extractOffset()
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset()
        const win = Dimensions.get('window')
        const { w, h } = sizeRef.current
        // Origin is right:12 / bottom: 16+bottomOffset. Positive x pushes right
        // off-screen, negative left; positive y pushes down off-screen, negative
        // up. Clamp so at least a bit of the pill stays visible on every edge.
        const minX = -(win.width - w - 24)
        const maxX = 0
        const minY = -(win.height - h - (16 + bottomOffset) - 24)
        const maxY = 16 + bottomOffset - 24
        const cx = Math.max(minX, Math.min(maxX, posRef.current.x))
        const cy = Math.max(minY, Math.min(maxY, posRef.current.y))
        Animated.spring(pan, { toValue: { x: cx, y: cy }, useNativeDriver: false, bounciness: 6 }).start()
      },
    })
  ).current

  return (
    <Animated.View
      style={[styles.floatWrap, { bottom: 16 + bottomOffset, transform: pan.getTranslateTransform() }]}
      onLayout={(e) => {
        sizeRef.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }
      }}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
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
  // itself takes touches — the game underneath stays fully interactive. And
  // draggable: if the pill blocks a card / control / timer, the player can
  // move it anywhere on screen.
  //
  // No safe-area inset here: every shell that mounts this wraps in
  // <SafeAreaView edges={['top','bottom']}>, and absolute children position
  // against the parent's PADDING box — the bottom inset is already applied, so
  // adding it again would float the pill above the home indicator.
  const floating = (children: React.ReactNode) => (
    <DraggableFloat bottomOffset={bottomOffset}>{children}</DraggableFloat>
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
    // Icon-only circular action — the mic icon on its own reads as "join voice",
    // no label needed. Sized to comfortably fit a fingertip.
    joinBtn: {
      flexDirection: 'row',
      gap: 6,
      backgroundColor: theme.primary,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // White on the solid primary pill — legible in both schemes.
    joinText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    // Tiny count of active voice participants shown next to the mic icon.
    joinCount: { color: '#fff', fontSize: 12, fontWeight: '800' },
    // Slight dim while a connect attempt is in flight so the pill visibly
    // reads as "busy" alongside the disabled Pressable + spinner.
    joinBtnConnecting: { opacity: 0.7 },
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
    iconWrap: { alignItems: 'center', justifyContent: 'center' },
    iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    modalNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    modalName: { color: theme.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    modalState: { fontSize: 16 },
    modalFootRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    modalFoot: {
      color: theme.textFaint,
      fontSize: 11,
      textAlign: 'center',
    },
  })
