import { ReactNode, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { playerIsViewer } from '@fateround/shared/viewers'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { PlayerSessionControls } from '@/components/session/PlayerSessionControls'
import { GameInfoChips } from '@/components/GameInfoChips'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { gameLabel } from '@/lib/mobile-registry'
import { postPlayerReady } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

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
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const spectating = !!(me && playerIsViewer(me, game))
  const typeLabel = gameLabel(game.game_type)
  const [readying, setReadying] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  // After a host "Return to lobby" reset everyone is sat out (spectator). Let a
  // spectating player take a seat / get ready straight from the normal lobby —
  // the replay ring path handles the "Play again" case separately.
  const canGetReady = spectating && game.status === 'waiting' && !!myResumeToken
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
          onReload={onReload ?? (() => {})}
        />
      </View>
    )
  }

  return (
    <KeyboardAwareGameScroll ref={scrollRef} contentContainerStyle={styles.container}>
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
      borderRadius: 14,
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
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    gameType: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 4,
    },
    getReadyBtn: {
      marginTop: 12,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    getReadyBtnDisabled: { opacity: 0.7 },
    // White on the solid rose button — correct in both schemes.
    getReadyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    section: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 4,
    },
    list: { gap: 8 },
    row: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    rowMe: { borderWidth: 1, borderColor: theme.borderAccent },
    name: { color: theme.text, fontSize: 16 },
    badge: { color: theme.textMuted, fontSize: 12, textTransform: 'uppercase' },
    waiting: {
      color: theme.textMuted,
      fontSize: 15,
      textAlign: 'center',
      marginTop: 8,
    },
  })
