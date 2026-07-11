import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { gameLabel } from '@/lib/mobile-registry'
import { WEB_BASE_URL } from '@/lib/config'
import { theme } from '@/constants/theme'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

type Props = {
  gameCode: string
  gameType?: GameType | string | null
  gameTitle?: string | null
  /** Result headline, e.g. "Naza wins!" — leads the shared text. */
  resultTitle?: string
  leaderboard?: FinishedLeaderboardRow[]
}

function buildShareText({ gameCode, gameType, gameTitle, resultTitle, leaderboard }: Props): string {
  const label = gameType ? gameLabel(gameType as GameType) : undefined
  const lines: string[] = []
  if (gameTitle) lines.push(gameTitle)
  if (label) lines.push(label)
  lines.push('')
  if (resultTitle) lines.push(`🏆 ${resultTitle}`)
  if (leaderboard && leaderboard.length > 0) {
    lines.push('', 'Final leaderboard:')
    leaderboard.slice(0, 8).forEach((row, i) => {
      const name = row.you ? `${row.name} (you)` : row.name
      const score = `${row.score}${row.scoreSuffix ? ` ${row.scoreSuffix}` : ''}`
      const detail = row.detail ? ` · ${row.detail}` : ''
      lines.push(`  ${i + 1}. ${name} — ${score}${detail}`)
    })
  }
  lines.push('', `Play at ${WEB_BASE_URL.replace(/^https?:\/\//, '')}`)
  return lines.join('\n')
}

/**
 * Actions shown under a finished game's leaderboard — mirrors the web player
 * results footer (Share results · Create a new game · View history · Back home).
 */
export function GameFinishedActions(props: Props) {
  const { gameCode } = props
  const router = useRouter()
  const { error: toastError } = useToast()

  const onShare = async () => {
    try {
      await Share.share({ message: buildShareText(props) })
    } catch {
      toastError('Could not share results')
    }
  }

  const onHistory = () => {
    void Linking.openURL(`${WEB_BASE_URL}/history/${gameCode.toUpperCase()}`)
  }

  return (
    <View style={styles.wrap}>
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

const styles = StyleSheet.create({
  wrap: {
    gap: theme.space.sm,
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
