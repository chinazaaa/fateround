import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type YahtzeeCategory,
  type YahtzeePlayerScore,
  type YahtzeeSession,
} from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  currentPlayerId,
  totalScore,
} from '@fateround/shared/yahtzee'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { YahtzeeScorecardGrid } from '@/components/games/YahtzeeScorecardGrid'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useYahtzeeTurnExpiry } from '@/hooks/useYahtzeeTurnExpiry'
import { postYahtzeeHold, postYahtzeeRoll, postYahtzeeScore } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function YahtzeePlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [localHeld, setLocalHeld] = useState<boolean[]>([false, false, false, false, false])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: YahtzeeSession | null; ok: boolean }> => {
    const [sessionRes, scoresRes] = await Promise.all([
      getSupabase().from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode.toUpperCase()).maybeSingle(),
      getSupabase()
        .from('yahtzee_player_scores')
        .select(YAHTZEE_PLAYER_SCORES_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .order('player_order'),
    ])
    if (sessionRes.error || scoresRes.error) return { state: null, ok: false }
    const sessionData = sessionRes.data as YahtzeeSession | null
    setSession(sessionData)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])
    if (sessionData?.held) setLocalHeld(sessionData.held)
    return { state: sessionData, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, YahtzeeSession | null>({
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
    [{ table: 'games', column: 'id' }, 'yahtzee_sessions', 'yahtzee_player_scores'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId

  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'playing',
  })

  // Turn timer: count down from turn_deadline_at during the rolling phase, and
  // ask the server to expire the turn once the deadline passes.
  const timerActive =
    bootstrap.screen === 'playing' && session?.phase === 'rolling' && !!session?.turn_deadline_at
  const secondsLeft = useDeadlineCountdown(session?.turn_deadline_at, 0, timerActive)
  useYahtzeeTurnExpiry(bootstrap.code, session, bootstrap.screen === 'playing')

  const roll = async () => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      playSound('dice')
      await postYahtzeeRoll(bootstrap.code, bootstrap.myResumeToken)
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const toggleHold = async (index: number) => {
    if (!bootstrap.myResumeToken || !session || !isMyTurn) return
    const next = [...localHeld]
    next[index] = !next[index]
    setLocalHeld(next)
    await postYahtzeeHold(bootstrap.code, bootstrap.myResumeToken, next)
  }

  const scoreCategory = async (category: YahtzeeCategory) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await postYahtzeeScore(bootstrap.code, bootstrap.myResumeToken, category)
      await bootstrap.load()
    } finally {
      setActing(false)
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

  if (bootstrap.screen === 'finished') {
    const totals = scores
      .map((s) => ({
        name: bootstrap.players.find((p) => p.id === s.player_id)?.name ?? 'Player',
        total: totalScore(s.scores.categories),
      }))
      .sort((a, b) => b.total - a.total)
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('yahtzee')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Game over" detail={totals[0] ? `${totals[0].name} wins (${totals[0].total})` : undefined} leaderboard={scoreListLeaderboard(totals.map((row) => ({ name: row.name, score: row.total })))} />
      </GameShell>
    )
  }

  const dice = session.dice ?? [1, 1, 1, 1, 1]
  const canRoll = isMyTurn && (session.rolls_remaining ?? 0) > 0
  const canScore = isMyTurn && (session.rolls_this_turn ?? 0) > 0
  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('yahtzee')} subtitle={isMyTurn ? 'Your turn' : `${turnName}'s turn`}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.diceRow}>
          {dice.map((value, index) => (
            <Pressable
              key={index}
              style={[styles.die, localHeld[index] && styles.dieHeld]}
              disabled={!isMyTurn || (session.rolls_this_turn ?? 0) < 1}
              onPress={() => void toggleHold(index)}
            >
              <Text style={styles.dieText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {timerActive ? (
          <View style={styles.timerRow}>
            <TimerBadge seconds={secondsLeft} urgentAt={20} enableAlerts={isMyTurn} />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={[styles.btn, !canRoll && styles.btnDisabled]} disabled={!canRoll || acting} onPress={() => void roll()}>
            <Text style={styles.btnText}>Roll ({session.rolls_remaining ?? 0} left)</Text>
          </Pressable>
        </View>

        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}

        <YahtzeeScorecardGrid
          players={bootstrap.players}
          scores={scores}
          myPlayerId={bootstrap.myPlayerId}
          activePlayerId={turnPlayerId}
          dice={dice}
          scoringEnabled={canScore && !acting}
          onScore={(category) => void scoreCategory(category)}
        />
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 24 },
  diceRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  // Die faces are functional game pieces — colors left untouched.
  die: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#17171d',
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dieHeld: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  // White on the dark die face — intentional (case 2).
  dieText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  timerRow: { alignItems: 'center' },
  actions: { alignItems: 'center' },
  btn: { backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  btnDisabled: { opacity: 0.45 },
  // White on the solid primary button — intentional (case 2).
  btnText: { color: '#fff', fontWeight: '800' },
  status: { color: theme.textMuted, textAlign: 'center' },
})
