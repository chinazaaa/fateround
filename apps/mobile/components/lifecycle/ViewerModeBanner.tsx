import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { canSwitchViewerToPlayer, playerIsViewer } from '@fateround/shared/viewers'
import { usePromoteToPlayer } from '@/hooks/usePromoteToPlayer'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  playerId: string
  game: Pick<
    Game,
    | 'status'
    | 'session_started_at'
    | 'allow_viewers'
    | 'allow_late_players'
    | 'codewords_late_join'
    | 'game_type'
    | 'tournament_id'
    | 'max_players'
  >
  player: Pick<Player, 'joined_at' | 'spectator' | 'is_eliminated'>
  players?: ReadonlyArray<Pick<Player, 'spectator'>>
  playerDetail?: string
  onPromoted?: () => void | Promise<unknown>
}

export function ViewerModeBanner({ gameCode, playerId, game, player, players, playerDetail, onPromoted }: Props) {
  const styles = useThemedStyles(makeStyles)
  const { promote, promoting, error } = usePromoteToPlayer(gameCode, playerId, onPromoted)

  // This prompt is about watching a *live* game (late-join / spectator states).
  // Once the game is over it's meaningless — and a winner marked out-of-play
  // (is_eliminated) would otherwise wrongly see it on the results screen.
  if (game.status !== 'active') return null
  if (!playerIsViewer(player, game)) return null

  // Plain watch-only status is now shown as the compact "Watching" header pill
  // (see useSpectatorBadge). Only render this prompt when there's an actual
  // action to take — i.e. the spectator can switch to playing right now.
  if (!canSwitchViewerToPlayer(player, game, players)) return null

  return (
    <View style={styles.banner}>
      <Text style={styles.body}>You joined after the game started — watch live, or jump in now.</Text>
      <Pressable
        style={[styles.button, promoting && styles.buttonDisabled]}
        onPress={() => void promote()}
        disabled={promoting}
      >
        <Text style={styles.buttonText}>{promoting ? 'Joining…' : 'Join as player'}</Text>
      </Pressable>
      {playerDetail ? <Text style={styles.detail}>{playerDetail}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: {
      backgroundColor: theme.primarySoft,
      borderColor: '#f43f5e55',
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 8,
    },
    body: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      // white on the solid rose button — intentional
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    detail: {
      color: theme.textMuted,
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 16,
    },
    error: {
      color: theme.error,
      fontSize: 12,
      textAlign: 'center',
    },
  })
