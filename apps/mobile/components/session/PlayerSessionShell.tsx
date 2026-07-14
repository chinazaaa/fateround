import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { clearPlayerSession, getHostToken, getPlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { PlayerSessionMenu } from '@/components/session/PlayerSessionMenu'
import { HeaderBadgeContext } from '@/components/session/HeaderBadgeContext'
import { HostNominationBanner } from '@/components/session/HostNominationBanner'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { HeaderAction } from '@/components/ui/HeaderAction'
import { SettingsButton } from '@/components/ui/SettingsSheet'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { centeredContent } from '@/constants/layout'
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
  // Optional mode/phase label a game view registers via useHeaderBadge — shown
  // as a pill next to the game-type pill instead of a floating body subtitle.
  const [headerBadge, setHeaderBadge] = useState<string | null>(null)

  const reloadSeqRef = useRef(0)
  const reloadSession = useCallback(async () => {
    const seq = ++reloadSeqRef.current
    const [session, storedHostToken] = await Promise.all([getPlayerSession(gameCode), getHostToken(gameCode)])
    // A newer reload started while this read was in flight — drop this result so
    // a slow earlier read can't overwrite the fresher session state.
    if (seq !== reloadSeqRef.current) return
    setPlayerId(session?.playerId ?? null)
    setPlayerName(session?.playerName ?? '')
    setResumeToken(session?.resumeToken ?? null)
    setHostToken(storedHostToken)
    setHasHostToken(!!storedHostToken)
  }, [gameCode])

  useEffect(() => {
    void reloadSession()
  }, [reloadSession])

  // Rotating the player code from the share sheet mints a new resume token; ours
  // authenticates the host claim/decline calls in HostNominationBanner.
  useEffect(() => {
    return subscribePlayerSession(gameCode, () => void reloadSession())
  }, [gameCode, reloadSession])

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

  const onShare = async () => {
    // Refresh the stored session BEFORE opening: the shell loads it once on mount
    // (on the join screen, before a resume token exists), so without awaiting this
    // the share sheet would open with a stale/missing resume + host token right
    // after the player joins.
    await reloadSession()
    setShareOpen(true)
  }

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
    <HeaderBadgeContext.Provider value={setHeaderBadge}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.toolbar}>
            <Pressable style={styles.backBtn} onPress={goHome} hitSlop={8}>
              <Text style={styles.backIcon}>←</Text>
            </Pressable>

            <View style={styles.toolbarActions}>
              <SettingsButton />
              <HeaderAction label="Share" onPress={() => void onShare()} />
              {hasHostToken ? <HeaderAction label="Host" accent onPress={() => void openHost()} /> : null}
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
              {headerBadge ? (
                <View style={styles.modePill}>
                  <Text style={styles.modePillText}>{headerBadge}</Text>
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

        {/* Not gated on gameEnded: a host may transfer host after the game finishes
            (e.g. so the new host can start "play again") — the nominee must still
            see the invite on the finished screen. The banner self-hides unless
            there's a pending nomination for this player. */}
        <HostNominationBanner gameCode={gameCode} playerId={playerId} resumeToken={resumeToken} />
        <View style={styles.body}>{children}</View>
        {/* Floats over the screen — last child so it paints above the body. */}
        {game ? <VoiceRail gameCode={gameCode} mode="player" /> : null}
        <ShareGameSheet
          visible={shareOpen}
          gameCode={gameCode}
          hostToken={hostToken}
          resumeToken={resumeToken}
          onClose={() => setShareOpen(false)}
        />
      </SafeAreaView>
    </HeaderBadgeContext.Provider>
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
    // Secondary pill for a mode/phase badge — subtler than the game-type pill so
    // the two read as a hierarchy (game type, then mode) rather than two peers.
    modePill: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    modePillText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.textMuted,
      fontSize: 15,
      fontWeight: '600',
    },
    rulesRow: { marginTop: 2 },
    // Cap + center the game content so it doesn't stretch edge-to-edge on iPad.
    body: { flex: 1, ...centeredContent },
  })
