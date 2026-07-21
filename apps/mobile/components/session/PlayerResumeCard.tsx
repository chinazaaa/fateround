import { useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { playerResumeUrl } from '@/lib/game-links'
import { getPlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  resumeToken?: string | null
  compact?: boolean
}

export function PlayerResumeCard({ gameCode, resumeToken: resumeTokenProp, compact = false }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  // Our callers read the session once and pass the token down, so it goes stale when
  // the code is rotated from the share sheet. Track the stored one and prefer it.
  const [storedToken, setStoredToken] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const read = async () => {
      const session = await getPlayerSession(gameCode)
      if (active) setStoredToken(session?.resumeToken ?? null)
    }
    void read()
    const unsubscribe = subscribePlayerSession(gameCode, () => void read())
    return () => {
      active = false
      unsubscribe()
    }
  }, [gameCode])

  useEffect(() => {
    setRevealed(false)
  }, [storedToken])

  const resumeToken = storedToken ?? resumeTokenProp
  if (!resumeToken) return null

  const url = playerResumeUrl(gameCode, resumeToken)
  const maskedToken = resumeToken.slice(0, 2) + '••••'

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Text style={styles.compact}>
          Player code <Text style={styles.code}>{revealed ? resumeToken : maskedToken}</Text>
        </Text>
        <Pressable onPress={() => setRevealed((v) => !v)} hitSlop={8}>
          <Text style={styles.revealSmall}>{revealed ? 'Hide' : 'Reveal'}</Text>
        </Pressable>
      </View>
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
      <Pressable onPress={() => setRevealed((v) => !v)}>
        <Text style={styles.codeLarge}>{revealed ? resumeToken : maskedToken}</Text>
        <Text style={styles.revealHint}>{revealed ? 'Tap to hide' : 'Tap to reveal'}</Text>
      </Pressable>
      <Pressable style={styles.shareBtn} onPress={() => void onShare()}>
        <Text style={styles.shareText}>Share resume link</Text>
      </Pressable>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  compact: { color: theme.textFaint, fontSize: 12 },
  revealSmall: { color: theme.textFaint, fontSize: 11, fontWeight: '600' },
  revealHint: { color: theme.textFaint, fontSize: 12, textAlign: 'center' },
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
