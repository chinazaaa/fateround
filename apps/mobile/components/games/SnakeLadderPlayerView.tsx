import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type SnakeLadderPlayerState,
  type SnakeLadderSession,
} from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import { buildSnakeLadderStandings, currentPlayerId } from '@fateround/shared/snake-and-ladder'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postSnakeLadderRoll } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { SNAKE_LADDER_PLAYER_STATE_SELECT, SNAKE_LADDER_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { SnakeLadderBoard } from '@/components/games/snake-ladder/SnakeLadderBoard'
import { SnakeLadderDie } from '@/components/games/snake-ladder/SnakeLadderDie'
import { SnakeLadderTurnBar } from '@/components/games/snake-ladder/SnakeLadderTurnBar'
import { SnakeLadderShareCard } from '@/components/games/snake-ladder/SnakeLadderShareCard'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

/** Minimum time the die keeps spinning after a roll, so the moment reads as tactile. */
const ROLL_MIN_MS = 700
/** After someone reaches 100, linger on the board so everyone sees the winning
 *  move land before the final leaderboard appears. */
const WIN_HOLD_MS = 9000

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
}

export function SnakeLadderPlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<SnakeLadderSession | null>(null)
  const [states, setStates] = useState<SnakeLadderPlayerState[]>([])
  const [acting, setActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [holdWin, setHoldWin] = useState(false)
  const rollStartedRef = useRef(0)
  const winHandledRef = useRef(false)
  const sawActiveRef = useRef(false)
  const styles = useThemedStyles(makeStyles)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      getSupabase()
        .from('snake_ladder_sessions')
        .select(SNAKE_LADDER_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle(),
      getSupabase()
        .from('snake_ladder_player_state')
        .select(SNAKE_LADDER_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .order('player_order'),
    ])
    if (sessionRes.error || statesRes.error) return { state: null, ok: false }
    setSession(sessionRes.data as SnakeLadderSession | null)
    setStates((statesRes.data as SnakeLadderPlayerState[]) ?? [])
    return { state: null, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active') return 'playing'
      return 'finished'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'snake_ladder_sessions', 'snake_ladder_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId
  const turnPlayerName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? null

  const timerActive = bootstrap.screen === 'playing' && session?.phase !== 'finished'
  const hasTimer = timerActive && !!session?.turn_deadline_at
  const secondsLeft = useAbsoluteDeadline(session?.turn_deadline_at, hasTimer)

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  const standings = session ? buildSnakeLadderStandings(states, bootstrap.players, session.winner_player_id) : []

  // Live roster: furthest-along first, with the player on the move bumped to the
  // top on position ties, then seat order. (Finished standings use buildSnakeLadderStandings.)
  const roster = useMemo(() => {
    return [...states]
      .sort((a, b) => {
        const byPosition = b.position - a.position
        if (byPosition !== 0) return byPosition
        const aIsTurn = a.player_id === turnPlayerId ? 1 : 0
        const bIsTurn = b.player_id === turnPlayerId ? 1 : 0
        if (aIsTurn !== bIsTurn) return bIsTurn - aIsTurn
        return a.player_order - b.player_order
      })
      .map((s) => ({
        playerId: s.player_id,
        name: bootstrap.players.find((p) => p.id === s.player_id)?.name ?? 'Player',
        color: s.color,
        position: s.position,
      }))
  }, [states, turnPlayerId, bootstrap.players])

  // Hold on the finished board for a few seconds so the winning move is visible
  // before switching to the final leaderboard. Only triggers when we witnessed live
  // play (so opening an already-finished game for replay doesn't re-hold). Resets on replay.
  useEffect(() => {
    const status = bootstrap.game?.status
    if (status === 'active') sawActiveRef.current = true
    const finishedWithWinner = status === 'finished' && !!session?.winner_player_id
    if (finishedWithWinner && sawActiveRef.current && !winHandledRef.current) {
      winHandledRef.current = true
      setHoldWin(true)
      const t = setTimeout(() => setHoldWin(false), WIN_HOLD_MS)
      return () => clearTimeout(t)
    }
    if (status !== 'finished') {
      winHandledRef.current = false
      setHoldWin(false)
      if (status === 'waiting') sawActiveRef.current = false
    }
  }, [bootstrap.game?.status, session?.winner_player_id])

  const roll = async () => {
    if (!bootstrap.myResumeToken || acting || !isMyTurn) return
    setActing(true)
    setRolling(true)
    rollStartedRef.current = Date.now()
    try {
      playSound('dice')
      await postSnakeLadderRoll(bootstrap.code, bootstrap.myResumeToken)
      await bootstrap.load()
    } finally {
      setActing(false)
      // Keep the die visibly spinning for at least ROLL_MIN_MS before it settles.
      const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedRef.current))
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      setRolling(false)
    }
  }

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !session) return <GameLoading />

  // While holding, keep rendering the active board (with a winner banner) instead of the leaderboard.
  const effectiveScreen =
    holdWin && bootstrap.screen === 'finished' && states.length > 0 ? 'playing' : bootstrap.screen

  if (effectiveScreen === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === session.winner_player_id)
    const endedEarly = !session.winner_player_id
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('snake_and_ladder')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winner ? `${winner.name} wins!` : 'Game over'}
          subtitle="Final standings"
          winnerPlayerId={session.winner_player_id}
          roundKey={session.id}
          notice={
            <SnakeLadderShareCard
              standings={standings}
              winnerName={winner?.name ?? null}
              endedEarly={endedEarly}
              highlightPlayerId={bootstrap.myPlayerId}
              hideHeader
            />
          }
        />
      </GameShell>
    )
  }

  const holdWinner = holdWin ? bootstrap.players.find((p) => p.id === session.winner_player_id) : null

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('snake_and_ladder')} subtitle={session.status_message ?? bootstrap.code}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {holdWinner ? (
          <View style={styles.winBanner}>
            <Text style={styles.winBannerTitle}>🏆 {holdWinner.name} wins!</Text>
            <Text style={styles.winBannerSub}>Final results in a moment…</Text>
          </View>
        ) : (
          <View style={styles.turnBarWrap}>
            <SnakeLadderTurnBar
              turnPlayerName={turnPlayerName}
              isMyTurn={isMyTurn}
              secondsLeft={secondsLeft}
              hasTimer={hasTimer}
            />
          </View>
        )}

        <SnakeLadderBoard states={states} highlightSquare={session.last_to} />

        <View style={styles.list}>
          {roster.map((row) => {
            const isTurn = row.playerId === turnPlayerId
            const isMe = row.playerId === bootstrap.myPlayerId
            return (
              <View key={row.playerId} style={[styles.row, isTurn && styles.rowTurn]}>
                <View style={[styles.dot, { backgroundColor: COLOR_HEX[row.color] ?? '#64748b' }]} />
                <Text style={styles.name}>
                  {row.name}
                  {isMe ? ' (you)' : ''}
                </Text>
                <Text style={styles.pos}>{row.position === 0 ? 'Start' : row.position >= 100 ? 'Home!' : `Sq ${row.position}`}</Text>
              </View>
            )
          })}
        </View>

        <View style={styles.dieRow}>
          <SnakeLadderDie value={session.last_roll ?? 1} rolling={rolling} />
          {session.last_roll && !rolling ? (
            <Text style={styles.rollInfo}>
              Last roll: {session.last_roll}
              {session.last_from != null && session.last_to != null ? `\n${session.last_from} → ${session.last_to}` : ''}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {holdWin ? null : (
        <Pressable style={[styles.btn, (!isMyTurn || acting || rolling) && styles.btnDisabled]} disabled={!isMyTurn || acting || rolling} onPress={() => void roll()}>
          <Text style={styles.btnText}>{isMyTurn ? (acting || rolling ? 'Rolling…' : '🎲 Roll dice') : 'Waiting for turn…'}</Text>
        </Pressable>
      )}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  scroll: { flex: 1, marginHorizontal: -16 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { gap: 8, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  rowTurn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { color: theme.text, flex: 1, fontWeight: '600' },
  pos: { color: '#fcd34d', fontWeight: '700' },
  turnBarWrap: { marginBottom: 12 },
  winBanner: { marginBottom: 12, padding: 12, borderRadius: 12, alignItems: 'center', backgroundColor: theme.primarySoft, borderWidth: 1, borderColor: theme.primary },
  winBannerTitle: { color: theme.text, fontWeight: '900', fontSize: 18 },
  winBannerSub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  dieRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginVertical: 12 },
  rollInfo: { color: theme.textMuted, textAlign: 'center' },
  btn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.45 },
  // white on the solid rose button — intentional
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
