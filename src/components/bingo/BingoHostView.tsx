'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BingoCardGrid, CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { gameTypeConfig } from '@/lib/game-types'
import { BINGO_MIN_PLAYERS, formatBingoNumber } from '@/lib/bingo'
import { supabase } from '@/lib/supabase'
import { appOrigin } from '@/lib/site'
import type { BingoCalledNumber, BingoClaim, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'

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

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: plrs }, { data: called }, { data: claim }] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
      supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
      supabase.from('bingo_called_numbers').select('*').eq('game_id', gameCode).order('called_at'),
      supabase
        .from('bingo_claims')
        .select('*')
        .eq('game_id', gameCode)
        .eq('status', 'approved')
        .maybeSingle(),
    ])
    if (gameData) setGame(gameData)
    setPlayers(plrs ?? [])
    setCalledNumbers(called ?? [])
    setWinner(claim ?? null)
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
        (payload) => setGame(payload.new as Game)
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

    const poll = setInterval(load, 4000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

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
      await load()
      success('New bingo round ready!')
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
              <p className="label-caps">Call numbers</p>
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
          <div className="glass-card p-6 text-center space-y-2 border-amber-400/40">
            <p className="text-4xl">🏆</p>
            <p className="text-xl font-black text-amber-200">BINGO!</p>
            <p className="text-lg font-bold">{winnerPlayer.name} wins!</p>
          </div>
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
