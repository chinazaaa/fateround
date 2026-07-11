import { useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { playerResumeUrl } from '@/lib/game-links'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  resumeToken?: string | null
  compact?: boolean
}

export function PlayerResumeCard({ gameCode, resumeToken, compact = false }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  if (!resumeToken) return null

  const url = playerResumeUrl(gameCode, resumeToken)

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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  compact: { color: theme.textFaint, fontSize: 12 },
  code: { color: theme.textSecondary, fontWeight: '700', letterSpacing: 2 },
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  collapsedEmoji: { fontSize: 22 },
  collapsedText: { flex: 1 },
  collapsedTitle: { color: theme.text, fontSize: 14, fontWeight: '600' },
  collapsedSub: { color: theme.textFaint, fontSize: 12, marginTop: 2 },
  chevron: { color: theme.textFaint, fontSize: 22 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  close: { color: theme.textMuted, fontSize: 13 },
  cardHint: { color: theme.textFaint, fontSize: 12 },
  codeLarge: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 8,
  },
  shareBtn: {
    backgroundColor: theme.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareText: { color: theme.text, fontWeight: '600' },
})
