import { useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import type { MonopolyStanding } from '@/lib/monopoly-standings'
import { formatThemedMoney } from './monopoly-theme'

const MEDALS = ['👑', '🥈', '🥉']
const HEADER_EMOJI = '🎲🏠'
const ASSETS_SUBTITLE = 'Highest total assets (cash + properties + buildings)'

type Props = {
  standings: MonopolyStanding[]
  winnerName: string | null
  /** Room title shown in the card header (mirrors the web `game.title`). */
  gameTitle: string
  themeId?: string | null
  highlightPlayerId?: string | null
}

function detailLine(row: MonopolyStanding, themeId?: string | null): string {
  const noun = row.propertyCount === 1 ? 'property' : 'properties'
  return `${row.propertyCount} ${noun} · Cash ${formatThemedMoney(row.cash, themeId)}`
}

/**
 * Bespoke Monopoly final-results card — the mobile counterpart of the web
 * `MonopolyFinalResultsShareBlock`. Self-contained: its own header (room title +
 * MONOPOLY label), trophy winner hero, the "highest total assets" subtitle, and a
 * ranked net-worth standings with medals + right-aligned net worth. Includes a
 * button that snapshots a light branded copy to a PNG for image sharing.
 */
export function MonopolyShareCard({ standings, winnerName, gameTitle, themeId, highlightPlayerId }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const showAssetsSubtitle = !!winnerName && standings.length > 1
  const shareText = buildShareText(standings, winnerName, themeId)

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
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{HEADER_EMOJI}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {gameTitle}
          </Text>
          <Text style={styles.headerLabel}>MONOPOLY</Text>
        </View>

        <Text style={styles.hero}>{winnerName ? '🏆' : '🏁'}</Text>
        <Text style={styles.heroTitle}>
          {winnerName ? (
            <>
              <Text style={styles.heroWinner}>{winnerName}</Text> wins!
            </>
          ) : (
            'Game over!'
          )}
        </Text>
        {showAssetsSubtitle ? <Text style={styles.heroSubtitle}>{ASSETS_SUBTITLE}</Text> : null}

        <View style={styles.standings}>
          {standings.map((row) => {
            const isWinner = row.rank === 1
            const isMe = row.playerId === highlightPlayerId
            return (
              <View key={row.playerId} style={[styles.row, isWinner && styles.rowWinner]}>
                <Text style={[styles.rank, isWinner && styles.rankWinner]}>
                  {MEDALS[row.rank - 1] ?? String(row.rank)}
                </Text>
                <View style={styles.rowText}>
                  <Text style={[styles.name, isWinner && styles.nameWinner]} numberOfLines={1}>
                    {row.name}
                    {isMe ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                  <Text style={styles.detail} numberOfLines={1}>
                    {detailLine(row, themeId)}
                  </Text>
                </View>
                <Text style={[styles.netWorth, isWinner && styles.netWorthWinner]}>
                  {formatThemedMoney(row.netWorth, themeId)}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      <AppButton label="Share results card" variant="secondary" onPress={() => void onShare()} />

      {/* Off-screen light-themed copy captured to a shareable image. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={captureCardRef} collapsable={false} style={styles.captureCard}>
          <Text style={styles.captureEmoji}>{HEADER_EMOJI}</Text>
          <Text style={styles.captureGame}>{gameTitle}</Text>
          <Text style={styles.captureLabel}>MONOPOLY</Text>
          <View style={styles.captureDivider} />
          <Text style={styles.captureHero}>{winnerName ? '🏆' : '🏁'}</Text>
          <Text style={styles.captureTitle}>{winnerName ? `${winnerName} wins!` : 'Game over!'}</Text>
          {showAssetsSubtitle ? <Text style={styles.captureSubtitle}>{ASSETS_SUBTITLE}</Text> : null}
          <View style={styles.captureStandings}>
            {standings.slice(0, 6).map((row) => {
              const isWinner = row.rank === 1
              return (
                <View key={row.playerId} style={[styles.captureRow, isWinner && styles.captureRowWinner]}>
                  <Text style={styles.captureRank}>{MEDALS[row.rank - 1] ?? String(row.rank)}</Text>
                  <View style={styles.rowText}>
                    <Text style={[styles.captureName, isWinner && styles.captureNameWinner]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.captureDetail} numberOfLines={1}>
                      {detailLine(row, themeId)}
                    </Text>
                  </View>
                  <Text style={styles.captureNetWorth}>{formatThemedMoney(row.netWorth, themeId)}</Text>
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

function buildShareText(standings: MonopolyStanding[], winnerName: string | null, themeId?: string | null): string {
  const lines: string[] = ['Monopoly', '']
  lines.push(winnerName ? `🏆 ${winnerName} wins!` : '🏁 Game over')
  if (standings.length > 0) {
    lines.push('', 'Final standings:')
    standings.slice(0, 8).forEach((row) => {
      lines.push(`  ${row.rank}. ${row.name} — ${formatThemedMoney(row.netWorth, themeId)} · ${detailLine(row, themeId)}`)
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
      gap: 4,
    },
    header: {
      alignItems: 'center',
      gap: 2,
      paddingBottom: 12,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      alignSelf: 'stretch',
    },
    headerEmoji: { fontSize: 24 },
    headerTitle: { color: theme.primary, fontSize: 18, fontWeight: '900', textAlign: 'center' },
    headerLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    hero: { fontSize: 44, marginTop: 4 },
    heroTitle: { color: theme.text, fontSize: 26, fontWeight: '900', textAlign: 'center' },
    heroWinner: { color: theme.primary },
    heroSubtitle: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textAlign: 'center',
      textTransform: 'uppercase',
      marginTop: 2,
    },
    standings: { width: '100%', gap: 8, marginTop: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowWinner: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    rank: { width: 26, textAlign: 'center', fontSize: 16, fontWeight: '900', color: theme.textMuted },
    rankWinner: { color: theme.primary, fontSize: 18 },
    rowText: { flex: 1, gap: 1 },
    name: { color: theme.text, fontSize: 15, fontWeight: '700' },
    nameWinner: { fontSize: 17, fontWeight: '900' },
    you: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    detail: { color: theme.textMuted, fontSize: 11 },
    netWorth: { color: theme.primary, fontSize: 15, fontWeight: '900' },
    netWorthWinner: { fontSize: 16 },
    // Off-screen light capture card — fixed light palette for a consistent
    // shareable image regardless of the viewer's theme.
    offscreen: { position: 'absolute', left: -10000, top: 0 },
    captureCard: {
      width: 360,
      backgroundColor: '#ffffff',
      borderRadius: 24,
      paddingVertical: 32,
      paddingHorizontal: 24,
      alignItems: 'center',
      gap: 3,
    },
    captureEmoji: { fontSize: 32 },
    captureGame: { color: '#7f1d1d', fontSize: 22, fontWeight: '900', textAlign: 'center' },
    captureLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    captureDivider: { height: 1, width: '80%', backgroundColor: '#f1e0e4', marginVertical: 14 },
    captureHero: { fontSize: 48, marginBottom: 2 },
    captureTitle: { color: '#0b0b0f', fontSize: 26, fontWeight: '900', textAlign: 'center' },
    captureSubtitle: {
      color: '#9ca3af',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.6,
      textAlign: 'center',
      textTransform: 'uppercase',
      marginTop: 2,
    },
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
    captureRank: { width: 26, textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#6b7280' },
    captureName: { color: '#1a1a1a', fontSize: 15, fontWeight: '700' },
    captureNameWinner: { color: '#0b0b0f', fontSize: 16, fontWeight: '900' },
    captureDetail: { color: '#9ca3af', fontSize: 11 },
    captureNetWorth: { color: '#e11d48', fontSize: 15, fontWeight: '900' },
    captureBrand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 22 },
  })
