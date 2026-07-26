import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji, type MafiaRole } from '@fateround/shared/mafia'
import { getMafiaHostState, postFinishGame, postMafiaAdvanceHost, postPlayAgain } from '@/lib/game-api'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { getPlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type MafiaHostPlayer = {
  id: string
  name: string
  isAlive: boolean
  role: MafiaRole
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
  const styles = useThemedStyles(makeStyles)
  const [state, setState] = useState<MafiaHostState | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // "Host + play" (chosen at lobby time, same as every other game) auto-seats the host as a
  // player — a seated host gets the full Mafia player experience instead of this bare
  // advance/finish console, matching web's Host+play/Host-only choice.
  const [isSeated, setIsSeated] = useState(false)

  useEffect(() => {
    const read = () => void getPlayerSession(gameCode).then((s) => setIsSeated(!!s?.playerId))
    read()
    return subscribePlayerSession(gameCode, read)
  }, [gameCode])

  const load = useCallback(async () => {
    try {
      const data = await getMafiaHostState(gameCode, hostToken)
      setState(data as unknown as MafiaHostState)
    } catch {
      setState(null)
    }
  }, [gameCode, hostToken])

  useEffect(() => {
    // A seated host renders the full player view via HostChrome's play-first mode instead of
    // this console, so there's no need to poll the console-only host-state endpoint.
    if (isSeated) return
    void load()
    const interval = setInterval(() => void load(), 5000)
    return () => clearInterval(interval)
  }, [load, isSeated])

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

  // Only the privileged host-state fetch knows real roles — until it resolves, fall back to
  // the plain roster with no role (never a fake "unknown" role label) rather than guessing.
  const roster: Array<{ id: string; name: string; isAlive: boolean; role: MafiaRole | null }> =
    state?.players ?? players.map((p) => ({ id: p.id, name: p.name, isAlive: !p.is_eliminated, role: null }))
  const alive = roster.filter((p) => p.isAlive)
  const eliminated = roster.filter((p) => !p.isAlive)

  return (
    <HostChrome
      gameCode={gameCode}
      hostToken={hostToken}
      game={game}
      players={players}
      onReload={onReload}
      playFirst={isSeated}
    >
      {state ? (
        <View style={styles.phaseCard}>
          <Text style={styles.phaseLabel}>Phase</Text>
          <Text style={styles.phase}>{state.phase.replace(/_/g, ' ')}</Text>
          <Text style={styles.day}>Day {state.dayNumber}</Text>
          {state.winningTeam ? <Text style={styles.winner}>{state.winningTeam} wins</Text> : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Alive ({alive.length})</Text>
      {alive.map((p) => (
        <View key={p.id} style={styles.playerRow}>
          <Text style={styles.playerName}>{p.name}</Text>
          {p.role ? (
            <Text style={styles.playerRole}>
              {mafiaRoleEmoji(p.role)} {MAFIA_ROLE_INFO[p.role]?.name ?? p.role}
            </Text>
          ) : null}
        </View>
      ))}

      {eliminated.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Eliminated ({eliminated.length})</Text>
          {eliminated.map((p) => (
            <View key={p.id} style={[styles.playerRow, styles.playerRowDead]}>
              <Text style={[styles.playerName, styles.playerNameDead]}>{p.name}</Text>
              {p.role ? (
                <Text style={styles.playerRole}>
                  {mafiaRoleEmoji(p.role)} {MAFIA_ROLE_INFO[p.role]?.name ?? p.role}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      {game.status === 'active' ? (
        <Pressable
          style={[styles.primaryBtn, advancing && styles.btnDisabled]}
          disabled={advancing}
          onPress={() => void onAdvance()}
        >
          {advancing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Advance phase</Text>}
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    phaseCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      alignItems: 'center',
      gap: 4,
    },
    phaseLabel: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    phase: { color: theme.text, fontSize: 22, fontWeight: '800', textTransform: 'capitalize' },
    day: { color: theme.textMuted, fontSize: 14 },
    winner: { color: '#86efac', fontSize: 16, fontWeight: '700', marginTop: 4 },
    sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
    playerRow: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    playerRowDead: { opacity: 0.6 },
    playerName: { color: theme.text, fontSize: 15, fontWeight: '500' },
    playerNameDead: { textDecorationLine: 'line-through' },
    playerRole: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    // White on the solid rose button — intentional, correct in both schemes.
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: { color: theme.text, fontWeight: '600' },
    btnDisabled: { opacity: 0.5 },
    error: { color: theme.error, fontSize: 14 },
  })
