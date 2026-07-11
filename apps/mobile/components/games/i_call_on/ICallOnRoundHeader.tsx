import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Round context header mirroring web's NpatActiveRound header card:
 * big letter, "Letter N · X letters left · Caller i of n", live seconds and the
 * reveal countdown. Purely presentational.
 */
export function ICallOnRoundHeader({
  roundNumber,
  letter,
  lettersLeft,
  callerName,
  callerIndex,
  callerCount,
  secondsLeft,
  showSeconds,
  revealSecondsLeft,
  showReveal,
}: {
  roundNumber: number
  letter: string | null
  lettersLeft: number
  callerName: string
  callerIndex: number | null
  callerCount: number
  secondsLeft: number | null
  showSeconds: boolean
  revealSecondsLeft: number | null
  showReveal: boolean
}) {
  const styles = useThemedStyles(makeStyles)

  const parts = [`Letter ${roundNumber}`]
  if (lettersLeft > 0) parts.push(`${lettersLeft} letter${lettersLeft === 1 ? '' : 's'} left`)
  if (callerCount > 1 && callerIndex != null) parts.push(`Caller ${callerIndex} of ${callerCount}`)

  return (
    <View style={styles.card}>
      <Text style={styles.caps}>{parts.join(' · ')}</Text>
      {letter ? (
        <Text style={styles.letter}>{letter}</Text>
      ) : (
        <Text style={styles.picks}>{callerName} picks the letter</Text>
      )}
      {showSeconds && secondsLeft != null ? <Text style={styles.seconds}>{secondsLeft}s left</Text> : null}
      {showReveal ? (
        <Text style={styles.reveal}>
          {revealSecondsLeft != null ? `Next letter in ${revealSecondsLeft}s…` : 'Next letter coming up…'}
        </Text>
      ) : null}
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
      padding: 16,
      alignItems: 'center',
      gap: 4,
    },
    caps: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    letter: { color: theme.primary, fontSize: 48, fontWeight: '900', lineHeight: 56 },
    picks: { color: theme.text, fontSize: 16, fontWeight: '700' },
    seconds: { color: theme.primary, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
    reveal: { color: theme.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  })
