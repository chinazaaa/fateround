'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ScrabbleCard,
  ScrabbleLoadingScreen,
  ScrabbleSecondaryButton,
  ScrabbleShell,
} from '@/components/scrabble/ScrabbleChrome'
import { ScrabbleFinalResultsShareBlock } from '@/components/scrabble/ScrabbleFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ScrabbleGamePanel } from '@/components/scrabble/ScrabbleBoard'
import { ScrabbleGameTimerBar } from '@/components/scrabble/ScrabbleGameTimerBar'
import { gameTypeConfig } from '@/lib/game-types'
import { SCRABBLE_MIN_PLAYERS } from '@/lib/scrabble'
import { currentTurnPlayerId, isScrabbleResultsPhase } from '@/lib/scrabble-board'
import { tileSetForDictionary } from '@/lib/scrabble-rulesets'
import { supabase } from '@/lib/supabase'
import { SCRABBLE_SESSION_SELECT, SCRABBLE_PLAYER_STATE_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, ScrabbleSession, ScrabblePlayerState, ScrabblePlacedTile } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameScores, useGameStats, useRosterBase } from '@/components/roster/RosterDrawerContext'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { RulesInPlaySection } from '@/components/game-lobby/RulesInPlaySection'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function ScrabblePlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<ScrabbleSession | null>(null)
  const sessionRef = useRef<ScrabbleSession | null>(null)
  sessionRef.current = session
  const [playerStates, setPlayerStates] = useState<ScrabblePlayerState[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)
  const [replayReadyPending, setReplayReadyPending] = useState(false)

  // Game-specific load: fetch the scrabble session + per-player state (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: ScrabbleSession | null; ok: boolean }> => {
    const [sessionRes, statesRes] = await Promise.all([
      supabase.from('scrabble_sessions').select(SCRABBLE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('scrabble_player_state').select(SCRABBLE_PLAYER_STATE_SELECT).eq('game_id', gameCode),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as ScrabbleSession | null) : null
    if (sessionData) setSession(sessionData)
    if (supabasePollOk(statesRes)) setPlayerStates((statesRes.data ?? []) as ScrabblePlayerState[])
    return { state: sessionData, ok: supabasePollOk(sessionRes, statesRes) }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: ScrabbleSession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && sessionData?.phase !== 'finished') return 'active'
      if (isScrabbleResultsPhase(gameData.status, sessionData)) return 'finished'
      return 'waiting'
    },
    []
  )

  const {
    screen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, ScrabbleSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  // Register base rows here (the board player path skips the shared dispatcher) for
  // the header drawer + its live score/tiles scoreboard.
  useRosterBase(game?.status === 'active' || game?.status === 'finished' ? players : undefined, game, myPlayerId)
  const rosterScores = useMemo(
    () => Object.fromEntries(playerStates.map((s) => [s.player_id, s.score])),
    [playerStates]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        playerStates.map((s) => [s.player_id, `🔤 ${s.rack.length} tile${s.rack.length === 1 ? '' : 's'}`])
      ),
    [playerStates]
  )
  useGameStats(rosterDetails)

  // Realtime push: reload on any change to this game's row + scrabble tables.
  // Delta fast-path (dual-table). The screen depends on session.phase, so a play (phase stays
  // 'playing') patches locally and skips the reload; when phase flips to 'finished' we reload
  // so the results screen resolves. Player-state (racks/scores) never changes the screen → skip.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as ScrabbleSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null && prev.phase !== 'finished' && next.phase !== 'finished'
  }, [])
  const applyStateRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as ScrabblePlayerState
    setPlayerStates((prev) => {
      const i = prev.findIndex((s) => s.id === next.id)
      if (i === -1) return [...prev, next]
      const copy = [...prev]
      copy[i] = next
      return copy
    })
    return true
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      { table: 'scrabble_sessions', apply: applySessionRow },
      { table: 'scrabble_player_state', apply: applyStateRow },
    ],
    load
  )

  // Safety-net poll in case a realtime event is missed / the socket drops.
  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

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

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    void load()
  }

  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
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

  const playWord = async (tiles: ScrabblePlacedTile[]) => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch('/api/scrabble/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, tiles }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Invalid play')
      } else {
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const exchangeTiles = async (tileIndices: number[]) => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch('/api/scrabble/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, tileIndices }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Exchange failed')
      } else {
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const passTurn = async () => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch('/api/scrabble/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to pass')
      } else {
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const cfg = gameTypeConfig('scrabble')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''
  const tileSet = tileSetForDictionary(game?.scrabble_dictionary_id)

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <RulesInPlaySection game={game} />
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [game, myPlayerId, game?.status, gameCode, myName, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <ScrabbleLoadingScreen />

  if (screen === 'not_found') {
    return (
      <ScrabbleShell title="Game not found">
        <ScrabbleCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <ScrabbleSecondaryButton onClick={() => router.push('/')}>Go home</ScrabbleSecondaryButton>
        </ScrabbleCard>
      </ScrabbleShell>
    )
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
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="scrabble"
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="scrabble"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="scrabble" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={SCRABBLE_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="scrabble" variant="subtle" />}
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
    const finishedName = players.find((p) => p.id === myPlayerId)?.name
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    const shareWinnerName = iWon ? finishedName : winner?.name

    return (
      <ScrabbleShell compact>
        {game ? (
          <ScrabbleFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            playerStates={playerStates}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <ScrabbleCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{session?.is_tie ? '🤝' : winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">
              {session?.is_tie
                ? "It's a tie!"
                : winner
                  ? iWon
                    ? 'You win!'
                    : `${winner.name} wins!`
                  : 'Game ended early'}
            </p>
          </ScrabbleCard>
        )}
        {iWon && game && (
          <PostWinToCommunity
            gameType="scrabble"
            gameCode={gameCode}
            winnerName={finishedName ?? ''}
            roundKey={session?.id}
          />
        )}
      </ScrabbleShell>
    )
  }

  return (
    <ScrabbleShell title={game?.title ?? cfg.label} compact wide>
      {isViewer && <ViewerModeBanner />}
      {game?.status === 'active' && <ScrabbleGameTimerBar gameCode={gameCode} game={game} />}
      {session && (
        <ScrabbleGamePanel
          session={session}
          players={players}
          playerStates={playerStates}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          tileValues={tileSet.values}
          alphabet={tileSet.alphabet}
          onPlay={isMyTurn && !isViewer ? playWord : undefined}
          onExchange={isMyTurn && !isViewer ? exchangeTiles : undefined}
          onPass={isMyTurn && !isViewer ? passTurn : undefined}
          acting={acting}
        />
      )}
    </ScrabbleShell>
  )
}
