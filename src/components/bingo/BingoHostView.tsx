'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { BingoFinalResultsShareBlock } from '@/components/bingo/BingoFinalResultsShareBlock'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { gameTypeConfig } from '@/lib/game-types'
import {
  BINGO_CALL_INTERVAL_OPTIONS,
  BINGO_DEFAULT_CALL_INTERVAL,
  BINGO_DEFAULT_CALL_MODE,
  BINGO_MIN_PLAYERS,
  bingoCallIntervalFromGame,
  bingoCallModeFromGame,
  formatBingoNumber,
} from '@/lib/bingo'
import { supabase } from '@/lib/supabase'
import {
  BINGO_CALLED_NUMBER_SELECT,
  BINGO_CLAIM_SELECT,
  GAME_SELECT,
  PLAYER_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import type { BingoCallMode, BingoCalledNumber, BingoClaim, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useBingoWinNotification, useBingoStartNotification } from '@/hooks/useBingoNotifications'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'

export function BingoHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [winner, setWinner] = useState<BingoClaim | null>(null)
  const [starting, setStarting] = useState(false)
  const [calling, setCalling] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [lobbyCallMode, setLobbyCallMode] = useState<BingoCallMode>(BINGO_DEFAULT_CALL_MODE)
  const [lobbyCallInterval, setLobbyCallInterval] = useState(BINGO_DEFAULT_CALL_INTERVAL)
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState(BINGO_MIN_PLAYERS)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, calledRes, claimRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('bingo_called_numbers').select(BINGO_CALLED_NUMBER_SELECT).eq('game_id', gameCode).order('called_at'),
      supabase
        .from('bingo_claims')
        .select(BINGO_CLAIM_SELECT)
        .eq('game_id', gameCode)
        .eq('status', 'approved')
        .maybeSingle(),
    ])
    if (!supabasePollOk(gameRes, plrsRes, calledRes, claimRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      setLobbyCallMode(bingoCallModeFromGame(gameRes.data))
      setLobbyCallInterval(bingoCallIntervalFromGame(gameRes.data))
      setLobbyMaxPlayers(gameRes.data.max_players ?? BINGO_MIN_PLAYERS)
    }
    setPlayers(plrsRes.data ?? [])
    setCalledNumbers(calledRes.data ?? [])
    setWinner(claimRes.data ?? null)
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`bingo-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          setLobbyCallMode(bingoCallModeFromGame(next))
          setLobbyCallInterval(bingoCallIntervalFromGame(next))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const player = payload.new as Player
          setPlayers((prev) => (prev.some((p) => p.id === player.id) ? prev : [...prev, player]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_called_numbers', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const row = payload.new as BingoCalledNumber
          setCalledNumbers((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_claims', filter: `game_id=eq.${gameCode}` },
        (payload) => setWinner(payload.new as BingoClaim)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useBingoAutoCall({
    gameCode,
    game,
    enabled: game?.status === 'active',
    onSynced: load,
  })

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
      success('Bingo started — cards dealt!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const saveLobbySettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/bingo/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          hostToken,
          bingo_call_mode: lobbyCallMode,
          bingo_call_interval_seconds: lobbyCallInterval,
          max_players: lobbyMaxPlayers,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      if (data.game) setGame(data.game)
      await load()
      success('Settings saved')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const callNumber = async (random = true, number?: number) => {
    setCalling(true)
    try {
      const res = await fetch('/api/bingo/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, random, number }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to call number')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to call number')
    } finally {
      setCalling(false)
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
      setWinner(null)
      setCalledNumbers([])
      await load()
      success('Lobby reopened — waiting for players!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('bingo')
  const called = calledNumbers.map((row) => row.number)
  const lastCalled = called.length > 0 ? called[called.length - 1] : null
  const winnerPlayer = winner ? players.find((p) => p.id === winner.player_id) : null
  const playerLink = `${appOrigin()}/game/${gameCode}`
  const callMode = game ? bingoCallModeFromGame(game) : BINGO_DEFAULT_CALL_MODE
  const callInterval = game ? bingoCallIntervalFromGame(game) : BINGO_DEFAULT_CALL_INTERVAL
  const isAuto = callMode === 'auto'

  useBingoStartNotification({
    game,
    enabled: !!game,
  })

  useBingoWinNotification({
    winner,
    winnerName: winnerPlayer?.name ?? null,
    enabled: game?.status === 'active' || game?.status === 'finished',
  })

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
          <p className="text-muted text-sm">{cfg.label} · Host panel</p>
        </div>

        <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-faint text-xs uppercase tracking-wider">Share with players</p>
            <p className="font-mono font-bold text-lg">{gameCode}</p>
          </div>
          <CopyLinkButton value={playerLink} label="Copy player link" />
        </div>

        {game.status === 'waiting' && (
          <div className="glass-card p-5 space-y-4">
            <div>
              <p className="label-caps mb-2">Lobby ({players.length} joined)</p>
              {players.length === 0 ? (
                <p className="text-muted text-sm">Waiting for players to join…</p>
              ) : (
                <ul className="space-y-1">
                  {players.map((p) => (
                    <li key={p.id} className="text-sm font-medium">
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-[var(--border-strong)]">
              <p className="label-caps">Game settings</p>
              <label className="block text-sm text-muted">
                Max players
                <select
                  value={lobbyMaxPlayers}
                  onChange={(e) => setLobbyMaxPlayers(Number(e.target.value))}
                  className="input-field w-full mt-1"
                >
                  {Array.from({ length: 30 - BINGO_MIN_PLAYERS + 1 }, (_, i) => i + BINGO_MIN_PLAYERS).map((n) => (
                    <option key={n} value={n}>
                      {n} players
                    </option>
                  ))}
                </select>
              </label>
              <HostAllowViewersField
                gameCode={gameCode}
                hostToken={hostToken}
                game={game}
                onGameUpdate={setGame}
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLobbyCallMode('manual')}
                  className={[
                    'rounded-2xl border-2 px-4 py-3 text-left',
                    lobbyCallMode === 'manual'
                      ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                      : 'border-[var(--border-strong)] text-muted',
                  ].join(' ')}
                >
                  <span className="font-bold block text-sm">Manual</span>
                  <span className="text-faint text-xs">You call numbers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLobbyCallMode('auto')}
                  className={[
                    'rounded-2xl border-2 px-4 py-3 text-left',
                    lobbyCallMode === 'auto'
                      ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                      : 'border-[var(--border-strong)] text-muted',
                  ].join(' ')}
                >
                  <span className="font-bold block text-sm">Automatic</span>
                  <span className="text-faint text-xs">Computer calls</span>
                </button>
              </div>
              {lobbyCallMode === 'auto' && (
                <label className="block text-sm text-muted">
                  Seconds between calls
                  <select
                    value={lobbyCallInterval}
                    onChange={(e) => setLobbyCallInterval(Number(e.target.value))}
                    className="input-field w-full mt-1"
                  >
                    {BINGO_CALL_INTERVAL_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={saveLobbySettings}
                disabled={savingSettings}
                className="btn-secondary w-full py-3"
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>

            <button
              type="button"
              onClick={startGame}
              disabled={starting || players.length < BINGO_MIN_PLAYERS}
              className="btn-primary w-full"
            >
              {starting ? 'Starting…' : `Start Bingo (${BINGO_MIN_PLAYERS}+ players)`}
            </button>
          </div>
        )}

        {game.status === 'active' && (
          <>
            <div className="glass-card p-5 space-y-4">
              <p className="label-caps">{isAuto ? 'Automatic calling' : 'Call numbers'}</p>
              {isAuto ? (
                <p className="text-center text-muted text-sm sm:text-base">
                  Numbers are called automatically every <span className="font-bold text-body">{callInterval}s</span>.
                  Keep this tab open or let players stay connected — anyone in the game keeps it running.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => callNumber(true)}
                    disabled={calling || called.length >= 75}
                    className="btn-primary flex-1 min-w-[140px]"
                  >
                    {calling ? 'Calling…' : 'Call random'}
                  </button>
                </div>
              )}
              {lastCalled != null && (
                <p className="text-center text-muted text-sm">
                  Last: <span className="font-bold text-blue-300">{formatBingoNumber(lastCalled)}</span> ·{' '}
                  {called.length}/75 called
                </p>
              )}
            </div>

            <div className="glass-card p-5">
              <CalledNumbersBoard calledNumbers={called} lastCalled={lastCalled} />
            </div>
          </>
        )}

        {game.status === 'finished' && winnerPlayer && (
          <BingoFinalResultsShareBlock game={game} players={players} winnerName={winnerPlayer.name} />
        )}

        {game.status === 'finished' && (
          <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-secondary w-full">
            {playingAgain ? 'Resetting…' : 'Play again'}
          </button>
        )}

        <button type="button" onClick={() => router.push('/')} className="btn-ghost w-full text-muted">
          Back home
        </button>
      </div>
    </div>
  )
}
