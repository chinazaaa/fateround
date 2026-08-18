import { useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MEDALS = ['👑', '🥈', '🥉']

export type ScrabbleShareStanding = {
  playerId: string
  name: string
  score: number
  rank: number
}

type Props = {
  standings: ScrabbleShareStanding[]
  winnerName: string | null
  isTie: boolean
  endedEarly: boolean
  highlightPlayerId?: string | null
  /** Hide the winner hero/title on the visible card (when a parent already shows it). */
  hideHeader?: boolean
}

/**
 * Bespoke Scrabble final-results card — the mobile counterpart of the web
 * `ScrabbleFinalResultsShareBlock`. Shows the winner hero plus a ranked
 * standings with every player's final score, and a dedicated button that
 * snapshots a light branded copy of the card to a PNG for image sharing
 * (falling back to text if capture/share fails).
 */
export function ScrabbleShareCard({ standings, winnerName, isTie, endedEarly, highlightPlayerId, hideHeader }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const hero = isTie ? '🤝' : endedEarly ? '🏁' : '🏆'
  const heroTitle = isTie
    ? "It's a tie!"
    : endedEarly
      ? 'Game ended early'
      : winnerName
        ? `${winnerName} wins!`
        : 'Game over'

  const shareText = buildShareText(standings, heroTitle)

  const onShare = async () => {
    try {
      const uri = await captureRef(captureCardRef, { format: 'png', quality: 1 })
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message: shareText })
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share results' })
      } else {
        await Share.share({ message: shareText })
      }
    } catch {
      try {
        await Share.share({ message: shareText })
      } catch {
        toastError('Could not share results')
      }
    }
  }

  return (
    <View style={styles.wrap}>
      {/* Visible, theme-aware tailored card. */}
      <View style={styles.card}>
        {hideHeader ? null : (
          <>
            <Text style={styles.hero}>{hero}</Text>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
          </>
        )}
        <View style={styles.standings}>
          {standings.map((row) => {
            const isWinner = !isTie && !endedEarly && row.rank === 1
            const isMe = row.playerId === highlightPlayerId
            return (
              <View key={row.playerId} style={[styles.row, isWinner && styles.rowWinner]}>
                <Text style={styles.rank}>{MEDALS[row.rank - 1] ?? String(row.rank)}</Text>
                <View style={styles.rowText}>
                  <Text style={[styles.name, isWinner && styles.nameWinner]} numberOfLines={1}>
                    {row.name}
                    {isMe ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                </View>
                <Text style={[styles.value, isWinner && styles.valueWinner]}>{row.score}</Text>
              </View>
            )
          })}
        </View>
      </View>

      <AppButton label="Share results card" variant="secondary" onPress={() => void onShare()} />

      {/* Off-screen light-themed copy captured to a shareable image. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={captureCardRef} collapsable={false} style={styles.captureCard}>
          <Text style={styles.captureEmoji}>🔤</Text>
          <Text style={styles.captureGame}>Word Tiles</Text>
          <View style={styles.captureDivider} />
          <Text style={styles.captureHero}>{hero}</Text>
          <Text style={styles.captureTitle}>{heroTitle}</Text>
          <View style={styles.captureStandings}>
            {standings.slice(0, 6).map((row) => {
              const isWinner = !isTie && !endedEarly && row.rank === 1
              return (
                <View key={row.playerId} style={[styles.captureRow, isWinner && styles.captureRowWinner]}>
                  <Text style={styles.captureRank}>{MEDALS[row.rank - 1] ?? String(row.rank)}</Text>
                  <View style={styles.rowText}>
                    <Text style={[styles.captureName, isWinner && styles.captureNameWinner]} numberOfLines={1}>
                      {row.name}
                    </Text>
                  </View>
                  <Text style={[styles.captureValue, isWinner && styles.captureValueWinner]}>{row.score}</Text>
                </View>
              )
            })}
          </View>
          <Text style={styles.captureBrand}>{shareDomain()}</Text>
        </View>
      </View>
    </View>
  )
}

function buildShareText(standings: ScrabbleShareStanding[], heroTitle: string): string {
  const lines: string[] = ['Word Tiles', '', heroTitle]
  if (standings.length > 0) {
    lines.push('', 'Final scores:')
    standings.slice(0, 8).forEach((row) => {
      lines.push(`  ${row.rank}. ${row.name} — ${row.score}`)
    })
  }
  lines.push('', `Play at ${shareDomain()}`)
  return lines.join('\n')
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.lg,
      alignItems: 'center',
      gap: 6,
    },
    hero: { fontSize: 40 },
    heroTitle: { color: theme.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
    standings: { width: '100%', gap: 8, marginTop: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: theme.surfaceHover,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowWinner: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    rank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '900', color: theme.textMuted },
    rowText: { flex: 1, gap: 1 },
    name: { color: theme.text, fontSize: 15, fontWeight: '700' },
    nameWinner: { fontSize: 16, fontWeight: '900' },
    you: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    value: { color: theme.textMuted, fontSize: 14, fontWeight: '800' },
    valueWinner: { color: theme.primaryMuted, fontSize: 15, fontWeight: '900' },
    // Off-screen light capture card — fixed light palette for a consistent
    // shareable image regardless of the viewer's theme.
    offscreen: { position: 'absolute', left: -10000, top: 0 },
    captureCard: {
      width: 340,
      backgroundColor: '#ffffff',
      borderRadius: 24,
      paddingVertical: 32,
      paddingHorizontal: 24,
      alignItems: 'center',
      gap: 6,
    },
    captureEmoji: { fontSize: 40 },
    captureGame: { color: '#e11d48', fontSize: 24, fontWeight: '900', textAlign: 'center' },
    captureDivider: { height: 1, width: '70%', backgroundColor: '#f1e0e4', marginVertical: 14 },
    captureHero: { fontSize: 48, marginBottom: 4 },
    captureTitle: { color: '#0b0b0f', fontSize: 26, fontWeight: '900', textAlign: 'center' },
    captureStandings: { width: '100%', gap: 8, marginTop: 18 },
    captureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#eee',
      backgroundColor: '#f7f7fa',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    captureRowWinner: { borderColor: '#f43f5e', backgroundColor: '#fdeef1' },
    captureRank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '900', color: '#6b7280' },
    captureName: { color: '#1a1a1a', fontSize: 15, fontWeight: '700', flex: 1 },
    captureNameWinner: { color: '#0b0b0f', fontSize: 16, fontWeight: '900' },
    captureValue: { color: '#6b7280', fontSize: 14, fontWeight: '800' },
    captureValueWinner: { color: '#e11d48', fontSize: 15, fontWeight: '900' },
    captureBrand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 22 },
  })
