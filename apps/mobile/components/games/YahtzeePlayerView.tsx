import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { type YahtzeeCategory, type YahtzeePlayerScore, type YahtzeeSession } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  YAHTZEE_CATEGORY_LABELS,
  YAHTZEE_MIN_PLAYERS,
  currentPlayerId,
  jokerApplies,
  matchingUpperCategory,
  totalScore,
} from '@fateround/shared/yahtzee'
import { preJoinScreen } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { YahtzeeDiceTray } from '@/components/games/YahtzeeDiceTray'
import { YahtzeeScorecardGrid } from '@/components/games/YahtzeeScorecardGrid'
import { YahtzeeShareCard } from '@/components/games/YahtzeeShareCard'
import { useToast } from '@/components/ui/Toast'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGameTurnAlerts } from '@/hooks/useGameTurnAlerts'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useYahtzeeTurnExpiry } from '@/hooks/useYahtzeeTurnExpiry'
import { postYahtzeeHold, postYahtzeeRoll, postYahtzeeScore } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

export function YahtzeePlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const { show: showToast } = useToast()
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [localHeld, setLocalHeld] = useState<boolean[]>([false, false, false, false, false])
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: YahtzeeSession | null; ok: boolean }> => {
    const [sessionRes, scoresRes] = await Promise.all([
      getSupabase()
        .from('yahtzee_sessions')
        .select(YAHTZEE_SESSION_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .maybeSingle(),
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
      if (!playerId) {
        const pre = preJoinScreen(game, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
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
    !!bootstrap.game,
    bootstrap.game?.status
  )

  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId

  // Foreground game-started + your-turn toasts. Enabled from the lobby so the
  // waiting→active transition fires the "Game started" ping (not just once
  // already in-play).
  useGameTurnAlerts({
    gameCode: bootstrap.code,
    status: bootstrap.game?.status,
    isMyTurn,
    enabled: bootstrap.screen === 'waiting' || bootstrap.screen === 'playing',
    startMessage: 'Five Dice starting! 🎲',
  })

  // Game-finished toast — fires once when the game reaches the finished screen
  // (mirrors the web finish flow's confirmation). The rich standings are shown
  // by GameFinishPanel; this is the lightweight foreground ping.
  const finishToastedRef = useRef(false)
  useEffect(() => {
    if (bootstrap.screen === 'finished' && !finishToastedRef.current) {
      finishToastedRef.current = true
      showToast('Game over — final scores are in! 🏁', 'info')
    } else if (bootstrap.screen === 'playing' || bootstrap.screen === 'waiting') {
      // Reset so a "Play again" round can toast again on its own finish.
      finishToastedRef.current = false
    }
  }, [bootstrap.screen, showToast])

  // Turn timer: count down from turn_deadline_at during the rolling phase, and
  // ask the server to expire the turn once the deadline passes.
  const timerActive = bootstrap.screen === 'playing' && session?.phase === 'rolling' && !!session?.turn_deadline_at
  useYahtzeeTurnExpiry(bootstrap.code, session, bootstrap.screen === 'playing')

  const roll = async () => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      // The dice-roll sound is played by YahtzeeDiceTray when the new dice
      // values arrive, so it stays in sync with the tumble animation.
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
      playSound('pop') // score-submitted chime
      await postYahtzeeScore(bootstrap.code, bootstrap.myResumeToken, category)
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  // Roster drawer scoreboard: total score headline + filled-categories detail.
  const rosterScores = useMemo(
    () => Object.fromEntries(scores.map((s) => [s.player_id, totalScore(s.scores.categories, s.scores.bonusYahtzees)])),
    [scores]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        scores.map((s) => {
          const filled = Object.values(s.scores.categories).filter((v) => v !== null).length
          return [s.player_id, `📋 ${filled}/13 filled`]
        })
      ),
    [scores]
  )
  useGameStats(rosterDetails)

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }
  if (bootstrap.screen === 'join' && bootstrap.game) {
    // Mid-game the only way in is as a read-only viewer.
    const joiningAsViewer = bootstrap.game.status === 'active'
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join(undefined, joiningAsViewer ? { joinAsViewer: true } : undefined)}
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        kicker={joiningAsViewer ? 'Watch game' : 'Join game'}
        hint={
          joiningAsViewer
            ? 'Game in progress — enter a name to watch as a viewer (read-only).'
            : 'No account needed — enter a display name and play.'
        }
        submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (bootstrap.game.replay_pending) {
      return (
        <GameShell bootstrap={bootstrap} title={batch3GameLabel('yahtzee')}>
          <ReplayReadyRing
            gameCode={bootstrap.code}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
            myResumeToken={bootstrap.myResumeToken ?? null}
            minPlayers={YAHTZEE_MIN_PLAYERS}
            onReload={() => bootstrap.load()}
          />
        </GameShell>
      )
    }
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !session) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const totals = scores
      .map((s) => ({
        name: bootstrap.players.find((p) => p.id === s.player_id)?.name ?? 'Player',
        total: totalScore(s.scores.categories, s.scores.bonusYahtzees),
      }))
      .sort((a, b) => b.total - a.total)
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('yahtzee')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          detail={totals[0] ? `${totals[0].name} wins (${totals[0].total})` : undefined}
          winnerPlayerId={scores.length > 1 ? session.winner_player_id : null}
          roundKey={session.id}
          notice={
            <YahtzeeShareCard
              scores={scores}
              players={bootstrap.players}
              winnerName={totals[0]?.name ?? null}
              highlightPlayerId={bootstrap.myPlayerId}
              hideHeader
            />
          }
        />
      </GameShell>
    )
  }

  const dice = session.dice ?? [1, 1, 1, 1, 1]
  const canScore = isMyTurn && (session.rolls_this_turn ?? 0) > 0
  const turnName = bootstrap.players.find((p) => p.id === turnPlayerId)?.name ?? 'Someone'

  // Joker rule guide — names the forced box before the player taps, rather than after a
  // rejected score. See the web player view for the reasoning.
  const jokerForcedBox = (() => {
    if (!canScore || !dice) return null
    const myCats = scores.find((s) => s.player_id === bootstrap.myPlayerId)?.scores.categories
    if (!myCats || !jokerApplies(dice, myCats)) return null
    const forced = matchingUpperCategory(dice)
    return forced && myCats[forced] == null ? YAHTZEE_CATEGORY_LABELS[forced] : null
  })()

  return (
    <GameShell
      bootstrap={bootstrap}
      title={batch3GameLabel('yahtzee')}
      subtitle={isMyTurn ? 'Your turn' : `${turnName}'s turn`}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <YahtzeeDiceTray
          dice={dice}
          held={localHeld}
          rollsThisTurn={session.rolls_this_turn ?? 0}
          rollsRemaining={session.rolls_remaining ?? 0}
          isMyTurn={isMyTurn}
          interactive={isMyTurn && (session.rolls_this_turn ?? 0) > 0}
          onToggleHold={(index) => void toggleHold(index)}
          onRoll={() => void roll()}
          rolling={acting}
          timerActive={timerActive}
          turnDeadlineAt={session?.turn_deadline_at}
        />

        {session.status_message ? <Text style={styles.status}>{session.status_message}</Text> : null}

        {jokerForcedBox ? (
          <Text style={styles.jokerHint}>
            🃏 Joker rule. Score this five-of-a-kind in your {jokerForcedBox} box first.
          </Text>
        ) : null}

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
    jokerHint: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: '#7c3aed',
      paddingVertical: 6,
    },
    status: { color: theme.textMuted, textAlign: 'center' },
  })
