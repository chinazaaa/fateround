import { ReactNode, useCallback, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { playerIsViewer } from '@fateround/shared/viewers'
import { lobbySeatsFull, resolveLobbyMaxPlayers } from '@fateround/shared/game-limits-lite'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { PlayerSessionControls } from '@/components/session/PlayerSessionControls'
import { GameInfoChips } from '@/components/GameInfoChips'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { gameLabel } from '@/lib/mobile-registry'
import { postPlayerReady } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  game: Game
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string
  myResumeToken?: string | null
  onReload?: () => void | Promise<unknown>
  onRenamed?: (name: string) => void
  onLeft?: () => void
  title?: string
  description?: string
  activity?: ReactNode
}

export function LobbyView({
  gameCode,
  game,
  players,
  myPlayerId,
  myPlayerName,
  myResumeToken,
  onReload,
  onRenamed,
  onLeft,
  title = 'Waiting for host',
  description,
  activity,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const spectating = !!(me && playerIsViewer(me, game))
  const typeLabel = gameLabel(game.game_type)
  const [readying, setReadying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  // Pull-to-refresh — mirrors the reload the auto-poll and realtime listener
  // already do, so a player who wants an instant re-check (host hasn't hit
  // start yet, roster looks stale) can drag down instead of waiting.
  const onRefresh = useCallback(async () => {
    if (!onReload) return
    setRefreshing(true)
    try {
      await onReload()
    } finally {
      setRefreshing(false)
    }
  }, [onReload])
  const maxPlayers = resolveLobbyMaxPlayers(game.game_type, game)
  const seatsFull = lobbySeatsFull(game.game_type, game, players)

  // After a host "Return to lobby" reset everyone is sat out (spectator). Let a
  // spectating player take a seat / get ready straight from the normal lobby —
  // the replay ring path handles the "Play again" case separately. When seats are
  // full a spectator can't ready up, so the button gives way to a "watching" note.
  const canGetReady = spectating && game.status === 'waiting' && !!myResumeToken && !seatsFull
  const getReady = async () => {
    if (!myResumeToken) return
    setReadying(true)
    try {
      await postPlayerReady(gameCode, myResumeToken, true)
      await onReload?.()
    } finally {
      setReadying(false)
    }
  }

  if (game.replay_pending && game.status === 'waiting') {
    return (
      <View style={styles.container}>
        <ReplayReadyRing
          gameCode={gameCode}
          players={players}
          myPlayerId={myPlayerId}
          myResumeToken={myResumeToken ?? null}
          maxPlayers={maxPlayers}
          onReload={onReload ?? (() => {})}
        />
      </View>
    )
  }

  return (
    <KeyboardAwareGameScroll
      ref={scrollRef}
      contentContainerStyle={styles.container}
      refreshControl={
        onReload ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.primaryMuted}
            colors={[theme.primary]}
          />
        ) : undefined
      }
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>{spectating ? 'New round' : "You're in"}</Text>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        <Text style={styles.gameType}>{typeLabel}</Text>
        <GameInfoChips game={game} />
        <GameRulesLink gameType={game.game_type} />
        {canGetReady ? (
          <Pressable
            style={[styles.getReadyBtn, readying && styles.getReadyBtnDisabled]}
            disabled={readying}
            onPress={() => void getReady()}
          >
            <Text style={styles.getReadyText}>{readying ? 'Joining…' : 'Tap to get ready'}</Text>
          </Pressable>
        ) : spectating && seatsFull && game.status === 'waiting' ? (
          <Text style={styles.watchNote}>Game is full — you're watching this round.</Text>
        ) : null}
      </View>

      {activity}

      <Text style={styles.section}>In lobby ({players.length})</Text>
      <View style={styles.list}>
        {players.map((player) => {
          const isMe = player.id === myPlayerId
          return (
            <View key={player.id} style={[styles.row, isMe && styles.rowMe]}>
              <Text style={styles.name}>{isMe ? `${player.name} (you)` : player.name}</Text>
              {player.spectator ? <Text style={styles.badge}>Viewer</Text> : null}
            </View>
          )
        })}
      </View>

      {myPlayerId && onRenamed && onLeft ? (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myPlayerName}
          resumeToken={myResumeToken}
          onRenamed={onRenamed}
          onLeft={onLeft}
          inLobby
          spectating={spectating}
          onEditStart={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
        />
      ) : null}

      <Text style={styles.waiting}>
        {game.status === 'waiting'
          ? 'Waiting for the host to start…'
          : game.status === 'active'
            ? 'Game in progress'
            : 'This game has finished.'}
      </Text>
    </KeyboardAwareGameScroll>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: theme.bg,
      padding: 20,
      gap: 12,
      paddingBottom: 32,
    },
    hero: {
      backgroundColor: theme.primarySoft,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      padding: 16,
      alignItems: 'center',
      gap: 6,
    },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    description: {
      color: theme.textSecondary,
      fontSize: theme.type.label.size,
      lineHeight: 20,
      textAlign: 'center',
    },
    gameType: {
      color: theme.text,
      fontSize: theme.type.label.size,
      fontWeight: '700',
      marginTop: 4,
    },
    getReadyBtn: {
      marginTop: 12,
      backgroundColor: theme.primary,
      borderRadius: theme.radius.md,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    getReadyBtnDisabled: { opacity: 0.7 },
    // White on the solid rose button — correct in both schemes.
    getReadyText: { color: '#fff', fontSize: theme.type.section.size, fontWeight: '700' },
    watchNote: {
      marginTop: 8,
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
    section: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: '700',
      marginTop: 4,
    },
    list: { gap: 8 },
    row: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    rowMe: { borderWidth: 1, borderColor: theme.borderAccent },
    name: { color: theme.text, fontSize: theme.type.section.size },
    badge: { color: theme.textMuted, fontSize: theme.type.caption.size, textTransform: 'uppercase' },
    waiting: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      textAlign: 'center',
      marginTop: 8,
    },
  })
