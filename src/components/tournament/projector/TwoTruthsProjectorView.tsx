'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { parseTtlMetadata } from '@/lib/two-truths'
import type { TtlMetadata } from '@/types'

/**
 * Projector view for a Two Truths & a Lie round in a tournament.
 * Round shape is "one player in the spotlight per round" — the room reads
 * that player's three statements on the big screen and each guesser picks
 * on their phone. On reveal the lie tile glows red so the whole room sees
 * which statement fooled everyone.
 */

type Round = {
  id: string
  round_number: number
  status: 'pending' | 'active' | 'finished'
  started_at: string | null
  ended_at: string | null
  submitter_player_id: string | null
  ttl_metadata: TtlMetadata | Record<string, unknown> | null
}

type Game = {
  id: string
  status: 'waiting' | 'active' | 'finished' | null
  current_round_number: number | null
  timer_seconds: number | null
  rounds_count: number | null
}

type Player = { id: string; name: string; spectator: boolean | null }

export function TwoTruthsProjectorView({ gameCode }: { gameCode: string }) {
  const [game, setGame] = useState<Game | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [guessCount, setGuessCount] = useState<Record<string, number>>({})
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  const load = useCallback(async () => {
    const [g, r, p] = await Promise.all([
      supabase
        .from('games')
        .select('id, status, current_round_number, timer_seconds, rounds_count')
        .eq('id', gameCode)
        .maybeSingle(),
      supabase
        .from('rounds')
        .select('id, round_number, status, started_at, ended_at, submitter_player_id, ttl_metadata')
        .eq('game_id', gameCode)
        .order('round_number', { ascending: true }),
      supabase.from('players').select('id, name, spectator').eq('game_id', gameCode),
    ])
    if (g.data) setGame(g.data as Game)
    if (r.data) setRounds(r.data as Round[])
    if (p.data) setPlayers(p.data as Player[])
    // Guess counts per round — one small select so we don't ship every guess.
    const { data: guesses } = await supabase.from('ttl_guesses').select('round_id').eq('game_id', gameCode)
    const map: Record<string, number> = {}
    for (const gu of guesses ?? []) {
      const k = (gu as { round_id: string }).round_id
      map[k] = (map[k] ?? 0) + 1
    }
    setGuessCount(map)
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'players', 'rounds', 'ttl_guesses'], load)

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  const activeRound = rounds.find((r) => r.status === 'active') ?? null
  const currentByPointer = game?.current_round_number
    ? rounds.find((r) => r.round_number === game.current_round_number)
    : null
  const round = activeRound ?? currentByPointer ?? null
  const totalRounds = game?.rounds_count ?? rounds.length
  const active = players.filter((p) => p.spectator !== true)

  if (!round) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 h-full">
        <p className="text-white/60 text-lg uppercase tracking-widest">
          {game?.status === 'waiting' ? 'Waiting for host to start…' : 'Loading…'}
        </p>
        <p className="text-4xl text-white/60">Two Truths &amp; a Lie</p>
      </div>
    )
  }

  const metadata =
    round.ttl_metadata && typeof round.ttl_metadata === 'object'
      ? parseTtlMetadata(round.ttl_metadata as Record<string, unknown>)
      : null
  const revealing = round.status === 'finished' && Boolean(round.ended_at)
  const targetName = round.submitter_player_id
    ? (active.find((p) => p.id === round.submitter_player_id)?.name ?? '—')
    : '—'
  // Guessers are everyone EXCEPT the target — they can't guess their own statements.
  const guesserPool = active.filter((p) => p.id !== round.submitter_player_id)
  const guessed = guessCount[round.id] ?? 0

  const timerSecondsTotal = game?.timer_seconds ?? 45
  const started = round.started_at ? Date.parse(round.started_at) : null
  const secondsLeft = started
    ? Math.max(0, Math.round((started + timerSecondsTotal * 1000 - nowMs) / 1000))
    : timerSecondsTotal

  return (
    <div className="flex flex-col items-center justify-center gap-8 h-full">
      <div className="text-center space-y-1">
        <p className="text-white/60 text-lg uppercase tracking-widest">
          Round {round.round_number}
          {totalRounds ? ` of ${totalRounds}` : null}
          <span className="mx-3 text-white/30">·</span>
          <span>
            {guessed}/{guesserPool.length || '—'} guessed
          </span>
          {!revealing && (
            <>
              <span className="mx-3 text-white/30">·</span>
              <span style={{ color: secondsLeft <= 3 ? '#fca5a5' : 'inherit' }}>{secondsLeft}s left</span>
            </>
          )}
          {revealing && <span className="mx-3 text-white/30">·</span>}
          {revealing && <span style={{ color: '#fca5a5' }}>The lie is revealed</span>}
        </p>
        <p className="text-5xl lg:text-6xl font-black leading-tight">
          <span className="text-white/60 text-2xl font-normal align-middle">Now guessing about</span>{' '}
          <span style={{ color: 'var(--primary, #fff)' }}>{targetName}</span>
        </p>
        <p className="text-white/60 text-lg">Which one is the lie?</p>
      </div>

      {metadata ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
          {metadata.statements.map((statement, i) => {
            const isLie = revealing && metadata.lie_index === i
            return (
              <div
                key={i}
                className="rounded-2xl border-2 px-6 py-8 text-2xl leading-tight flex flex-col gap-4 min-h-56"
                style={{
                  borderColor: isLie ? '#ef4444' : 'rgba(255,255,255,0.2)',
                  background: isLie ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.06)',
                  boxShadow: isLie ? '0 0 40px rgba(239, 68, 68, 0.4)' : undefined,
                }}
              >
                <span
                  className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center text-2xl font-black self-start"
                  style={{
                    background: isLie ? '#ef4444' : 'rgba(255,255,255,0.15)',
                    color: isLie ? '#450a0a' : 'inherit',
                  }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="font-semibold">{statement}</p>
                {isLie && <p className="text-red-200 text-sm uppercase tracking-widest font-bold mt-auto">← the lie</p>}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-3xl text-white/60">Loading statements…</p>
      )}
    </div>
  )
}
