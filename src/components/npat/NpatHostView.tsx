'use client'

import { useCallback, useEffect, useState } from 'react'
import { NpatActiveRound } from '@/components/npat/NpatActiveRound'
import { gameTypeConfig } from '@/lib/game-types'
import { useNpatAdvance } from '@/hooks/useNpatAdvance'
import {
  clampNpatMarkingTimer,
  clampNpatTimer,
  formatNpatGameDuration,
  getNpatHostMode,
  NPAT_GAME_DURATION_OPTIONS,
  NPAT_MARKING_TIMER_OPTIONS,
  NPAT_MIN_PLAYERS,
  NPAT_TIMER_OPTIONS,
  setNpatHostMode,
  type NpatHostMode,
} from '@/lib/npat'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  NPAT_ANSWER_SELECT,
  NPAT_MARK_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type { Game, NpatAnswer, NpatMark, Player, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { PlayerInviteCard } from '@/components/PlayerInviteCard'
import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

type HostTab = 'play' | 'manage'

export function NpatHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<NpatAnswer[]>([])
  const [marks, setMarks] = useState<NpatMark[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingTimer, setSavingTimer] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(60)
  const [markingTimerSeconds, setMarkingTimerSeconds] = useState(45)
  const [gameDurationSeconds, setGameDurationSeconds] = useState(1800)
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostMode, setHostMode] = useState<NpatHostMode>('spectator')
  const [tab, setTab] = useState<HostTab>('manage')

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, ansRes, marksRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('npat_answers').select(NPAT_ANSWER_SELECT).eq('game_id', gameCode),
      supabase.from('npat_marks').select(NPAT_MARK_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, ansRes, marksRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      setTimerSeconds(gameRes.data.timer_seconds ?? 60)
      setMarkingTimerSeconds(gameRes.data.operative_timer_seconds ?? 45)
      setGameDurationSeconds(gameRes.data.game_duration_seconds ?? 1800)
    }
    setPlayers(plrsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setAnswers(ansRes.data ?? [])
    setMarks(marksRes.data ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getNpatHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    const channel = supabase
      .channel(`npat-host-${gameCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npat_answers', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npat_marks', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useNpatAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  const changeHostMode = (mode: NpatHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setNpatHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostPlayerName(data.playerName)
      setHostMode('player')
      setNpatHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
      setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const startGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      await load()
      success('Game started!')
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const saveTimers = async () => {
    setSavingTimer(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          timer_seconds: timerSeconds,
          operative_timer_seconds: markingTimerSeconds,
          game_duration_seconds: gameDurationSeconds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save timers')
      if (data.game) setGame(data.game)
      success('Timers updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save timers')
    } finally {
      setSavingTimer(false)
    }
  }

  const playAgain = async () => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      setRounds([])
      setAnswers([])
      setMarks([])
      await load()
      success('Lobby reopened!')
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showPlayTab = hostPlays && game?.status !== 'finished'
  const canStart = players.length >= NPAT_MIN_PLAYERS

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const cfg = gameTypeConfig('name_place_animal_thing')
  const playerLink = `${appOrigin()}/game/${gameCode}`

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black gradient-title">{game.title}</h1>
          <p className="text-muted text-sm">{cfg.label} · Host</p>
        </div>

        {game.status === 'waiting' && (
          <div className="glass-card p-4 space-y-3">
            <p className="label-caps">Host mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changeHostMode('spectator')}
                className={hostMode === 'spectator' ? 'btn-primary' : 'btn-secondary'}
              >
                Spectate
              </button>
              <button
                type="button"
                onClick={() => changeHostMode('player')}
                className={hostMode === 'player' ? 'btn-primary' : 'btn-secondary'}
              >
                Play too
              </button>
            </div>
            {hostMode === 'player' && !hostPlayerId && (
              <div className="space-y-2 pt-2">
                <input
                  type="text"
                  value={hostJoinName}
                  onChange={(e) => setHostJoinName(e.target.value)}
                  placeholder="Your name"
                  className="input-field w-full"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={hostJoinGame}
                  disabled={!hostJoinName.trim() || hostJoining}
                  className="btn-secondary w-full"
                >
                  {hostJoining ? 'Joining…' : 'Join as player'}
                </button>
              </div>
            )}
          </div>
        )}

        {(showPlayTab || game.status === 'active') && (
          <div className="flex gap-2">
            {showPlayTab && (
              <button type="button" onClick={() => setTab('play')} className={tab === 'play' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>
                Play
              </button>
            )}
            <button type="button" onClick={() => setTab('manage')} className={tab === 'manage' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>
              Manage
            </button>
          </div>
        )}

        {tab === 'play' && hostPlayerId && game.status === 'active' && (
          <NpatActiveRound
            gameCode={gameCode}
            game={game}
            players={players}
            rounds={rounds}
            answers={answers}
            marks={marks}
            myPlayerId={hostPlayerId}
            playerName={hostPlayerName}
            onReload={load}
            skipGameSync
          />
        )}

        {tab === 'manage' && (
          <div className="space-y-4">
            {game.status === 'waiting' && (
              <>
                <div className="glass-card p-4 space-y-3">
                  <p className="label-caps">Timers</p>
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">Game length</span>
                    <select
                      value={gameDurationSeconds}
                      onChange={(e) => setGameDurationSeconds(Number(e.target.value))}
                      className="input-field w-full"
                    >
                      {NPAT_GAME_DURATION_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {formatNpatGameDuration(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">Writing time (per letter)</span>
                    <select
                      value={timerSeconds}
                      onChange={(e) => setTimerSeconds(Number(e.target.value))}
                      className="input-field w-full"
                    >
                      {NPAT_TIMER_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}s
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">Marking time (per letter)</span>
                    <select
                      value={markingTimerSeconds}
                      onChange={(e) => setMarkingTimerSeconds(Number(e.target.value))}
                      className="input-field w-full"
                    >
                      {NPAT_MARKING_TIMER_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}s
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={saveTimers} disabled={savingTimer} className="btn-secondary w-full">
                    {savingTimer ? 'Saving…' : 'Save timers'}
                  </button>
                </div>

                <GameLobbyPlayerList
                  players={players}
                  myPlayerId={hostPlayerId}
                  label="In lobby"
                  minPlayers={NPAT_MIN_PLAYERS}
                  maxCapacity={game.max_players}
                />

                <HostPlayerManageList
                  players={players}
                  onRemovePlayer={removePlayer}
                  removingPlayerId={removingPlayerId}
                />

                <PlayerInviteCard url={playerLink} gameCode={gameCode} />

                <button
                  type="button"
                  onClick={startGame}
                  disabled={!canStart || starting}
                  className="btn-primary w-full"
                >
                  {starting
                    ? 'Starting…'
                    : canStart
                      ? `Start game (${players.length} players)`
                      : `Need at least ${NPAT_MIN_PLAYERS} players`}
                </button>
              </>
            )}

            {game.status === 'active' && hostPlayerId && (
              <NpatActiveRound
                gameCode={gameCode}
                game={game}
                players={players}
                rounds={rounds}
                answers={answers}
                marks={marks}
                myPlayerId={hostPlayerId}
                playerName={hostPlayerName}
                onReload={load}
                skipGameSync
                readOnly={hostMode !== 'player'}
              />
            )}

            {game.status === 'active' && !hostPlayerId && (
              <div className="glass-card p-6 text-center text-muted">
                Game in progress — choose Play too in Host mode and join as a player to call letters and submit answers.
              </div>
            )}

            {game.status === 'finished' && (
              <div className="space-y-3">
                <div className="glass-card p-6 text-center space-y-2">
                  <p className="text-3xl">🏆</p>
                  <p className="text-xl font-black">Game finished</p>
                </div>
                <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-primary w-full">
                  {playingAgain ? 'Resetting…' : 'Play again'}
                </button>
              </div>
            )}

            {game.status === 'active' && (
              <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
