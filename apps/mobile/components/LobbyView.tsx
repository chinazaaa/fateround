import { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { playerIsViewer } from '@fateround/shared/viewers'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { PlayerSessionControls } from '@/components/session/PlayerSessionControls'
import { ShareGameCard } from '@/components/session/ShareGameCard'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameLabel } from '@/lib/mobile-registry'

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
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const spectating = !!(me && playerIsViewer(me, game))
  const typeLabel = gameLabel(game.game_type)

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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{spectating ? 'New round' : "You're in"}</Text>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        <Text style={styles.gameType}>{typeLabel}</Text>
        <GameRulesLink gameType={game.game_type} />
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

      <ShareGameCard gameCode={gameCode} />

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
        />
      ) : null}

      <Text style={styles.waiting}>
        {game.status === 'waiting'
          ? 'Waiting for the host to start…'
          : game.status === 'active'
            ? 'Game in progress'
            : 'This game has finished.'}
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0b0b0f',
    padding: 20,
    gap: 12,
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: '#3f1d2b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f43f5e44',
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  kicker: {
    color: '#fda4af',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  gameType: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  section: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  list: { gap: 8 },
  row: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowMe: { borderWidth: 1, borderColor: '#f43f5e55' },
  name: { color: '#fff', fontSize: 16 },
  badge: { color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' },
  waiting: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
})
