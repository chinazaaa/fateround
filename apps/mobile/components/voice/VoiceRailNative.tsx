import { useEffect, useRef, useState } from 'react'
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
} from '@livekit/react-native'
import { LIVEKIT_URL } from '@/lib/config'
import { useVoiceRoom, type VoiceMode } from '@/hooks/useVoiceRoom'
import type { VoiceParticipant } from '@/lib/voice-types'
import { useToast } from '@/components/ui/Toast'

export type VoiceRailProps = {
  gameCode: string
  mode: VoiceMode
  hostToken?: string
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
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const [showList, setShowList] = useState(false)
  const people = mapParticipants(participants)
  const muted = !isMicrophoneEnabled

  return (
    <>
      <View style={styles.bar}>
        <Pressable
          style={[styles.mainBtn, muted ? styles.mainBtnMuted : styles.mainBtnLive]}
          onPress={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <Text style={styles.mainBtnText}>{muted ? '🔇 Unmute' : `🎙️ ${displayName}`}</Text>
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
  return (
    <View style={styles.bar}>
      <Pressable style={styles.joinBtn} disabled={isConnecting} onPress={onJoin}>
        <Text style={styles.joinText}>
          {isConnecting ? 'Connecting…' : `🎙️ Join voice${presenceCount > 0 ? ` · ${presenceCount} in call` : ''}`}
        </Text>
      </Pressable>
    </View>
  )
}

/** LiveKit voice UI — only loaded in dev/production builds, not Expo Go. */
export function VoiceRailNative({ gameCode, mode, hostToken }: VoiceRailProps) {
  const { show } = useToast()
  const voice = useVoiceRoom({ gameCode, mode, hostToken })
  const wasConnectedRef = useRef(false)

  useEffect(() => {
    if (voice.error) show(voice.error, 'error')
  }, [voice.error, show])

  useEffect(() => {
    if (voice.token) wasConnectedRef.current = true
  }, [voice.token])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if ((nextState === 'background' || nextState === 'inactive') && voice.token) {
        voice.leave()
      }
      if (nextState === 'active' && wasConnectedRef.current && !voice.token) {
        show('Voice disconnected while the app was in the background. Tap Join voice to reconnect.', 'info')
        wasConnectedRef.current = false
      }
    })
    return () => sub.remove()
  }, [voice.token, voice.leave, show])

  useEffect(() => {
    if (!voice.token) return
    void AudioSession.startAudioSession()
    return () => {
      void AudioSession.stopAudioSession()
    }
  }, [voice.token])

  if (!LIVEKIT_URL || !voice.ready) return null

  if (!voice.token) {
    return (
      <DisconnectedBar
        presenceCount={voice.isConnecting ? 0 : voice.presenceCount}
        isConnecting={voice.isConnecting}
        onJoin={() => void voice.join()}
      />
    )
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={voice.token}
      connect
      audio
      video={false}
      onDisconnected={() => voice.leave()}
    >
      <ConnectedControls
        displayName={voice.displayName}
        onLeave={voice.leave}
        presenceHint={voice.presenceCount}
      />
    </LiveKitRoom>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c24',
    backgroundColor: '#121218',
  },
  joinBtn: {
    flex: 1,
    backgroundColor: '#1c1c24',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  joinText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  mainBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  mainBtnLive: { borderColor: '#4ade80', backgroundColor: '#14532d33' },
  mainBtnMuted: { borderColor: '#f87171', backgroundColor: '#3f1d2b33' },
  mainBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a2a35',
    backgroundColor: '#1c1c24',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  leaveText: { color: '#fda4af', fontSize: 13, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 14,
  },
  modalTitle: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  modalEmpty: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  modalName: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  modalState: { fontSize: 16 },
  modalFoot: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
  },
})
