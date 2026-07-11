import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Participant } from '@fateround/shared'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { apiUrl } from '@/lib/config'
import { getPlayerSession } from '@/lib/secure-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  participantId: string | null
  participant?: Participant | null
  onPhotoUpdated: (participantId: string, photoUrl: string | null) => void
}

export function ParticipantPhotoCard({ gameCode, participantId, participant, onPhotoUpdated }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [uploading, setUploading] = useState(false)

  const pickPhoto = useCallback(async () => {
    if (!participantId || uploading) return
    const session = await getPlayerSession(gameCode)
    if (!session?.resumeToken) return

    let ImagePicker: typeof import('expo-image-picker')
    try {
      ImagePicker = await import('expo-image-picker')
    } catch {
      return
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) return

    setUploading(true)
    try {
      const form = new FormData()
      form.append('gameId', gameCode.toUpperCase())
      form.append('participantId', participantId)
      form.append('resumeToken', session.resumeToken)
      form.append('file', {
        uri: asset.uri,
        name: 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob)

      const res = await fetch(apiUrl('/api/photos'), { method: 'POST', body: form })
      const data = (await res.json()) as { photoUrl?: string; error?: string }
      if (res.ok && data.photoUrl) {
        onPhotoUpdated(participantId, `${data.photoUrl}?t=${Date.now()}`)
      }
    } finally {
      setUploading(false)
    }
  }, [gameCode, participantId, uploading, onPhotoUpdated])

  const removePhoto = useCallback(async () => {
    if (!participantId || uploading) return
    const session = await getPlayerSession(gameCode)
    if (!session?.resumeToken) return
    setUploading(true)
    try {
      const res = await fetch(apiUrl('/api/photos'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode.toUpperCase(),
          participantId,
          resumeToken: session.resumeToken,
        }),
      })
      if (res.ok) onPhotoUpdated(participantId, null)
    } finally {
      setUploading(false)
    }
  }, [gameCode, participantId, uploading, onPhotoUpdated])

  if (!participantId || !participant) return null

  return (
    <View style={styles.card}>
      <ParticipantAvatar name={participant.name} photoUrl={participant.photo_url} size={56} highlight />
      <View style={styles.body}>
        <Text style={styles.title}>Profile photo</Text>
        <Text style={styles.hint}>Shows on voting cards this game</Text>
        <View style={styles.actions}>
          <Pressable style={styles.btn} onPress={() => void pickPhoto()} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>{participant.photo_url ? 'Change photo' : 'Add photo'}</Text>
            )}
          </Pressable>
          {participant.photo_url ? (
            <Pressable style={styles.secondaryBtn} onPress={() => void removePhoto()} disabled={uploading}>
              <Text style={styles.secondaryText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  body: { flex: 1, gap: 4 },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  hint: { color: theme.textFaint, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  // White on the solid rose button — correct in both schemes.
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryText: { color: theme.textMuted, fontWeight: '600', fontSize: 13 },
})
