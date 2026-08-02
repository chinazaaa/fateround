import { useMemo, useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { YahtzeePlayerScore } from '@fateround/shared'
import { YAHTZEE_UPPER_BONUS_POINTS, totalScore, upperBonus, upperScore } from '@fateround/shared/yahtzee'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MEDALS = ['👑', '🥈', '🥉']

type Row = {
  playerId: string
  name: string
  total: number
  upper: number
  bonus: number
}

type Props = {
  scores: YahtzeePlayerScore[]
  players: { id: string; name: string }[]
  winnerName: string | null
  highlightPlayerId?: string | null
  /** Hide the winner hero/title on the visible card (when a parent already shows it). */
  hideHeader?: boolean
}

/**
 * Bespoke Yahtzee final-results card — the mobile counterpart of the web
 * `YahtzeeFinalResultsShareBlock` / `YahtzeeLeaderboard`. Shows the winner hero
 * plus a ranked scorecard with every player's grand total (and an upper-bonus
 * badge for anyone who cleared it), and a dedicated button that snapshots a
 * fixed light-themed copy to a PNG for image sharing (text fallback if capture
 * or share fails).
 */
export function YahtzeeShareCard({ scores, players, winnerName, highlightPlayerId, hideHeader }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const rows = useMemo<Row[]>(() => {
    return scores
      .map((s) => ({
        playerId: s.player_id,
        name: players.find((p) => p.id === s.player_id)?.name ?? 'Player',
        total: totalScore(s.scores.categories, s.scores.bonusYahtzees),
        upper: upperScore(s.scores.categories),
        bonus: upperBonus(s.scores.categories),
      }))
      .sort((a, b) => b.total - a.total)
  }, [scores, players])

  const winnerId = rows.find((r) => r.name === winnerName)?.playerId ?? rows[0]?.playerId ?? null

  const shareText = useMemo(() => buildShareText(rows, winnerName), [rows, winnerName])

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
            <Text style={styles.hero}>🏆</Text>
            <Text style={styles.heroTitle}>{winnerName ? `${winnerName} wins!` : 'Game over'}</Text>
          </>
        )}
        <View style={styles.standings}>
          {rows.map((row, index) => {
            const isWinner = winnerId ? row.playerId === winnerId : index === 0
            const isMe = row.playerId === highlightPlayerId
            return (
              <View key={row.playerId} style={[styles.row, isWinner && styles.rowWinner]}>
                <Text style={styles.rank}>{MEDALS[index] ?? String(index + 1)}</Text>
                <View style={styles.rowText}>
                  <Text style={[styles.name, isWinner && styles.nameWinner]} numberOfLines={1}>
                    {row.name}
                    {isMe ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                  {row.bonus > 0 ? <Text style={styles.detail}>Upper +{YAHTZEE_UPPER_BONUS_POINTS} bonus</Text> : null}
                </View>
                <Text style={[styles.total, isWinner && styles.totalWinner]}>{row.total}</Text>
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
          <Text style={styles.captureGame}>Yahtzee</Text>
          <View style={styles.captureDivider} />
          <Text style={styles.captureHero}>🏆</Text>
          <Text style={styles.captureTitle}>{winnerName ? `${winnerName} wins!` : 'Game over'}</Text>
          <View style={styles.captureStandings}>
            {rows.slice(0, 6).map((row, index) => {
              const isWinner = winnerId ? row.playerId === winnerId : index === 0
              return (
                <View key={row.playerId} style={[styles.captureRow, isWinner && styles.captureRowWinner]}>
                  <Text style={styles.captureRank}>{MEDALS[index] ?? String(index + 1)}</Text>
                  <View style={styles.rowText}>
                    <Text style={[styles.captureName, isWinner && styles.captureNameWinner]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    {row.bonus > 0 ? (
                      <Text style={styles.captureDetail}>Upper +{YAHTZEE_UPPER_BONUS_POINTS} bonus</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.captureTotal, isWinner && styles.captureTotalWinner]}>{row.total}</Text>
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

function buildShareText(rows: Row[], winnerName: string | null): string {
  const lines: string[] = ['Yahtzee', '']
  lines.push(winnerName ? `🏆 ${winnerName} wins!` : '🏁 Game over')
  if (rows.length > 0) {
    lines.push('', 'Final scores:')
    rows.slice(0, 8).forEach((row, index) => {
      const bonus = row.bonus > 0 ? ' (+bonus)' : ''
      lines.push(`  ${index + 1}. ${row.name} — ${row.total}${bonus}`)
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
    detail: { color: theme.textMuted, fontSize: 11 },
    total: { color: theme.primaryMuted, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
    totalWinner: { color: theme.primary },
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
    captureTotal: { color: '#e11d48', fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
    captureTotalWinner: { color: '#be123c' },
    captureBrand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 22 },
  })
