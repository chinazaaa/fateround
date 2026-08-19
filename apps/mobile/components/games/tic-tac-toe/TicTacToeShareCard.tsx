import { useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { Player, TicTacToeSession } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { TicTacToeFinalBoardRecap } from './TicTacToeFinalBoardRecap'

const HEADER_EMOJI = '✕⭕'

type Props = {
  gameTitle: string
  winnerName: string | null
  isDraw: boolean
  session: TicTacToeSession
  players: Player[]
  myPlayerId?: string | null
}

/**
 * Bespoke Tic Tac Toe final-results card — the mobile counterpart of the web
 * `TicTacToeFinalResultsShareBlock`. Self-contained: its own header (room title +
 * TIC TAC TOE label), a winner/draw hero, and the existing final-board recap body.
 * Includes a button that snapshots the visible themed card to a PNG for sharing.
 */
export function TicTacToeShareCard({ gameTitle, winnerName, isDraw, session, players, myPlayerId }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const heroEmoji = isDraw ? '🤝' : winnerName ? '🏆' : '🏁'
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
      {/* Visible, theme-aware tailored card — captured directly for the image. */}
      <View ref={captureCardRef} collapsable={false} style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{HEADER_EMOJI}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {gameTitle}
          </Text>
          <Text style={styles.headerLabel}>TIC TAC TOE</Text>
        </View>

        <Text style={styles.hero}>{heroEmoji}</Text>
        <Text style={styles.heroTitle}>
          {isDraw ? (
            "It's a draw!"
          ) : winnerName ? (
            <>
              <Text style={styles.heroWinner}>{winnerName}</Text> wins!
            </>
          ) : (
            'Game over'
          )}
        </Text>

        <View style={styles.body}>
          <TicTacToeFinalBoardRecap session={session} players={players} myPlayerId={myPlayerId} />
        </View>
      </View>

      <AppButton label="Share results card" variant="secondary" onPress={() => void onShare()} />
    </View>
  )
}

function buildShareText(winnerName: string | null, isDraw: boolean): string {
  const lines: string[] = ['Tic-Tac-Toe', '']
  lines.push(isDraw ? "🤝 It's a draw!" : winnerName ? `🏆 ${winnerName} wins!` : '🏁 Game over')
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
    body: { width: '100%', marginTop: 12 },
  })
