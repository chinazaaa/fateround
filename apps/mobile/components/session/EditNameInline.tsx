import { useCallback, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { patchPlayerName } from '@/lib/game-api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { notifyPlayerSessionChanged } from '@/lib/session-events'
import { useToast } from '@/components/ui/Toast'

type Props = {
  gameCode: string
  playerId: string
  currentName: string
  onRenamed: (newName: string) => void
  spectating?: boolean
  /** Open straight into the text field (e.g. from session menu). */
  startEditing?: boolean
}

export function EditNameInline({
  gameCode,
  playerId,
  currentName,
  onRenamed,
  spectating = false,
  startEditing = false,
}: Props) {
  const { success, error: toastError } = useToast()
  const [editing, setEditing] = useState(startEditing)
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === currentName) {
      setEditing(false)
      return
    }
    const existing = await getPlayerSession(gameCode)
    if (!existing?.resumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSaving(true)
    try {
      const data = await patchPlayerName(gameCode, playerId, trimmed, existing.resumeToken)
      await setPlayerSession(gameCode, playerId, data.playerName, existing.playerGender, existing.resumeToken)
      notifyPlayerSessionChanged(gameCode)
      onRenamed(data.playerName)
      setName(data.playerName)
      setEditing(false)
      success('Name updated!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <View style={styles.viewRow}>
        <Text style={styles.label}>
          {spectating ? 'Watching as' : 'Playing as'}{' '}
          <Text style={styles.strong}>{currentName}</Text>
        </Text>
        <Pressable onPress={() => { setName(currentName); setEditing(true) }}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.editRow}>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={40}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
      />
      <Pressable style={[styles.saveBtn, (saving || !name.trim()) && styles.btnDisabled]} onPress={() => void save()} disabled={saving || !name.trim()}>
        <Text style={styles.saveText}>{saving ? '…' : 'Save'}</Text>
      </Pressable>
      <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  viewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { color: '#9ca3af', fontSize: 14, flex: 1 },
  strong: { color: '#fff', fontWeight: '700' },
  editLink: { color: '#fda4af', textDecorationLine: 'underline', fontSize: 13 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 10,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveBtn: { backgroundColor: '#f43f5e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  cancelText: { color: '#9ca3af', fontSize: 13 },
  btnDisabled: { opacity: 0.6 },
})
