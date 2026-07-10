import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { gameWebUrl } from '@/lib/config'
import { clearPlayerSession, getHostToken, getPlayerSession } from '@/lib/secure-session'
import { gameHasMobileVoice } from '@/lib/voice-games'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { PlayerSessionMenu } from '@/components/session/PlayerSessionMenu'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Props = {
  gameCode: string
  game?: Pick<Game, 'title' | 'game_type'> | null
  children: ReactNode
}

export function PlayerSessionShell({ gameCode, game, children }: Props) {
  const router = useRouter()
  const label = game ? gameLabel(game.game_type) : undefined

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')

  const reloadSession = useCallback(async () => {
    const session = await getPlayerSession(gameCode)
    setPlayerId(session?.playerId ?? null)
    setPlayerName(session?.playerName ?? '')
  }, [gameCode])

  useEffect(() => {
    void reloadSession()
  }, [reloadSession])

  const onShare = async () => {
    try {
      await Share.share({
        message: `Join my game on Fate Round — code ${gameCode.toUpperCase()}\n${gameWebUrl(gameCode)}`,
      })
    } catch {
      // dismissed
    }
  }

  const openHost = async () => {
    const token = await getHostToken(gameCode)
    if (token) router.push(`/host/${gameCode}`)
  }

  const onLeft = async () => {
    await clearPlayerSession(gameCode)
    router.replace('/')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.headerSide} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerCode}>{gameCode.toUpperCase()}</Text>
          {game?.title ? <Text style={styles.headerTitle} numberOfLines={1}>{game.title}</Text> : label ? <Text style={styles.headerMeta}>{label}</Text> : null}
          {game?.game_type ? (
            <View style={styles.rulesRow}>
              <GameRulesLink gameType={game.game_type} variant="subtle" />
            </View>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => void onShare()}>
            <Text style={styles.iconText}>Share</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => void openHost()}>
            <Text style={styles.iconText}>Host</Text>
          </Pressable>
          {playerId ? (
            <PlayerSessionMenu
              gameCode={gameCode}
              gameType={game?.game_type}
              playerId={playerId}
              playerName={playerName}
              onRenamed={(name) => {
                setPlayerName(name)
                void reloadSession()
              }}
              onLeft={() => void onLeft()}
            />
          ) : null}
        </View>
      </View>
      {game && gameHasMobileVoice(game.game_type) ? (
        <VoiceRail gameCode={gameCode} mode="player" />
      ) : null}
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c24',
    gap: 8,
  },
  headerSide: { width: 36, alignItems: 'center' },
  back: { color: '#fff', fontSize: 22, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  headerCode: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  headerTitle: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  headerMeta: { color: '#fda4af', fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  rulesRow: { marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  iconText: { color: '#fda4af', fontSize: 12, fontWeight: '700' },
  body: { flex: 1 },
})
