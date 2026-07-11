import { useRef } from 'react'
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { GameType } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { gameLabel } from '@/lib/mobile-registry'
import { WEB_BASE_URL, shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { ShareResultCard } from '@/components/lifecycle/ShareResultCard'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

type Props = {
  gameCode: string
  gameType?: GameType | string | null
  gameTitle?: string | null
  /** Result headline, e.g. "Naza wins!" — leads the shared text. */
  resultTitle?: string
  /** Sub-headline, e.g. "BINGO!". */
  resultDetail?: string | null
  /** Hero emoji — 🏆 for a winner, 🏁 otherwise. */
  emoji?: string
  leaderboard?: FinishedLeaderboardRow[]
}

function buildShareText({ gameType, gameTitle, resultTitle, resultDetail, emoji = '🏆', leaderboard }: Props): string {
  const label = gameType ? gameLabel(gameType as GameType) : undefined
  const lines: string[] = []
  if (gameTitle) lines.push(gameTitle)
  if (label) lines.push(label)
  lines.push('')
  if (resultTitle) lines.push(`${emoji} ${resultTitle}`)
  if (resultDetail) lines.push(resultDetail)
  if (leaderboard && leaderboard.length > 0) {
    lines.push('', 'Final standings:')
    leaderboard.slice(0, 8).forEach((row, i) => {
      const name = row.you ? `${row.name} (you)` : row.name
      const rawScore = `${row.score}`.trim()
      // Skip placeholder scores (the em-dash used for non-winners) so a row
      // doesn't render as "gyh — —".
      const hasScore = rawScore !== '' && rawScore !== '—' && rawScore !== '-'
      const score = hasScore ? `${rawScore}${row.scoreSuffix ? ` ${row.scoreSuffix}` : ''}` : ''
      const detail = row.detail ? ` · ${row.detail}` : ''
      lines.push(hasScore ? `  ${i + 1}. ${name} — ${score}${detail}` : `  ${i + 1}. ${name}${detail}`)
    })
  }
  lines.push('', `Play at ${shareDomain()}`)
  return lines.join('\n')
}

/**
 * Actions shown under a finished game's leaderboard — mirrors the web player
 * results footer (Share results · Create a new game · View history · Back home).
 */
export function GameFinishedActions(props: Props) {
  const { gameCode, gameType, gameTitle, resultTitle, resultDetail, emoji, leaderboard } = props
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { error: toastError } = useToast()
  const cardRef = useRef<View>(null)

  const onShare = async () => {
    const text = buildShareText(props)
    try {
      // Snapshot the off-screen result card to a PNG and share the image (with
      // the text as caption). Falls back to text-only if capture/share fails.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 })
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message: text })
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share results' })
      } else {
        await Share.share({ message: text })
      }
    } catch {
      try {
        await Share.share({ message: text })
      } catch {
        toastError('Could not share results')
      }
    }
  }

  const onHistory = () => {
    void Linking.openURL(`${WEB_BASE_URL}/history/${gameCode.toUpperCase()}`)
  }

  return (
    <View style={styles.wrap}>
      {/* Off-screen card captured for image sharing. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={cardRef} collapsable={false}>
          <ShareResultCard
            gameType={gameType}
            gameTitle={gameTitle}
            resultTitle={resultTitle}
            resultDetail={resultDetail}
            emoji={emoji}
            leaderboard={leaderboard}
          />
        </View>
      </View>
      <AppButton label="Share results" variant="secondary" onPress={() => void onShare()} />
      <AppButton label="Create a new game" variant="secondary" onPress={() => router.push('/create')} />
      <Pressable style={styles.link} onPress={onHistory} hitSlop={8}>
        <Text style={styles.linkText}>View game history ↗</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.replace('/')} hitSlop={8}>
        <Text style={styles.linkMuted}>Back home</Text>
      </Pressable>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: {
    gap: theme.space.sm,
  },
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  link: {
    alignItems: 'center',
    paddingVertical: theme.space.sm,
  },
  linkText: {
    color: theme.primaryMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  linkMuted: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
})
