import { ReactNode, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { clearPlayerSession, getHostToken, getPlayerSession } from '@/lib/secure-session'
import { gameHasMobileVoice } from '@/lib/voice-games'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { PlayerSessionMenu } from '@/components/session/PlayerSessionMenu'
import { HostNominationBanner } from '@/components/session/HostNominationBanner'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { HeaderAction } from '@/components/ui/HeaderAction'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  game?: Pick<Game, 'title' | 'game_type' | 'status'> | null
  children: ReactNode
}

export function PlayerSessionShell({ gameCode, game, children }: Props) {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const code = gameCode.toUpperCase()
  const typeLabel = game ? gameLabel(game.game_type) : undefined
  const gameEnded = game?.status === 'finished'

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [hasHostToken, setHasHostToken] = useState(false)
  const [hostToken, setHostToken] = useState<string | null>(null)
  const [resumeToken, setResumeToken] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const reloadSession = useCallback(async () => {
    const [session, storedHostToken] = await Promise.all([
      getPlayerSession(gameCode),
      getHostToken(gameCode),
    ])
    setPlayerId(session?.playerId ?? null)
    setPlayerName(session?.playerName ?? '')
    setResumeToken(session?.resumeToken ?? null)
    setHostToken(storedHostToken)
    setHasHostToken(!!storedHostToken)
  }, [gameCode])

  useEffect(() => {
    void reloadSession()
  }, [reloadSession])

  // If you're the host of this game, don't sit in the player shell (with a
  // "Host" button to click) — go straight to the full host experience, which
  // is host + play combined with all host controls inline.
  useEffect(() => {
    if (hasHostToken) router.replace(`/host/${gameCode}`)
  }, [hasHostToken, gameCode, router])

  const goHome = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  const onShare = () => setShareOpen(true)

  const openHost = async () => {
    const token = await getHostToken(gameCode)
    if (token) router.push(`/host/${gameCode}`)
  }

  const onLeft = async () => {
    await clearPlayerSession(gameCode)
    router.replace('/')
  }

  // Host is being redirected to /host — avoid flashing the player shell.
  if (hasHostToken) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.redirecting}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.toolbar}>
          <Pressable style={styles.backBtn} onPress={goHome} hitSlop={8}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>

          <View style={styles.toolbarActions}>
            <HeaderAction label="Share" onPress={onShare} />
            {hasHostToken ? (
              <HeaderAction label="Host" accent onPress={() => void openHost()} />
            ) : null}
            {playerId && !gameEnded ? (
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

        <View style={styles.meta}>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{code}</Text>
            {typeLabel ? (
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{typeLabel}</Text>
              </View>
            ) : null}
          </View>
          {game?.title ? (
            <Text style={styles.title} numberOfLines={1}>
              {game.title}
            </Text>
          ) : null}
          {game?.game_type ? (
            <View style={styles.rulesRow}>
              <GameRulesLink gameType={game.game_type} variant="subtle" />
            </View>
          ) : null}
        </View>
      </View>

      {game && gameHasMobileVoice(game.game_type) ? (
        <VoiceRail gameCode={gameCode} mode="player" />
      ) : null}
      {!gameEnded ? (
        <HostNominationBanner gameCode={gameCode} playerId={playerId} resumeToken={resumeToken} />
      ) : null}
      <View style={styles.body}>{children}</View>
      <ShareGameSheet
        visible={shareOpen}
        gameCode={gameCode}
        hostToken={hostToken}
        resumeToken={resumeToken}
        onClose={() => setShareOpen(false)}
      />
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  redirecting: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: theme.surfaceHover,
    paddingBottom: theme.space.md,
    gap: theme.space.md,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.xs,
    gap: theme.space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: theme.text, fontSize: 20, fontWeight: '600' },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  meta: {
    paddingHorizontal: theme.space.lg,
    gap: 6,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    flexWrap: 'wrap',
  },
  code: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
  },
  typePill: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderAccent,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typePillText: {
    color: theme.primaryMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  rulesRow: { marginTop: 2 },
  body: { flex: 1 },
})
