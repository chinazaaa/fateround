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

  // A small pill PINNED near the top of the game shell (position:absolute over the scrolling
  // content) rather than an inline card — so a spectator always has a way in, even after the
  // page scrolls or the initial join prompt is gone. Mirrors the web fixed "Join as player" pill.
  // Plain watch-only status stays in the header "Watching" badge (useSpectatorBadge).
  return (
    <View style={styles.pinnedWrap} pointerEvents="box-none">
      <Pressable
        style={[styles.pill, promoting && styles.pillDisabled]}
        onPress={() => void promote()}
        disabled={promoting}
      >
        {!promoting ? <Text style={styles.pillGlyph}>▶</Text> : null}
        <Text style={styles.pillText}>{promoting ? 'Joining…' : 'Join as player'}</Text>
      </Pressable>
      {playerDetail ? <Text style={styles.detail}>{playerDetail}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Pinned over the top of the shell content, centered. box-none lets touches pass through
    // the wrapper's empty area to the game underneath — only the pill itself is tappable.
    pinnedWrap: {
      position: 'absolute',
      top: 6,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 4,
      zIndex: 20,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      borderRadius: theme.radius.pill,
      paddingVertical: 8,
      paddingHorizontal: 16,
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    pillDisabled: {
      opacity: 0.7,
    },
    pillGlyph: {
      // white on the solid rose pill — intentional
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    pillText: {
      color: '#fff',
      fontSize: 13,
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
      fontSize: theme.type.caption.size,
      textAlign: 'center',
    },
  })
