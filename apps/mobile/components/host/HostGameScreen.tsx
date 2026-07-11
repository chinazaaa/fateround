import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { HostLobbyScreen } from '@/components/HostLobbyScreen'
import { HostRouter } from '@/components/host/HostRouter'
import { useHostGame } from '@/hooks/useHostGame'
import { recordRecentGame } from '@/lib/recent-games'
import type { Theme } from '@/constants/theme'
import { GameThemeProvider, useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
}

/**
 * Host shell: lobby while waiting, in-game dashboard once active or finished.
 */
export function HostGameScreen({ gameCode, hostToken }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const { game, players, loading, reload } = useHostGame(gameCode)

  // Surface the game in the host's "Recent" list as soon as it loads — hosting
  // alone (no player session) previously never recorded it, so a host who
  // created a game and backed out to Home couldn't find it again.
  const gameTitle = game?.title
  const gameType = game?.game_type
  useEffect(() => {
    if (!gameType) return
    void recordRecentGame({ code: gameCode, title: gameTitle, gameType })
  }, [gameCode, gameTitle, gameType])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    )
  }

  if (!game) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    )
  }

  const inLobby = game.status === 'waiting'

  // Apply the game's chosen edition/theme across the lobby and in-game views.
  // Reading it here means a theme change from the lobby settings sheet re-applies
  // live (useHostGame reloads on the `games` change).
  return (
    <GameThemeProvider theme={game.status === 'finished' ? 'default' : game.theme}>
      {inLobby ? (
        <HostLobbyScreen gameCode={gameCode} hostToken={hostToken} />
      ) : (
        <HostRouter
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          players={players}
          onReload={() => void reload()}
        />
      )}
    </GameThemeProvider>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
