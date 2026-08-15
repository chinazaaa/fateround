'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import type { AnimeMetadata } from '@/types'

/**
 * Projector view for a Who Said This round in a tournament. Round shape is
 * "one quote per round" (built from the players-submit pool at game start).
 * Big screen shows the quote centred with the possible authors as answer
 * tiles; players tap their guess on their phones. On reveal the correct
 * tile glows green.
 */

type Round = {
  id: string
  round_number: number
  status: 'pending' | 'active' | 'finished'
  started_at: string | null
  ended_at: string | null
  quote_text: string | null
  anime_metadata: AnimeMetadata | Record<string, unknown> | null
}

type Game = {
  id: string
  status: 'waiting' | 'active' | 'finished' | null
  current_round_number: number | null
  timer_seconds: number | null
  rounds_count: number | null
}

function parseAnimeMetadata(raw: unknown): AnimeMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const choices = Array.isArray(m.choices) ? m.choices.filter((c): c is string => typeof c === 'string') : null
  if (!choices || choices.length === 0) return null
  const correct = typeof m.correct_character === 'string' ? m.correct_character : null
  if (!correct) return null
  return {
    source: m.source === 'anime' ? 'anime' : 'deck',
    anime_name: typeof m.anime_name === 'string' ? m.anime_name : '',
    correct_character: correct,
    choices,
  }
}

export function WhoSaidThisProjectorView({ gameCode }: { gameCode: string }) {
  const [game, setGame] = useState<Game | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [playerCount, setPlayerCount] = useState<number>(0)
  const [voteCount, setVoteCount] = useState<Record<string, number>>({})
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
        .select('id, round_number, status, started_at, ended_at, quote_text, anime_metadata')
        .eq('game_id', gameCode)
        .order('round_number', { ascending: true }),
      supabase.from('players').select('id, spectator').eq('game_id', gameCode),
    ])
    if (g.data) setGame(g.data as Game)
    if (r.data) setRounds(r.data as Round[])
    if (p.data) setPlayerCount((p.data as { spectator: boolean | null }[]).filter((x) => x.spectator !== true).length)
    // Vote counts per round from the shared votes table (WST uses `anime_choice`).
    const { data: votes } = await supabase.from('votes').select('round_id, anime_choice').eq('game_id', gameCode)
    const map: Record<string, number> = {}
    for (const v of votes ?? []) {
      const row = v as { round_id: string; anime_choice: string | null }
      if (!row.anime_choice) continue
      map[row.round_id] = (map[row.round_id] ?? 0) + 1
    }
    setVoteCount(map)
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'players', 'rounds', 'votes'], load)

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

  if (!round) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 h-full">
        <p className="text-white/60 text-lg uppercase tracking-widest">
          {game?.status === 'waiting' ? 'Waiting for host to start…' : 'Loading…'}
        </p>
        <p className="text-4xl text-white/60">Who Said This</p>
      </div>
    )
  }

  const metadata = parseAnimeMetadata(round.anime_metadata)
  const revealing = round.status === 'finished' && Boolean(round.ended_at)
  const voted = voteCount[round.id] ?? 0

  const timerSecondsTotal = game?.timer_seconds ?? 30
  const started = round.started_at ? Date.parse(round.started_at) : null
  const secondsLeft = started
    ? Math.max(0, Math.round((started + timerSecondsTotal * 1000 - nowMs) / 1000))
    : timerSecondsTotal

  return (
    <div className="flex flex-col items-center justify-center gap-8 h-full">
      <p className="text-white/60 text-lg uppercase tracking-widest text-center">
        Round {round.round_number}
        {totalRounds ? ` of ${totalRounds}` : null}
        <span className="mx-3 text-white/30">·</span>
        <span>
          {voted}/{playerCount || '—'} guessed
        </span>
        {!revealing && (
          <>
            <span className="mx-3 text-white/30">·</span>
            <span style={{ color: secondsLeft <= 3 ? '#fca5a5' : 'inherit' }}>{secondsLeft}s left</span>
          </>
        )}
        {revealing && <span className="mx-3 text-white/30">·</span>}
        {revealing && <span style={{ color: 'var(--primary, #fff)' }}>Answer revealed</span>}
      </p>

      {/* Quote card — the shared read moment for the room. */}
      <div
        className="w-full max-w-4xl px-8 py-10 rounded-3xl text-center"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <p
          className="text-4xl lg:text-5xl leading-snug italic"
          style={{ color: 'var(--primary, #fff)', fontFamily: 'Georgia, serif' }}
        >
          &ldquo;{round.quote_text ?? ''}&rdquo;
        </p>
        <p className="text-white/60 text-xl mt-6">Who said it?</p>
      </div>

      {metadata ? (
        <div
          className={`grid ${metadata.choices.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'} gap-4 w-full max-w-6xl`}
        >
          {metadata.choices.map((choice, i) => {
            const isCorrect = revealing && metadata.correct_character === choice
            return (
              <div
                key={i}
                className="rounded-2xl border-2 px-6 py-5 text-2xl font-semibold flex items-center gap-3 min-h-20"
                style={{
                  borderColor: isCorrect ? '#22c55e' : 'rgba(255,255,255,0.2)',
                  background: isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.06)',
                  color: isCorrect ? '#f0fdf4' : 'inherit',
                  boxShadow: isCorrect ? '0 0 40px rgba(34, 197, 94, 0.4)' : undefined,
                }}
              >
                <span
                  className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-lg font-black"
                  style={{
                    background: isCorrect ? '#22c55e' : 'rgba(255,255,255,0.15)',
                    color: isCorrect ? '#052e16' : 'inherit',
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1 truncate">{choice}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-3xl text-white/60">Loading options…</p>
      )}
    </div>
  )
}
