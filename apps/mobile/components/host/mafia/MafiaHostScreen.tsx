import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import {
  getMafiaHostState,
  postFinishGame,
  postMafiaAdvanceHost,
  postPlayAgain,
} from '@/lib/game-api'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'

type MafiaHostPlayer = {
  id: string
  name: string
  isAlive: boolean
  role: string
}

type MafiaHostState = {
  status: string
  phase: string
  dayNumber: number
  phaseDeadline: string | null
  winningTeam: string | null
  players: MafiaHostPlayer[]
}

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function MafiaHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const [state, setState] = useState<MafiaHostState | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getMafiaHostState(gameCode, hostToken)
      setState(data as unknown as MafiaHostState)
    } catch {
      setState(null)
    }
  }, [gameCode, hostToken])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 5000)
    return () => clearInterval(interval)
  }, [load])

  const onAdvance = async () => {
    setAdvancing(true)
    setError(null)
    try {
      await postMafiaAdvanceHost(gameCode, hostToken)
      await load()
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advance failed')
    } finally {
      setAdvancing(false)
    }
  }

  const onFinish = async () => {
    setActing(true)
    try {
      await postFinishGame(gameCode, hostToken)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish')
    } finally {
      setActing(false)
    }
  }

  const onPlayAgain = async () => {
    setActing(true)
    try {
      await postPlayAgain(gameCode, hostToken, true)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Play again failed')
    } finally {
      setActing(false)
    }
  }

  const roster = state?.players ?? players.map((p) => ({
    id: p.id,
    name: p.name,
    isAlive: !p.is_eliminated,
    role: 'unknown',
  }))
  const alive = roster.filter((p) => p.isAlive)

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
      {state ? (
        <View style={styles.phaseCard}>
          <Text style={styles.phaseLabel}>Phase</Text>
          <Text style={styles.phase}>{state.phase.replace(/_/g, ' ')}</Text>
          <Text style={styles.day}>Day {state.dayNumber}</Text>
          {state.winningTeam ? (
            <Text style={styles.winner}>{state.winningTeam} wins</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Alive ({alive.length})</Text>
      {alive.map((p) => (
        <View key={p.id} style={styles.playerRow}>
          <Text style={styles.playerName}>{p.name}</Text>
        </View>
      ))}

      {game.status === 'active' ? (
        <Pressable
          style={[styles.primaryBtn, advancing && styles.btnDisabled]}
          disabled={advancing}
          onPress={() => void onAdvance()}
        >
          {advancing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Advance phase</Text>
          )}
        </Pressable>
      ) : null}


      {game.status === 'active' ? (
        <Pressable
          style={[styles.secondaryBtn, acting && styles.btnDisabled]}
          disabled={acting}
          onPress={() => void onFinish()}
        >
          <Text style={styles.secondaryBtnText}>End game</Text>
        </Pressable>
      ) : null}

      {game.status === 'finished' ? (
        <>
          <Pressable
            style={[styles.primaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void onPlayAgain()}
          >
            <Text style={styles.primaryBtnText}>Play again</Text>
          </Pressable>
          <GameFinishedActions gameCode={gameCode} gameType={game.game_type} gameTitle={game.title} />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const styles = StyleSheet.create({
  phaseCard: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  phaseLabel: { color: '#fda4af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  phase: { color: '#fff', fontSize: 22, fontWeight: '800', textTransform: 'capitalize' },
  day: { color: '#9ca3af', fontSize: 14 },
  winner: { color: '#86efac', fontSize: 16, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  playerRow: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playerName: { color: '#fff', fontSize: 15, fontWeight: '500' },
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
