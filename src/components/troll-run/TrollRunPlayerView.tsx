'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useRoomMemberJoin } from '@/hooks/useRoomMemberJoin'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { TROLL_RUN_EVENT_SELECT, TROLL_RUN_PLAYER_STATE_SELECT, TROLL_RUN_SESSION_SELECT } from '@/lib/supabase-selects'
import type { Game, TrollRunEvent, TrollRunPlayerState, TrollRunSession } from '@/types'
import { WORLD_1_LEVELS } from '@/lib/troll-run-engine'
import { TrollRunCanvas } from './TrollRunCanvas'
import { TrollRunLiveFeed } from './TrollRunLiveFeed'
import { TrollRunScoreboard } from './TrollRunScoreboard'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { preJoinScreen } from '@/lib/viewers'
import { gameTypeConfig } from '@/lib/game-types'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'waiting'
  | 'playing'
  | 'scoreboard'
  | 'finished'
  | 'not_found'

export function TrollRunPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const cfg = gameTypeConfig('troll_run')

  const [session, setSession] = useState<TrollRunSession | null>(null)
  const [playerStates, setPlayerStates] = useState<TrollRunPlayerState[]>([])
  const [events, setEvents] = useState<TrollRunEvent[]>([])
  const [countdownNum, setCountdownNum] = useState<number | null>(null)

  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [sessRes, statesRes, eventsRes] = await Promise.all([
      supabase.from('troll_run_sessions').select(TROLL_RUN_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('troll_run_player_states').select(TROLL_RUN_PLAYER_STATE_SELECT).eq('game_id', gameCode),
      supabase
        .from('troll_run_events')
        .select(TROLL_RUN_EVENT_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: true }),
    ])

    if (sessRes.data) setSession(sessRes.data as unknown as TrollRunSession)
    if (statesRes.data) setPlayerStates(statesRes.data as unknown as TrollRunPlayerState[])
    if (eventsRes.data) setEvents(eventsRes.data as unknown as TrollRunEvent[])

    return { state: null, ok: !sessRes.error }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const { screen, game, players, myPlayerId, joinName, setJoinName, joining, load, lobbyFull, join } =
    useGameViewBootstrap<Screen, null>({
      gameCode,
      loadingScreen: 'loading',
      notFoundScreen: 'not_found',
      loadGameState,
      computeScreen,
      joinExtras,
      onJoinError: toastError,
    })

  // Realtime subscription
  useGameTableSync(
    gameCode,
    [
      {
        table: 'troll_run_sessions',
        apply: (row) => setSession(row as unknown as TrollRunSession),
      },
      {
        table: 'troll_run_player_states',
        apply: (row) => {
          setPlayerStates((prev) => {
            const idx = prev.findIndex((p) => p.id === row.id)
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = row as unknown as TrollRunPlayerState
              return updated
            }
            return [...prev, row as unknown as TrollRunPlayerState]
          })
        },
      },
      {
        table: 'troll_run_events',
        apply: (row) => {
          setEvents((prev) => [...prev, row as unknown as TrollRunEvent])
        },
      },
    ],
    load
  )

  // Countdown timer effect
  useEffect(() => {
    if (session?.phase !== 'countdown' || !session?.turn_deadline_at) {
      setCountdownNum(null)
      return
    }

    const interval = setInterval(() => {
      const diff = new Date(session.turn_deadline_at!).getTime() - Date.now()
      const secs = Math.ceil(diff / 1000)
      if (secs <= 0) {
        setCountdownNum(0)
        clearInterval(interval)
        // Nudge advance endpoint
        fetch('/api/troll-run/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        }).catch(() => {})
      } else {
        setCountdownNum(secs)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [session?.phase, session?.turn_deadline_at, gameCode])

  const playerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of players) {
      map.set(p.id, p.name)
    }
    return map
  }, [players])

  const myState = useMemo(() => {
    return playerStates.find((s) => s.player_id === myPlayerId && s.current_round === (session?.current_round ?? 1))
  }, [playerStates, myPlayerId, session?.current_round])

  // Callbacks from canvas
  const handleDeath = useCallback(
    async (levelId: string) => {
      if (!myPlayerId) return
      try {
        await fetch('/api/troll-run/report-death', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            playerId: myPlayerId,
            levelId,
          }),
        })
      } catch {
        // best effort
      }
    },
    [gameCode, myPlayerId]
  )

  const handleLevelClear = useCallback(
    async (levelId: string, timeMs: number) => {
      if (!myPlayerId || !myState) return
      try {
        await fetch('/api/troll-run/report-clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            playerId: myPlayerId,
            levelId,
            timeMs,
            newLevelIndex: (myState.current_level_index || 0) + 1,
          }),
        })
      } catch {
        // best effort
      }
    },
    [gameCode, myPlayerId, myState]
  )

  const handleAllLevelsCleared = useCallback(
    async (totalTimeMs: number, totalDeaths: number) => {
      if (!myPlayerId) return
      try {
        await fetch('/api/troll-run/report-round-finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            playerId: myPlayerId,
            totalTimeMs,
            totalDeaths,
          }),
        })
      } catch {
        // best effort
      }
    },
    [gameCode, myPlayerId]
  )

  // 1. Join Screen
  if (screen === 'join') {
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        onResumed={load}
        header={
          <GameJoinHeader
            title={game?.title ?? cfg.label}
            gameType="troll_run"
            subtitle={cfg.tagline}
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
          gameType="troll_run"
        />
      </GameJoinLobbyShell>
    )
  }

  // 2. Game Started Waiting (Late spectator)
  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  // 3. Lobby Waiting Room
  if (screen === 'waiting') {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={players.find((p) => p.id === myPlayerId)?.name ?? ''}
          onRenamed={() => {
            void load()
          }}
          onLeft={() => router.push('/')}
          title="Waiting for host to start"
          description="Race to clear all trick levels with the fewest deaths."
        />
      </GameJoinLobbyShell>
    )
  }

  // 4. Game Ended / Finished
  if (screen === 'finished' || session?.phase === 'finished') {
    return (
      <div className="min-h-screen bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
        {session && (
          <TrollRunScoreboard session={session} playerStates={playerStates} playerNames={playerNames} isHost={false} />
        )}
      </div>
    )
  }

  // 5. Scoreboard between rounds
  if (session?.phase === 'scoreboard') {
    return (
      <div className="min-h-screen bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
        <TrollRunScoreboard session={session} playerStates={playerStates} playerNames={playerNames} isHost={false} />
      </div>
    )
  }

  // 6. Active Racing / Countdown Phase
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-3 sm:p-6 select-none font-sans">
      {/* Top HUD Bar */}
      <div className="w-full max-w-[640px] flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5 mb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">😈</span>
          <span className="font-black text-amber-400">
            Round {session?.current_round ?? 1} / {session?.total_rounds ?? 5}
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400 capitalize">{session?.current_world ?? 'Pits'}</span>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-400">Level: </span>
            <span className="font-mono font-bold text-white">
              {(myState?.current_level_index ?? 0) + 1} / {WORLD_1_LEVELS.length}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Deaths: </span>
            <span className="font-mono font-bold text-rose-400">{myState?.deaths ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Main Canvas / Overlay */}
      <div className="relative w-full max-w-[640px] flex flex-col items-center">
        {/* 3-2-1 Countdown Overlay */}
        {session?.phase === 'countdown' && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center rounded-2xl border border-amber-500/40">
            <span className="text-7xl font-black text-amber-400 animate-bounce">{countdownNum ?? 3}</span>
            <p className="text-sm font-bold text-slate-300 mt-2">Get ready to race!</p>
          </div>
        )}

        {/* Finished Round Waiting Overlay */}
        {myState?.round_finished && session?.phase === 'racing' && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center rounded-2xl border border-emerald-500/40 p-6 text-center space-y-3">
            <span className="text-5xl">🎉</span>
            <h3 className="text-2xl font-black text-white">Finished #{myState.finish_position ?? 1}!</h3>
            <p className="text-xs text-slate-300">
              You cleared all {WORLD_1_LEVELS.length} levels with{' '}
              <strong className="text-rose-400">{myState.deaths} deaths</strong>!
            </p>
            <div className="text-xs font-mono text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/30">
              Round Score: +{myState.round_score} pts
            </div>
            <p className="text-[11px] text-slate-500 italic">
              Waiting for other players to finish or timer to expire...
            </p>
          </div>
        )}

        <TrollRunCanvas
          levels={WORLD_1_LEVELS}
          initialLevelIndex={myState?.current_level_index ?? 0}
          onDeath={handleDeath}
          onLevelClear={handleLevelClear}
          onAllLevelsCleared={handleAllLevelsCleared}
          showTouchControls={true}
        />
      </div>

      {/* Live Death/Clear Feed */}
      <div className="w-full max-w-[640px] mt-3">
        <TrollRunLiveFeed events={events} playerNames={playerNames} />
      </div>
    </div>
  )
}
