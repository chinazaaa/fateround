import { useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { gameWebUrl } from '@/lib/config'

type Props = {
  gameCode: string
  resumeToken?: string | null
  compact?: boolean
}

export function PlayerResumeCard({ gameCode, resumeToken, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  if (!resumeToken) return null

  const url = `${gameWebUrl(gameCode)}?resumeToken=${encodeURIComponent(resumeToken)}`

  if (compact) {
    return (
      <Text style={styles.compact}>
        Player code <Text style={styles.code}>{resumeToken}</Text>
      </Text>
    )
  }

  if (!open) {
    return (
      <Pressable style={styles.collapsed} onPress={() => setOpen(true)}>
        <Text style={styles.collapsedEmoji}>📱</Text>
        <View style={styles.collapsedText}>
          <Text style={styles.collapsedTitle}>Continue on another device</Text>
          <Text style={styles.collapsedSub}>Get a code to switch phone or laptop</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    )
  }

  const onShare = async () => {
    try {
      await Share.share({
        message: `Continue my Fate Round game — code ${gameCode.toUpperCase()}\nPlayer code: ${resumeToken}\n${url}`,
      })
    } catch {
      // dismissed
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Continue on another device</Text>
        <Pressable onPress={() => setOpen(false)}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.cardHint}>Save this code or link to pick up where you left off.</Text>
      <Text style={styles.codeLarge}>{resumeToken}</Text>
      <Pressable style={styles.shareBtn} onPress={() => void onShare()}>
        <Text style={styles.shareText}>Share resume link</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  compact: { color: '#6b7280', fontSize: 12 },
  code: { color: '#d1d5db', fontWeight: '700', letterSpacing: 2 },
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 14,
  },
  collapsedEmoji: { fontSize: 22 },
  collapsedText: { flex: 1 },
  collapsedTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  collapsedSub: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  chevron: { color: '#6b7280', fontSize: 22 },
  card: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 16,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  close: { color: '#9ca3af', fontSize: 13 },
  cardHint: { color: '#6b7280', fontSize: 12 },
  codeLarge: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 8,
  },
  shareBtn: {
    backgroundColor: '#2a2a35',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareText: { color: '#fff', fontWeight: '600' },
})
