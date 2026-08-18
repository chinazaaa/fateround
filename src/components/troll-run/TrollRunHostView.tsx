'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  HOST_GAME_SELECT,
  PLAYER_SELECT,
  TROLL_RUN_EVENT_SELECT,
  TROLL_RUN_PLAYER_STATE_SELECT,
  TROLL_RUN_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player, TrollRunEvent, TrollRunPlayerState, TrollRunSession } from '@/types'
import { WORLD_1_LEVELS } from '@/lib/troll-run-engine'
import { TrollRunScoreboard } from './TrollRunScoreboard'
import { TrollRunLiveFeed } from './TrollRunLiveFeed'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostTrollRunLobbyPanel } from '@/components/host-lobby/HostTrollRunLobbyPanel'
import { gameTypeConfig } from '@/lib/game-types'

export interface TrollRunHostViewProps {
  gameCode: string
  hostToken: string
}

export function TrollRunHostView({ gameCode, hostToken }: TrollRunHostViewProps) {
  const { error: toastError } = useToast()
  const cfg = gameTypeConfig('troll_run')

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<TrollRunSession | null>(null)
  const [playerStates, setPlayerStates] = useState<TrollRunPlayerState[]>([])
  const [events, setEvents] = useState<TrollRunEvent[]>([])
  const [timeRemainingSec, setTimeRemainingSec] = useState<number | null>(null)
  const [countdownNum, setCountdownNum] = useState<number | null>(null)
  const [advancing, setAdvancing] = useState(false)

  const reload = useCallback(async () => {
    const [gameRes, playersRes, sessRes, statesRes, eventsRes] = await Promise.all([
      supabase.from('games').select(HOST_GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode),
      supabase.from('troll_run_sessions').select(TROLL_RUN_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('troll_run_player_states').select(TROLL_RUN_PLAYER_STATE_SELECT).eq('game_id', gameCode),
      supabase
        .from('troll_run_events')
        .select(TROLL_RUN_EVENT_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: true }),
    ])

    if (gameRes.data) setGame(gameRes.data as unknown as Game)
    if (playersRes.data) setPlayers(playersRes.data as unknown as Player[])
    if (sessRes.data) setSession(sessRes.data as unknown as TrollRunSession)
    if (statesRes.data) setPlayerStates(statesRes.data as unknown as TrollRunPlayerState[])
    if (eventsRes.data) setEvents(eventsRes.data as unknown as TrollRunEvent[])
  }, [gameCode])

  useEffect(() => {
    reload()
  }, [reload])

  useGameTableSync(
    gameCode,
    [
      { table: 'games', apply: (row) => setGame(row as unknown as Game) },
      { table: 'troll_run_sessions', apply: (row) => setSession(row as unknown as TrollRunSession) },
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
        apply: (row) => setEvents((prev) => [...prev, row as unknown as TrollRunEvent]),
      },
    ],
    reload
  )

  // Timer loop
  useEffect(() => {
    if (!session?.turn_deadline_at) {
      setTimeRemainingSec(null)
      setCountdownNum(null)
      return
    }

    const interval = setInterval(() => {
      const diff = new Date(session.turn_deadline_at!).getTime() - Date.now()
      const secs = Math.ceil(diff / 1000)

      if (session.phase === 'countdown') {
        if (secs <= 0) {
          setCountdownNum(0)
          clearInterval(interval)
          fetch('/api/troll-run/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          }).catch(() => {})
        } else {
          setCountdownNum(secs)
        }
      } else if (session.phase === 'racing') {
        if (secs <= 0) {
          setTimeRemainingSec(0)
          clearInterval(interval)
          fetch('/api/troll-run/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          }).catch(() => {})
        } else {
          setTimeRemainingSec(secs)
        }
      }
    }, 250)

    return () => clearInterval(interval)
  }, [session?.phase, session?.turn_deadline_at, gameCode])

  const playerNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of players) {
      map.set(p.id, p.name)
    }
    return map
  }, [players])

  const activePlayers = useMemo(() => {
    return players.filter((p) => p.spectator !== true)
  }, [players])

  const currentStates = useMemo(() => {
    return playerStates.filter((s) => s.current_round === (session?.current_round ?? 1))
  }, [playerStates, session?.current_round])

  const handleStartGame = async () => {
    setAdvancing(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        toastError(data.error || 'Failed to start game')
      } else {
        await reload()
      }
    } catch {
      toastError('Network error starting game')
    } finally {
      setAdvancing(false)
    }
  }

  const handleNextRound = async () => {
    setAdvancing(true)
    try {
      const res = await fetch('/api/troll-run/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, forceNextRound: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        toastError(data.error || 'Failed to advance round')
      }
    } catch {
      toastError('Network error')
    } finally {
      setAdvancing(false)
    }
  }

  // 1. Lobby screen
  if (game?.status === 'waiting' || session?.phase === 'lobby') {
    if (!game) return <HostLobbySkeleton />
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        players={players}
        onStart={handleStartGame}
        starting={advancing}
        startDisabled={activePlayers.length < 2}
        startDisabledHint="Need at least 2 runners to start"
        settingsChildren={
          <HostTrollRunLobbyPanel gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        }
      />
    )
  }

  // 2. Scoreboard / Finished screen
  if (session?.phase === 'scoreboard' || session?.phase === 'finished' || game?.status === 'finished') {
    return (
      <div className="min-h-screen bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
        {session && (
          <TrollRunScoreboard
            session={session}
            playerStates={playerStates}
            playerNames={playerNames}
            isHost={true}
            onNextRound={handleNextRound}
            loading={advancing}
          />
        )}
      </div>
    )
  }

  // 3. Countdown Overlay on big screen
  if (session?.phase === 'countdown') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <span className="text-9xl font-black text-amber-400 animate-bounce font-mono">{countdownNum ?? 3}</span>
        <h2 className="text-3xl font-black text-white">Get Ready to Run!</h2>
        <p className="text-slate-400 text-sm">
          Round {session.current_round} of {session.total_rounds} · World:{' '}
          <strong className="text-amber-400 capitalize">{session.current_world}</strong>
        </p>
      </div>
    )
  }

  // 4. Live Racing Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans flex flex-col justify-between max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="text-3xl">😈</span>
          <div>
            <h1 className="text-xl font-black text-white">
              Troll Run — Round {session?.current_round} / {session?.total_rounds}
            </h1>
            <p className="text-xs text-slate-400">
              World: <span className="text-amber-400 font-bold capitalize">{session?.current_world}</span>
            </p>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Time Remaining</div>
            <div
              className={`font-mono text-2xl font-black ${
                (timeRemainingSec ?? 60) <= 20 ? 'text-rose-400 animate-pulse' : 'text-amber-400'
              }`}
            >
              {timeRemainingSec !== null
                ? `${Math.floor(timeRemainingSec / 60)}:${(timeRemainingSec % 60).toString().padStart(2, '0')}`
                : '--:--'}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNextRound}
            disabled={advancing}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 transition"
          >
            End Round Early
          </button>
        </div>
      </div>

      {/* Live Track / Progress Bars */}
      <div className="my-6 space-y-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 pb-2 border-b border-slate-800">
          <span>RUNNER</span>
          <span>PROGRESS (LEVEL 1 → 10)</span>
          <span>DEATHS</span>
        </div>

        <div className="space-y-3">
          {activePlayers.map((player) => {
            const state = currentStates.find((s) => s.player_id === player.id)
            const levelIdx = state?.current_level_index ?? 0
            const progressPct = Math.min(100, Math.round((levelIdx / WORLD_1_LEVELS.length) * 100))
            const isFinished = state?.round_finished

            return (
              <div key={player.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    {player.name}
                    {isFinished && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                        🏆 #{state?.finish_position}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-slate-400 text-[11px]">
                    Level {levelIdx + 1} / {WORLD_1_LEVELS.length}
                  </span>
                  <span className="font-mono font-bold text-rose-400">💀 {state?.deaths ?? 0}</span>
                </div>

                {/* Track bar */}
                <div className="relative w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isFinished
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Live Event Ticker */}
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Live Trap Ticker</div>
        <TrollRunLiveFeed events={events} playerNames={playerNames} />
      </div>
    </div>
  )
}
