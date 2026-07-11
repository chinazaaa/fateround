import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { postConfession } from '@/components/games/poll/poll-api'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'

type Props = {
  gameCode: string
  resumeToken: string
  roundId: string | null
}

/** Leave one anonymous hot take per round (poster stays anonymous). */
export function ConfessionInput({ gameCode, resumeToken, roundId }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (sent) {
    return (
      <View style={styles.card}>
        <Text style={styles.sent}>Hot take sent anonymously 🔥</Text>
      </View>
    )
  }

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await postConfession(gameCode, resumeToken, roundId, trimmed)
      setSent(true)
    } catch {
      // Non-blocking — hot takes are best-effort.
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Leave an anonymous hot take (optional)</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Say something…"
          placeholderTextColor={theme.textFaint}
          value={text}
          onChangeText={setText}
          maxLength={280}
          editable={!busy}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
        />
        <Pressable style={[styles.send, !text.trim() && styles.sendDisabled]} disabled={!text.trim() || busy} onPress={() => void send()}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 8,
    },
    label: { color: theme.textFaint, fontSize: 12, textAlign: 'center' },
    sent: { color: theme.primaryMuted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    row: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      fontSize: 14,
    },
    send: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.45 },
    sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  })
