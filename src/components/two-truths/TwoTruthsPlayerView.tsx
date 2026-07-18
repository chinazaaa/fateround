'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { TwoTruthsActiveRound } from '@/components/two-truths/TwoTruthsActiveRound'
import { TwoTruthsLobbySubmit } from '@/components/two-truths/TwoTruthsLobbySubmit'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import { ROUND_SELECT, TTL_GUESS_SELECT, TTL_STATEMENT_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, Round, TtlGuess, TtlStatement } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EliminationBanner } from '@/components/EliminationBanner'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'lobby'
  | 'playing'
  | 'not_found'

export function TwoTruthsPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError, success } = useToast()
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<TtlGuess[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  // Game-specific load: fetch this game's statements/rounds/guesses (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [stmtsRes, rdsRes, gssRes] = await Promise.all([
      supabase.from('ttl_statements').select(TTL_STATEMENT_SELECT).eq('game_id', gameCode),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('ttl_guesses').select(TTL_GUESS_SELECT).eq('game_id', gameCode),
    ])
    if (supabasePollOk(stmtsRes)) setStatements((stmtsRes.data ?? []) as TtlStatement[])
    if (supabasePollOk(rdsRes)) setRounds((rdsRes.data ?? []) as Round[])
    if (supabasePollOk(gssRes)) setGuesses((gssRes.data ?? []) as TtlGuess[])
    return { state: null, ok: supabasePollOk(stmtsRes, rdsRes, gssRes) }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    // A finished game shows the ended screen to everyone, including joined players.
    if (gameData.status === 'finished') return 'game_ended'
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    return gameData.status === 'waiting' ? 'lobby' : 'playing'
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
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
    onJoinSuccess: (data) => success(`Joined as ${data.playerName}`),
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  useTurnNotifications({ status: game?.status })

  // Realtime push: reload on any change to this game's row + its tables.
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'ttl_statements', 'ttl_guesses'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [setScreen, load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'game_started_waiting' || screen === 'playing') void load()
  })

  const router = useRouter()
  const me = players.find((p) => p.id === myPlayerId)
  const myPlayerName = me?.name ?? ''
  // In the lobby, everyone can participate regardless of spectator flag (gets cleared on reset)
  const isViewer = !!(game && me && game.status !== 'waiting' && playerIsViewer(me, game))
  // …but a genuine spectator/eliminated player sitting in the lobby must NOT fall into the
  // statement-submit flow. isViewer is intentionally false during 'waiting', so guard the
  // submit path explicitly on the spectator/eliminated flags (normal play clears spectator
  // on reset, so this only bites an actual watch-only viewer).
  const isLobbyWatcher = !!(me && (me.spectator === true || me.is_eliminated === true))

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
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('two_truths')
  const myStatement = myPlayerId ? statements.find((s) => s.player_id === myPlayerId) : null
  const existingStatements = myStatement
    ? ([myStatement.statement_a, myStatement.statement_b, myStatement.statement_c] as [string, string, string])
    : null
  const [editingStatements, setEditingStatements] = useState(false)
  const prevMyStatement = useRef(myStatement)
  useEffect(() => {
    if (!prevMyStatement.current && myStatement) setEditingStatements(false)
    prevMyStatement.current = myStatement
  }, [myStatement])

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
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
  }, [myPlayerId, game?.status, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-xl font-bold">Game not found</p>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        playersAllowed={allowLatePlayers(game)}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
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

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="two_truths" />}
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="two_truths_guesser"
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'lobby' && myPlayerId) {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myPlayerName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Lobby"
          rulesLink={<GameRulesLink gameType="two_truths" variant="subtle" />}
          isSpectator={me?.spectator === true || me?.is_eliminated === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
          activity={
            isViewer || isLobbyWatcher ? (
              <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
            ) : myStatement && !editingStatements ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center space-y-1">
                  <p className="text-2xl">✓</p>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">Statements submitted</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Waiting for the host to start the game…
                  </p>
                </div>
                <button type="button" onClick={() => setEditingStatements(true)} className="btn-secondary w-full">
                  Edit my statements
                </button>
              </div>
            ) : myStatement && editingStatements ? (
              <div className="space-y-4">
                <TwoTruthsLobbySubmit
                  gameCode={gameCode}
                  resumeToken={myResumeToken}
                  existingLieIndex={myStatement.lie_index}
                  existingStatements={existingStatements}
                  onSaved={() => {
                    setEditingStatements(false)
                    load()
                  }}
                />
                <button type="button" onClick={() => setEditingStatements(false)} className="btn-secondary w-full">
                  Cancel
                </button>
              </div>
            ) : (
              <TwoTruthsLobbySubmit gameCode={gameCode} resumeToken={myResumeToken} onSaved={load} />
            )
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'playing' && game && myPlayerId) {
    return (
      <div className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="text-3xl">{cfg.headerEmoji}</div>
            <h1 className="text-xl font-black gradient-title">{game.title}</h1>
          </div>
          {me && <EliminationBanner player={me} />}
          {isViewer && (
            <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
          )}
          <TwoTruthsActiveRound
            gameCode={gameCode}
            game={game}
            players={players}
            rounds={rounds}
            guesses={guesses}
            myPlayerId={myPlayerId}
            myResumeToken={myResumeToken}
            playerName={myPlayerName}
            onReload={load}
            readOnly={isViewer}
          />
        </div>
      </div>
    )
  }

  return null
}
