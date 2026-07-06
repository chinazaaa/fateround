'use client'

import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'
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
import { useRoomMemberJoin, useRoomMemberNamePrefill, useRoomMemberAutoJoin } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, MafiaPublicPlayer, MafiaMyState, MafiaPhase, MafiaTeam, MafiaChatMessage } from '@/types'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

interface MafiaStateResponse {
  gameTitle: string
  status: string
  phase: MafiaPhase
  dayNumber: number
  phaseDeadline: string | null
  doctorEnabled: boolean
  detectiveEnabled: boolean
  anonymousVotes: boolean
  winningTeam: MafiaTeam | null
  players: MafiaPublicPlayer[]
  lastNightKillPlayerId: string | null
  lastNightMafiaHadTarget: boolean
  lastVoteResultPlayerId: string | null
  voteTallies: Record<string, number>
  myState: MafiaMyState | null
}

export function MafiaPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError, success: toastSuccess } = useToast()
  useConfirm()
  const [mafiaState, setMafiaState] = useState<MafiaStateResponse | null>(null)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  // Custom fetch function to fetch secure Mafia state
  const loadGameState = useCallback(async (): Promise<{ state: MafiaStateResponse | null; ok: boolean }> => {
    // Resolve myPlayerId and resumeToken from localStorage
    const localSessionKey = `game_player_${gameCode.toUpperCase()}`
    const localSessionRaw = localStorage.getItem(localSessionKey)
    let resumeToken = null
    if (localSessionRaw) {
      try {
        const parsed = JSON.parse(localSessionRaw)
        resumeToken = parsed.resumeToken
      } catch (e) {
        // Ignore
      }
    }

    try {
      const res = await fetch(`/api/mafia/${gameCode}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken }),
      })
      if (!res.ok) {
        return { state: null, ok: false }
      }
      const data = await res.json()
      setMafiaState(data)
      return { state: data, ok: true }
    } catch {
      return { state: null, ok: false }
    }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, stateData: MafiaStateResponse | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && stateData != null && stateData.phase !== 'game_over') return 'active'
      if (gameData.status === 'finished' || stateData?.phase === 'game_over') return 'finished'
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
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<Screen, MafiaStateResponse | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme('mafia') // Force deep indigo mafia theme

  // Table sync triggers state reload
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'mafia_sessions', 'mafia_player_states', 'mafia_chat_messages'],
    load
  )

  // Polling fallback
  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

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

  // Submit Night Action
  const submitNightAction = async (targetId: string) => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/night-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, targetPlayerId: targetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else {
        toastSuccess('Night action submitted')
        await load()
      }
    } catch {
      toastError('Action failed')
    } finally {
      setActing(false)
    }
  }

  // Submit Day Vote
  const submitDayVote = async (targetId: string | null) => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, targetPlayerId: targetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Vote failed')
      } else {
        toastSuccess(targetId ? 'Vote submitted' : 'Vote cleared/skipped')
        await load()
      }
    } catch {
      toastError('Vote failed')
    } finally {
      setActing(false)
    }
  }

  // Auto advance trigger on deadline expiration
  const triggerAutoAdvance = useCallback(async () => {
    try {
      await fetch(`/api/mafia/${gameCode}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAuto: true }),
      })
      await load()
    } catch {
      // Ignore
    }
  }, [gameCode, load])

  const sendMafiaMessage = useCallback(async (msg: string) => {
    if (!myResumeToken) return
    try {
      const res = await fetch(`/api/mafia/${gameCode}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, message: msg }),
      })
      if (!res.ok) {
        const data = await res.json()
        toastError(data.error ?? 'Failed to send message')
      } else {
        await load()
      }
    } catch {
      toastError('Failed to send message')
    }
  }, [gameCode, myResumeToken, load, toastError])

  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))

  if (screen === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-purple-200">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
          <p className="text-lg font-medium">Entering the village...</p>
        </div>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-extrabold text-red-500">Room Not Found</h1>
          <p>This game room does not exist or has expired.</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-semibold text-white transition"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const cfg = gameTypeConfig('mafia')
  const myName = players.find((p) => p.id === myPlayerId)?.name ?? ''
  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

  if (screen === 'join') {
    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="mafia"
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="mafia"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="mafia" variant="subtle" />
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
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="mafia" variant="subtle" />}
          isSpectator={me?.spectator === true}
        />
      </GameJoinLobbyShell>
    )
  }

  // Active game view
  if (screen === 'active' && mafiaState) {
    const { phase, dayNumber, phaseDeadline, players: publicPlayers, myState, lastNightKillPlayerId, lastNightMafiaHadTarget, lastVoteResultPlayerId } = mafiaState

    const me = publicPlayers.find(p => p.id === myPlayerId)
    const amISpectator = !!myPlayerId && me == null
    const amIAlive = me != null && me.isAlive !== false
    const myRole = myState?.role
    const myTeam = myState?.team

    // Get killed player name
    const killedPlayer = publicPlayers.find(p => p.id === lastNightKillPlayerId)
    const votedPlayer = publicPlayers.find(p => p.id === lastVoteResultPlayerId)

    return (
      <div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col font-sans">
        {isViewer && <ViewerModeBanner />}
        
        {/* Header */}
        <header className="px-6 py-4 border-b border-indigo-950 bg-slate-950/80 backdrop-blur flex justify-between items-center shadow-lg">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🐺</span>
            <div>
              <h1 className="font-bold text-lg text-purple-300">Mafia</h1>
              <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold">
                {phase === 'role_reveal' ? 'Intro' : `Day ${dayNumber} — ${phase.replace('_', ' ')}`}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <GameRulesLink gameType="mafia" />
            <PlayerSessionControls
              gameCode={gameCode}
              playerId={myPlayerId!}
              currentName={myName}
              onRenamed={() => { void load() }}
              onLeft={handlePlayerLeft}
            />
          </div>
        </header>

        {/* Timer Banner */}
        <PhaseTimer deadline={phaseDeadline} onExpired={triggerAutoAdvance} />

        {/* Main Content Grid */}
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left panel: My Secret Role & Status */}
          <div className="md:col-span-1 bg-slate-900/60 border border-indigo-950/80 rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-xl backdrop-blur">
            <h2 className="text-sm font-semibold tracking-widest uppercase text-indigo-400 mb-4">Your Identity</h2>
            {myState ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="text-6xl animate-pulse">
                  {myRole === 'mafia' ? '🔪' : myRole === 'doctor' ? '🏥' : myRole === 'detective' ? '🔍' : '🏘️'}
                </div>
                <div className={`text-2xl font-extrabold tracking-wider ${myTeam === 'mafia' ? 'text-red-500' : 'text-emerald-400'}`}>
                  {myRole ? myRole.toUpperCase() : 'VILLAGER'}
                </div>
                <div className="text-xs text-slate-400 px-3 py-1 bg-indigo-950/40 rounded-full border border-indigo-900/30">
                  Team: {myTeam === 'mafia' ? 'Mafia 🔪' : 'Village 🏘️'}
                </div>
                <div className="mt-4 text-sm text-slate-300">
                  {myRole === 'mafia' && 'Eliminate villagers during the night and avoid getting voted out during the day.'}
                  {myRole === 'doctor' && 'Protect one player each night from getting eliminated.'}
                  {myRole === 'detective' && 'Investigate one player each night to uncover their alignment.'}
                  {myRole === 'villager' && 'Discuss during the day to find the hidden Mafia members.'}
                </div>
                {myState.mafiaTeammates.length > 0 && (
                  <div className="mt-6 w-full text-left bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                    <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Mafia Allies</div>
                    <div className="text-sm text-red-200">{myState.mafiaTeammates.join(', ')}</div>
                  </div>
                )}
                {myState.detectiveResult && (
                  <div className="mt-6 w-full text-left bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3">
                    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Investigation Result</div>
                    <div className="text-sm text-emerald-200">
                      <strong>{myState.detectiveResult.targetName}</strong> is{' '}
                      <span className={myState.detectiveResult.alignment === 'mafia' ? 'text-red-400' : 'text-emerald-400'}>
                        {myState.detectiveResult.alignment.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="text-4xl text-slate-600 block mb-2">👁️</span>
                <span className="text-slate-400 font-semibold text-sm">Spectating</span>
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-indigo-950/80 w-full text-center">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${amIAlive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {amIAlive ? '💚 ALIVE' : '💀 DEAD'}
              </span>
            </div>
          </div>

          {/* Right panel: Game Board/Phases & Public Players */}
          <div className="md:col-span-2 space-y-6">
            {/* Phase instruction banner */}
            <div className="bg-slate-900/60 border border-indigo-950/80 rounded-xl p-6 shadow-xl backdrop-blur">
              {phase === 'role_reveal' && (
                <div className="text-center py-6 space-y-4">
                  <h3 className="text-xl font-bold text-purple-300">Look at your role Card!</h3>
                  <p className="text-sm text-slate-300">Secret roles have been assigned. Do not show your screen to anyone!</p>
                  <div className="text-5xl animate-bounce">👁️🕵️🐺</div>
                </div>
              )}

              {phase === 'night' && (
                <div>
                  <h3 className="text-xl font-bold text-purple-300 mb-3">Night Actions</h3>
                  {amISpectator ? (
                    <p className="text-sm text-indigo-300">You are watching. Night actions are in progress...</p>
                  ) : !amIAlive ? (
                    <p className="text-sm text-red-400">You are dead and sleeping eternally. Waiting for phase to end.</p>
                  ) : myRole === 'villager' ? (
                    <div className="text-center py-6 space-y-3">
                      <div className="text-5xl">💤</div>
                      <p className="text-sm text-indigo-300">The village is sleeping. Close your eyes and wait for sunrise...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-300">
                        {myRole === 'mafia' && 'Vote on a target to eliminate.'}
                        {myRole === 'doctor' && 'Select a player to save from the Mafia tonight.'}
                        {myRole === 'detective' && 'Select a player to investigate their alignment.'}
                      </p>
                      
                      {myState?.nightActionSubmitted ? (
                        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-emerald-400 text-sm font-semibold flex items-center space-x-2">
                          <span>✓</span>
                          <span>Your night action is submitted. Waiting for others...</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                          {publicPlayers
                            .filter(p => p.isAlive && (myRole !== 'doctor' || p.id !== myPlayerId)) // Doctor cannot self heal
                            .map(p => (
                              <button
                                key={p.id}
                                disabled={acting}
                                onClick={() => submitNightAction(p.id)}
                                className="px-4 py-3 bg-indigo-950/40 border border-indigo-900/40 hover:bg-indigo-900/60 hover:border-purple-500/50 rounded-lg text-left text-sm font-medium transition flex justify-between items-center"
                              >
                                <span>{p.name}</span>
                                <span className="text-xs text-purple-400 uppercase tracking-widest font-bold">Select</span>
                              </button>
                            ))}
                        </div>
                      )}
                      
                      {myRole === 'mafia' && myState?.mafiaChatMessages && (
                        <MafiaNightChat
                          messages={myState.mafiaChatMessages}
                          onSendMessage={sendMafiaMessage}
                          myPlayerId={myPlayerId}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {phase === 'day_report' && (
                <div className="text-center py-6 space-y-4">
                  <h3 className="text-2xl font-black text-red-500 tracking-wider">SUNRISE</h3>
                  {killedPlayer ? (
                    <div className="space-y-2">
                      <p className="text-lg text-slate-200">Last night, the Mafia eliminated:</p>
                      <div className="text-3xl font-extrabold text-red-400 underline">{killedPlayer.name}</div>
                      <p className="text-sm text-slate-400">They were a <strong>{killedPlayer.role?.toUpperCase()}</strong></p>
                    </div>
                  ) : (
                    <p className="text-lg text-emerald-400 font-semibold">
                      {lastNightMafiaHadTarget
                        ? 'The Doctor saved the village! Nobody died.'
                        : 'The Mafia chose no target. Nobody died.'}
                    </p>
                  )}
                </div>
              )}

              {phase === 'discussion' && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-purple-300">Day Discussion</h3>
                  <p className="text-sm text-slate-300">
                    Discuss with the room and figure out who the Mafia is. Voice chat is recommended!
                  </p>
                  <div className="h-32 bg-slate-950/50 border border-indigo-950/60 rounded-lg flex items-center justify-center">
                    <span className="text-indigo-400 text-sm italic font-mono animate-pulse">🔊 Open Discussion Active</span>
                  </div>
                </div>
              )}

              {phase === 'voting' && (
                <div>
                  <h3 className="text-xl font-bold text-purple-300 mb-3">Village Voting</h3>
                  {amISpectator ? (
                    <p className="text-sm text-indigo-300">You are watching. Voting is in progress...</p>
                  ) : !amIAlive ? (
                    <p className="text-sm text-red-400">You are dead and cannot vote.</p>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-300">Vote for who you suspect is Mafia. You can change your vote or clear it.</p>
                      
                      {myState?.dayVoteSubmitted ? (
                        <div className="space-y-3">
                          <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-emerald-400 text-sm font-semibold flex items-center justify-between">
                            <span className="flex items-center space-x-2">
                              <span>✓</span>
                              <span>Your vote is submitted.</span>
                            </span>
                            <button
                              disabled={acting}
                              onClick={() => submitDayVote(null)}
                              className="px-3 py-1 bg-red-950/40 hover:bg-red-900/50 text-red-300 text-xs rounded border border-red-900/40 transition"
                            >
                              Change Vote
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                          {publicPlayers
                            .filter(p => p.isAlive)
                            .map(p => (
                              <button
                                key={p.id}
                                disabled={acting}
                                onClick={() => submitDayVote(p.id)}
                                className="px-4 py-3 bg-indigo-950/40 border border-indigo-900/40 hover:bg-indigo-900/60 hover:border-purple-500/50 rounded-lg text-left text-sm font-medium transition flex justify-between items-center"
                              >
                                <span>{p.name}</span>
                                <span className="text-xs text-purple-400 uppercase tracking-widest font-bold">Vote</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {phase === 'elimination' && (
                <div className="text-center py-6 space-y-4">
                  <h3 className="text-2xl font-black text-red-500 tracking-wider">VOTE RESULTS</h3>
                  {votedPlayer ? (
                    <div className="space-y-2">
                      <p className="text-lg text-slate-200">The village voted to eliminate:</p>
                      <div className="text-3xl font-extrabold text-red-400 underline">{votedPlayer.name}</div>
                      <p className="text-sm text-slate-400">They were a <strong>{votedPlayer.role?.toUpperCase()}</strong></p>
                    </div>
                  ) : (
                    <p className="text-lg text-slate-400 font-semibold">The vote ended in a tie or skip. No one was eliminated.</p>
                  )}
                </div>
              )}
            </div>

            {/* Players List Panel */}
            <div className="bg-slate-900/60 border border-indigo-950/80 rounded-xl p-6 shadow-xl backdrop-blur">
              <h3 className="text-sm font-semibold tracking-widest uppercase text-indigo-400 mb-4">Players Directory</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {publicPlayers.map(p => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition ${p.isAlive ? 'bg-slate-950/40 border-indigo-950/40' : 'bg-slate-950/20 border-red-950/30 opacity-60'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${p.isAlive ? 'bg-indigo-650 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        {p.isAlive ? '👤' : '💀'}
                      </div>
                      <div>
                        <span className={`font-semibold ${p.isAlive ? 'text-slate-100' : 'line-through text-slate-400'}`}>
                          {p.name}
                        </span>
                        {!p.isAlive && p.role && (
                          <span className="block text-xs font-semibold text-red-400 uppercase">
                            {p.role}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      {p.isAlive ? (
                        <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold">
                          Alive
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-bold">
                          {p.deathCause === 'mafia_kill' ? 'Killed' : 'Voted out'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Fallback / finished state
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 text-center">
      <div className="max-w-md w-full bg-slate-900 border border-indigo-950 rounded-xl p-8 shadow-2xl space-y-6">
        <h1 className="text-4xl font-extrabold text-purple-400 animate-pulse">GAME OVER</h1>
        
        {mafiaState?.winningTeam ? (
          <div className="space-y-2">
            <p className="text-slate-400 text-sm uppercase tracking-widest font-bold">Winning Team</p>
            <div className={`text-3xl font-black ${mafiaState.winningTeam === 'mafia' ? 'text-red-500' : 'text-emerald-400'}`}>
              {mafiaState.winningTeam === 'mafia' ? 'MAFIA 🔪' : 'VILLAGE 🏘️'}
            </div>
          </div>
        ) : (
          <p className="text-slate-300">The game has finished!</p>
        )}

        <div className="border-t border-indigo-950/60 pt-6">
          <h3 className="text-sm font-semibold tracking-widest uppercase text-indigo-400 mb-4">Roles Reveal</h3>
          <div className="space-y-2">
            {mafiaState?.players.map(p => (
              <div key={p.id} className="flex justify-between items-center text-sm p-2 rounded bg-slate-950/40">
                <span className="font-semibold text-slate-300">{p.name}</span>
                <span className={`font-mono text-xs uppercase ${p.role === 'mafia' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {p.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 font-semibold rounded-lg transition"
        >
          Return to Lobby
        </button>
      </div>
    </div>
  )
}

function PhaseTimer({ deadline, onExpired }: { deadline: string | null; onExpired: () => void }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) {
      setTimeLeft(null)
      return
    }
    const target = new Date(deadline).getTime()
    let expiredFired = false
    const update = () => {
      const remaining = Math.max(0, Math.round((target - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0 && !expiredFired) {
        expiredFired = true
        onExpired()
      }
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [deadline, onExpired])

  if (timeLeft === null || timeLeft <= 0) return null

  return (
    <div className="bg-purple-950/20 border-b border-purple-900/30 py-2 flex items-center justify-center space-x-2 text-sm">
      <span className="animate-pulse">⏳</span>
      <span className="text-purple-300 font-medium">Time left in phase:</span>
      <span className="font-mono font-extrabold text-purple-400">{timeLeft}s</span>
    </div>
  )
}

interface MafiaChatProps {
  messages: MafiaChatMessage[]
  onSendMessage: (msg: string) => Promise<void>
  myPlayerId: string | null
}

function MafiaNightChat({ messages, onSendMessage, myPlayerId }: MafiaChatProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSendMessage(text.trim())
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-6 border-t border-red-950/40 pt-6">
      <h4 className="text-sm font-semibold tracking-wider text-red-400 uppercase mb-3">🔴 Mafia Secret Night Chat</h4>
      <div className="bg-slate-950/60 border border-red-950/30 rounded-lg p-4 h-48 overflow-y-auto space-y-2 flex flex-col justify-end">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500 italic text-center py-4">No messages yet. Align on your target here!</p>
        ) : (
          messages.map(m => {
            const isMe = m.sender_player_id === myPlayerId
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`px-3 py-1.5 rounded-lg text-sm max-w-[80%] ${isMe ? 'bg-red-600/70 text-white border border-red-500/20' : 'bg-slate-800 text-slate-200 border border-slate-700/30'}`}>
                  {!isMe && <span className="block text-[10px] text-red-300 font-bold mb-0.5">{m.sender_name}</span>}
                  <span>{m.message}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex space-x-2">
        <input
          type="text"
          value={text}
          disabled={sending}
          onChange={(e) => setText(e.target.value)}
          placeholder="Whisper to other Mafia..."
          className="flex-1 px-3 py-2 bg-slate-950 border border-red-950/30 rounded-lg text-sm focus:outline-none focus:border-red-500/50 text-slate-100 placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-4 py-2 bg-red-750 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          Send
        </button>
      </form>
    </div>
  )
}
