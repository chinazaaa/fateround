import { useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { MahjongSession, Player } from '@fateround/shared'
import { mahjongTileShortLabel } from '@fateround/shared/mahjong'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { MahjongResultsCard } from './MahjongResultsCard'

const HEADER_EMOJI = '🀄'

type Props = {
  gameTitle: string
  winnerName: string | null
  isDraw: boolean
  session: MahjongSession | null | undefined
  players: Player[]
  highlightPlayerId?: string | null
}

/**
 * Bespoke Mahjong final-results card — the mobile counterpart of the web
 * `MahjongFinalResultsShareBlock`. Self-contained: its own header (room title +
 * MAHJONG label), a trophy/handshake winner hero with the win subtitle, the shared
 * `MahjongResultsCard` score breakdown, and a per-player payment/score row list.
 * Includes a button that snapshots the visible card to a PNG for image sharing.
 */
export function MahjongShareCard({ gameTitle, winnerName, isDraw, session, players, highlightPlayerId }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const winType =
    session?.win_type === 'self_draw' ? 'Self draw' : session?.win_type === 'discard' ? 'On discard' : ''
  const winTile = session?.winning_tile ? mahjongTileShortLabel(session.winning_tile) : null
  const subtitle = winTile ? (winType ? `${winType} on ${winTile}` : `Won on ${winTile}`) : undefined

  const winnerPlayerIds = session?.winner_player_ids?.length
    ? session.winner_player_ids
    : session?.winner_player_id
      ? [session.winner_player_id]
      : []

  const shareText = buildShareText(winnerName, isDraw)

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
      {/* Visible, theme-aware tailored card (also the capture target). */}
      <View ref={captureCardRef} collapsable={false} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{HEADER_EMOJI}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {gameTitle}
          </Text>
          <Text style={styles.headerLabel}>MAHJONG</Text>
        </View>

        <Text style={styles.hero}>{isDraw ? '🤝' : '🏆'}</Text>
        <Text style={styles.heroTitle}>
          {isDraw ? (
            'Wall draw'
          ) : winnerName ? (
            <>
              <Text style={styles.heroWinner}>{winnerName}</Text> calls Mahjong!
            </>
          ) : (
            'Game over'
          )}
        </Text>
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}

        <View style={styles.scorePanel}>
          <MahjongResultsCard session={session} />
        </View>

        <View style={styles.standings}>
          {players.map((player) => {
            const delta = session?.score_summary?.payments.find((p) => p.player_id === player.id)?.delta ?? null
            const total = session?.scores?.[player.id]
            const status =
              total != null
                ? `${total} pts${delta != null ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`
                : delta != null
                  ? `${delta > 0 ? '+' : ''}${delta} pts`
                  : winnerPlayerIds.includes(player.id)
                    ? 'Winner'
                    : 'Player'
            const isMe = player.id === highlightPlayerId
            return (
              <View key={player.id} style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {player.name}
                  {isMe ? <Text style={styles.you}> (you)</Text> : null}
                </Text>
                <Text style={styles.status} numberOfLines={1}>
                  {status}
                </Text>
              </View>
            )
          })}
        </View>

        <Text style={styles.brand}>{shareDomain()}</Text>
      </View>

      <AppButton label="Share results card" variant="secondary" onPress={() => void onShare()} />
    </View>
  )
}

function buildShareText(winnerName: string | null, isDraw: boolean): string {
  const lines: string[] = ['Mahjong', '']
  lines.push(isDraw ? '🤝 Wall draw' : winnerName ? `🏆 ${winnerName} calls Mahjong!` : '🏆 Game over')
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
    scorePanel: { alignSelf: 'stretch', marginTop: 12 },
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
    name: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' },
    you: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    status: { color: theme.primary, fontSize: 15, fontWeight: '900' },
    brand: { color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 16 },
  })
