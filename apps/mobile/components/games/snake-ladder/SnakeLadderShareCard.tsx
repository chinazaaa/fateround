import { useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import {
  SNAKE_LADDER_COLOR_HEX,
  SNAKE_LADDER_COLOR_LABELS,
  type SnakeLadderStanding,
} from '@fateround/shared/snake-and-ladder'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MEDALS = ['👑', '🥈', '🥉']

type Props = {
  standings: SnakeLadderStanding[]
  winnerName: string | null
  endedEarly: boolean
  highlightPlayerId?: string | null
  /**
   * Hide the visible card's own winner hero/title. Used when the surrounding
   * finish panel already shows the "X wins!" header, so we don't announce the
   * winner twice. The off-screen share image keeps its own hero regardless.
   */
  hideHeader?: boolean
}

/**
 * Bespoke Snake & Ladder final-results card — the mobile counterpart of the web
 * `SnakeLadderFinalResultsShareBlock`. Shows the winner hero plus a
 * color-labelled ranked standings with every player's finishing square, and a
 * dedicated button that snapshots a light branded copy of the card to a PNG for
 * image sharing (falling back to text if capture/share fails).
 */
export function SnakeLadderShareCard({ standings, winnerName, endedEarly, highlightPlayerId, hideHeader }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const winnerId = standings.find((row) => row.name === winnerName)?.playerId ?? null

  const shareText = buildShareText(standings, winnerName, endedEarly)

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
            <Text style={styles.hero}>{endedEarly ? '🏁' : '🏆'}</Text>
            <Text style={styles.heroTitle}>
              {endedEarly ? 'Game ended early' : winnerName ? `${winnerName} wins!` : 'Game over'}
            </Text>
          </>
        )}
        <View style={styles.standings}>
          {standings.map((row) => {
            const isWinner = winnerId ? row.playerId === winnerId : false
            const isMe = row.playerId === highlightPlayerId
            return (
              <View key={row.playerId} style={[styles.row, isWinner && styles.rowWinner]}>
                <Text style={styles.rank}>{MEDALS[row.rank - 1] ?? String(row.rank)}</Text>
                <View style={[styles.dot, { backgroundColor: SNAKE_LADDER_COLOR_HEX[row.color] }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.name, isWinner && styles.nameWinner]} numberOfLines={1}>
                    {row.name}
                    {isMe ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                  <Text style={styles.detail}>
                    {SNAKE_LADDER_COLOR_LABELS[row.color]} · square {row.position}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      <AppButton label="Share results card" variant="secondary" onPress={() => void onShare()} />

      {/* Off-screen light-themed copy captured to a shareable image. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={captureCardRef} collapsable={false} style={styles.captureCard}>
          <Text style={styles.captureEmoji}>🎲</Text>
          <Text style={styles.captureGame}>Snake & Ladder</Text>
          <View style={styles.captureDivider} />
          <Text style={styles.captureHero}>{endedEarly ? '🏁' : '🏆'}</Text>
          <Text style={styles.captureTitle}>
            {endedEarly ? 'Game ended early' : winnerName ? `${winnerName} wins!` : 'Game over'}
          </Text>
          <View style={styles.captureStandings}>
            {standings.slice(0, 6).map((row) => {
              const isWinner = winnerId ? row.playerId === winnerId : false
              return (
                <View key={row.playerId} style={[styles.captureRow, isWinner && styles.captureRowWinner]}>
                  <Text style={styles.captureRank}>{MEDALS[row.rank - 1] ?? String(row.rank)}</Text>
                  <View style={[styles.dot, { backgroundColor: SNAKE_LADDER_COLOR_HEX[row.color] }]} />
                  <View style={styles.rowText}>
                    <Text style={[styles.captureName, isWinner && styles.captureNameWinner]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.captureDetail}>
                      {SNAKE_LADDER_COLOR_LABELS[row.color]} · square {row.position}
                    </Text>
                  </View>
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

function buildShareText(
  standings: SnakeLadderStanding[],
  winnerName: string | null,
  endedEarly: boolean
): string {
  const lines: string[] = ['Snake & Ladder', '']
  lines.push(endedEarly ? '🏁 Game ended early' : winnerName ? `🏆 ${winnerName} wins!` : '🏁 Game over')
  if (standings.length > 0) {
    lines.push('', 'Final standings:')
    standings.slice(0, 8).forEach((row) => {
      lines.push(`  ${row.rank}. ${row.name} — ${SNAKE_LADDER_COLOR_LABELS[row.color]} · square ${row.position}`)
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
    dot: { width: 14, height: 14, borderRadius: 7 },
    rowText: { flex: 1, gap: 1 },
    name: { color: theme.text, fontSize: 15, fontWeight: '700' },
    nameWinner: { fontSize: 16, fontWeight: '900' },
    you: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    detail: { color: theme.textMuted, fontSize: 11 },
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
    captureName: { color: '#1a1a1a', fontSize: 15, fontWeight: '700' },
    captureNameWinner: { color: '#0b0b0f', fontSize: 16, fontWeight: '900' },
    captureDetail: { color: '#9ca3af', fontSize: 11 },
    captureBrand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 22 },
  })
