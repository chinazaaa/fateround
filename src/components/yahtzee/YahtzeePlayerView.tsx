'use client'

// Yahtzee: player-facing roll/hold/score loop.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  YahtzeeCard,
  YahtzeeDiceTray,
  YahtzeeLoadingScreen,
  YahtzeePrimaryButton,
  YahtzeeSecondaryButton,
  YahtzeeShell,
} from '@/components/yahtzee/YahtzeeChrome'
import { YahtzeeLeaderboard, YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import { YahtzeeFinalResultsShareBlock } from '@/components/yahtzee/YahtzeeFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId, totalScore, YAHTZEE_MIN_PLAYERS } from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import { YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, YahtzeeCategory, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useYahtzeeNotifications, playYahtzeeScoreSound } from '@/hooks/useYahtzeeNotifications'
import { useYahtzeeTurnTimer } from '@/hooks/useYahtzeeTurnTimer'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function YahtzeePlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)
  const [localHeld, setLocalHeld] = useState<boolean[]>([false, false, false, false, false])
  const turnIndexRef = useRef<number | null>(null)

  // Game-specific load: fetch this game's yahtzee session + per-player scores (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: YahtzeeSession | null; ok: boolean }> => {
    const [sessionRes, scoresRes] = await Promise.all([
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('yahtzee_player_scores')
        .select(YAHTZEE_PLAYER_SCORES_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as YahtzeeSession | null) : null
    if (supabasePollOk(sessionRes)) setSession(sessionData)
    if (supabasePollOk(scoresRes)) setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])
    return { state: sessionData, ok: supabasePollOk(sessionRes, scoresRes) }
  }, [gameCode])

  // Post-resolve seam: keep mid-turn optimistic "held" dice from being clobbered by a
  // reload. This needs the resolved playerId (to tell whose turn it is), so it runs after
  // session resolution and before the screen is computed — exactly where the pre-migration
  // inline sync sat. Side effect only (updates local held/turn refs); no screen change.
  const afterResolve = useCallback((_game: Game, playerId: string | null, sessionData: YahtzeeSession | null): void => {
    if (!sessionData) return
    const turnChanged = turnIndexRef.current !== sessionData.current_turn_index
    const isMyActiveTurn = playerId != null && currentPlayerId(sessionData) === playerId
    const midTurn = (sessionData.rolls_this_turn ?? 0) > 0

    if (turnChanged || !isMyActiveTurn || !midTurn) {
      turnIndexRef.current = sessionData.current_turn_index
      setLocalHeld(sessionData.held ?? [false, false, false, false, false])
    }
  }, [])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'active') return 'active'
    return 'finished'
  }, [])

  const {
    screen,
    setScreen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<Screen, YahtzeeSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    afterResolve,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'yahtzee_sessions', 'yahtzee_player_scores'],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  // Ready-up ring: readiness = holding a seat, so this reuses /players/ready (which
  // toggles the spectator flag). `ready:false` sits the player back out.
  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) return
      setReplayReadyPending(true)
      try {
        const res = await fetch('/api/players/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  const postAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const toggleHold = (index: number) => {
    if (!session || !myPlayerId || currentPlayerId(session) !== myPlayerId) return
    if ((session.rolls_this_turn ?? 0) < 1) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }

    const next = [...localHeld]
    next[index] = !next[index]
    setLocalHeld(next)

    void fetch('/api/yahtzee/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, held: next }),
    }).then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        setLocalHeld(session.held ?? [false, false, false, false, false])
        toastError(data.error ?? 'Could not keep dice')
      }
    })
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('yahtzee')
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === myPlayerId
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const canScore = isMyTurn && (session?.rolls_this_turn ?? 0) > 0

  // Audio notifications
  useYahtzeeNotifications({ game, session, myPlayerId, enabled: screen === 'active' })

  // Turn timer countdown (also fires expire-turn when deadline passes)
  const { secondsLeft, hasTimer, urgent } = useYahtzeeTurnTimer(gameCode, session, screen === 'active')

  if (screen === 'loading') return <YahtzeeLoadingScreen />

  if (screen === 'not_found') {
    return (
      <YahtzeeShell title="Game not found">
        <YahtzeePrimaryButton onClick={() => router.push('/')}>Back home</YahtzeePrimaryButton>
      </YahtzeeShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => setScreen('join')} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji="🎲"
            title={game?.title ?? cfg.label}
            gameType="yahtzee"
            subtitle={
              joiningAsViewer
                ? 'Game in progress — join as a viewer and watch live (read-only).'
                : '1–6 players · roll, hold, score'
            }
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="yahtzee"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          label=""
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={YAHTZEE_MIN_PLAYERS}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for the host to start"
          rulesLink={<GameRulesLink gameType="yahtzee" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const myName = players.find((p) => p.id === myPlayerId)?.name
    // Only surface the community-leaderboard button to a genuine winner: the
    // server-picked winner, a positive total, AND more than one player (a solo
    // game has no one to beat, so there's no real win). Matches the other
    // score-based games.
    const myScoreRow = scores.find((s) => s.player_id === myPlayerId)
    const myTotal = myScoreRow ? totalScore(myScoreRow.scores.categories) : 0
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId && myTotal > 0 && scores.length > 1
    const shareWinnerName = iWon ? myName : winner?.name

    return (
      <YahtzeeShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        {game && scores.length > 0 ? (
          <YahtzeeFinalResultsShareBlock
            game={game}
            players={players}
            scores={scores}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <>
            <YahtzeeCard className="py-10 text-center">
              <div className="text-6xl mb-3">🏆</div>
              {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
            </YahtzeeCard>
            <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={myPlayerId} />
            <YahtzeeSecondaryButton onClick={() => router.push('/games')}>Create a new game</YahtzeeSecondaryButton>
          </>
        )}
        {iWon && game && (
          <PostWinToCommunity gameType="yahtzee" gameCode={gameCode} winnerName={myName ?? ''} roundKey={session?.id} />
        )}
      </YahtzeeShell>
    )
  }

  if (!session) {
    return <YahtzeeLoadingScreen />
  }

  const myPlayer = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && myPlayer && playerIsViewer(myPlayer, game))
  const myName = myPlayer?.name ?? ''

  if (isViewer) {
    return (
      <YahtzeeShell title={game?.title} wide compact>
        <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={myPlayer} />
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            spectating={isViewer}
          />
        )}
        <div className="space-y-2">
          <YahtzeeScorecard
            players={players}
            scores={scores}
            activePlayerId={turnPlayerId}
            dice={session.dice}
            scoringEnabled={false}
          />
          <YahtzeeDiceTray
            dice={session.dice}
            held={session.held}
            rollsThisTurn={session.rolls_this_turn}
            rollsRemaining={session.rolls_remaining}
            turnName={turnPlayer?.name}
            secondsLeft={secondsLeft}
            hasTimer={hasTimer}
            urgent={urgent}
            spectator
          />
        </div>
      </YahtzeeShell>
    )
  }

  return (
    <YahtzeeShell title={game?.title} wide compact>
      {myPlayerId && myName && (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          spectating={isViewer}
        />
      )}
      <div className="space-y-2">
        <YahtzeeScorecard
          players={players}
          scores={scores}
          myPlayerId={myPlayerId}
          activePlayerId={turnPlayerId}
          dice={session.dice}
          scoringEnabled={canScore}
          onScore={(category: YahtzeeCategory) => {
            playYahtzeeScoreSound()
            void postAction('/api/yahtzee/score', { category })
          }}
        />

        <YahtzeeDiceTray
          dice={session.dice}
          held={localHeld}
          rollsThisTurn={session.rolls_this_turn}
          rollsRemaining={session.rolls_remaining}
          interactive={isMyTurn && (session.rolls_this_turn ?? 0) > 0}
          onToggleHold={toggleHold}
          onRoll={() => postAction('/api/yahtzee/roll')}
          rolling={acting}
          isMyTurn={isMyTurn}
          turnName={turnPlayer?.name}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      </div>
    </YahtzeeShell>
  )
}
