import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType, Player } from '@fateround/shared'
import {
  postFinishGame,
  postPlayAgain,
  postTwoTruthsAdvance,
} from '@/lib/game-api'
import { gameLabel } from '@/lib/mobile-registry'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

function needsAdvanceControl(gameType: GameType, game: Game): boolean {
  if (gameType === 'two_truths') return true
  return false
}

export function GenericHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const [acting, setActing] = useState<'advance' | 'finish' | 'replay' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activePlayers = players.filter((p) => !p.spectator)
  const showAdvance = needsAdvanceControl(game.game_type, game)

  const run = async (action: 'advance' | 'finish' | 'replay', fn: () => Promise<unknown>) => {
    setActing(action)
    setError(null)
    try {
      await fn()
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(null)
    }
  }

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game}>
      <View style={styles.card}>
        <Text style={styles.title}>{gameLabel(game.game_type)}</Text>
        <Text style={styles.hint}>
          {game.status === 'active'
            ? 'Game is live. Join as a player to play along, or end the session from here.'
            : 'Session finished — play again to reopen the lobby.'}
        </Text>
        <Text style={styles.stat}>Players: {activePlayers.length}</Text>
      </View>

      {game.status === 'active' && showAdvance ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'advance' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() =>
            void run('advance', () => postTwoTruthsAdvance(gameCode, { hostToken, force: true }))
          }
        >
          {acting === 'advance' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Advance round</Text>
          )}
        </Pressable>
      ) : null}


      {game.status === 'active' ? (
        <Pressable
          style={[styles.secondaryBtn, acting === 'finish' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('finish', () => postFinishGame(gameCode, hostToken))}
        >
          <Text style={styles.secondaryBtnText}>End game</Text>
        </Pressable>
      ) : null}

      {game.status === 'finished' ? (
        <>
          <Pressable
            style={[styles.primaryBtn, acting === 'replay' && styles.btnDisabled]}
            disabled={!!acting}
            onPress={() => void run('replay', () => postPlayAgain(gameCode, hostToken, true))}
          >
            {acting === 'replay' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Play again</Text>
            )}
          </Pressable>
          <GameFinishedActions gameCode={gameCode} gameType={game.game_type} gameTitle={game.title} />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 16,
    gap: 8,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  hint: { color: '#9ca3af', fontSize: 14, lineHeight: 20 },
  stat: { color: '#d1d5db', fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  error: { color: '#f87171', fontSize: 14 },
})
