import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Game } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  game: Pick<Game, 'title' | 'game_type' | 'result_reason'> | null
}

/**
 * Copy is switched on `result_reason` so a lobby the idle-cron closed doesn't
 * read like a game that finished normally — the user should know WHY the link
 * is dead so they don't blame the app. Mirrors the web GameEndedScreen.
 */
function endedCopy(reason: string | null | undefined): { headline: string; body: string; emoji: string } {
  switch (reason) {
    case 'idle_timeout':
      return {
        emoji: '⌛',
        headline: 'Lobby closed — nobody joined',
        body: 'This lobby was open for 15 minutes with no activity, so we closed it. Start a new one when everyone’s ready.',
      }
    case 'host_cancelled':
      return {
        emoji: '❌',
        headline: 'The host cancelled this game',
        body: 'The host called it off before the lobby opened. Start a new game to play again.',
      }
    default:
      return {
        emoji: '🏁',
        headline: 'This game has ended',
        body: 'This link is no longer active. Join a new game with a code from the home screen.',
      }
  }
}

export function GameEndedScreen({ game }: Props) {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const label = game ? gameLabel(game.game_type) : 'Game'
  const copy = endedCopy(game?.result_reason ?? null)

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>{copy.emoji}</Text>
        <Text style={styles.title}>{game?.title ?? 'This game'}</Text>
        <Text style={styles.badge}>{label}</Text>
        <Text style={styles.heading}>{copy.headline}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Go home</Text>
        </Pressable>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: theme.surface,
      borderRadius: theme.radius.lg,
      padding: 24,
      gap: 10,
      alignItems: 'center',
    },
    emoji: {
      fontSize: 40,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    badge: {
      color: theme.primaryMuted,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heading: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginTop: 4,
    },
    body: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      lineHeight: 22,
      textAlign: 'center',
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      paddingHorizontal: 24,
      marginTop: 12,
      width: '100%',
      alignItems: 'center',
    },
    buttonText: {
      // white on the solid rose button — intentional
      color: '#fff',
      fontSize: theme.type.section.size,
      fontWeight: '600',
    },
  })
