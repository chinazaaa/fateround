'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { parseTriviaMetadata } from '@/lib/trivia'
import type { TriviaMetadata } from '@/types'

/**
 * Kahoot-style projector view for a Trivia game inside a tournament. Renders
 * the current question, four giant answer tiles (A/B/C/D), a countdown, and
 * a live "N of M answered" counter. Read-only — players still interact from
 * their phones; this is the shared what-are-we-answering-right-now surface
 * for a room with a projector or TV.
 *
 * When a round finishes the correct answer is highlighted for the reveal
 * window; between rounds a small "waiting for next question…" placeholder
 * shows so the projector never blanks between beats.
 */

type Round = {
  id: string
  round_number: number
  status: 'pending' | 'active' | 'finished'
  started_at: string | null
  ended_at: string | null
  trivia_metadata: TriviaMetadata | Record<string, unknown> | null
}

type Game = {
  id: string
  status: 'waiting' | 'active' | 'finished' | null
  current_round_number: number | null
  timer_seconds: number | null
  rounds_count: number | null
}

const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const

export function TriviaProjectorView({ gameCode }: { gameCode: string }) {
  const [game, setGame] = useState<Game | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [answerCount, setAnswerCount] = useState<Record<string, number>>({})
  const [playerCount, setPlayerCount] = useState<number>(0)
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
        .select('id, round_number, status, started_at, ended_at, trivia_metadata')
        .eq('game_id', gameCode)
        .order('round_number', { ascending: true }),
      supabase.from('players').select('id, spectator').eq('game_id', gameCode),
    ])
    if (g.data) setGame(g.data as Game)
    if (r.data) setRounds(r.data as Round[])
    if (p.data) setPlayerCount((p.data as { spectator: boolean | null }[]).filter((x) => x.spectator !== true).length)
    // Answers grouped per round in a second query — one small select avoids
    // shipping every answer's payload; we only need counts.
    const { data: answers } = await supabase.from('trivia_answers').select('round_id').eq('game_id', gameCode)
    const map: Record<string, number> = {}
    for (const a of answers ?? []) {
      const k = (a as { round_id: string }).round_id
      map[k] = (map[k] ?? 0) + 1
    }
    setAnswerCount(map)
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'players', 'rounds', 'trivia_answers'], load)

  // Countdown re-tick — projector needs a live-looking timer, but 2 Hz is
  // enough (the SW pipeline updates rounds via realtime on transition).
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  const activeRound = rounds.find((r) => r.status === 'active') ?? null
  const currentByPointer = game?.current_round_number
    ? rounds.find((r) => r.round_number === game.current_round_number)
    : null
  // Prefer the row that's explicitly active — the pointer can lag a beat behind on transitions.
  const round = activeRound ?? currentByPointer ?? null
  const totalRounds = game?.rounds_count ?? rounds.length

  // No round loaded yet OR game hasn't started — show a "get ready" panel.
  if (!round) {
    return (
      <PanelChrome subtitle={game?.status === 'waiting' ? 'Waiting for host to start…' : 'Loading…'}>
        <p className="text-4xl text-white/60">Trivia</p>
      </PanelChrome>
    )
  }

  const metadata =
    round.trivia_metadata && typeof round.trivia_metadata === 'object'
      ? parseTriviaMetadata(round.trivia_metadata as Record<string, unknown>)
      : null
  const revealing = round.status === 'finished' && round.ended_at

  const answered = answerCount[round.id] ?? 0
  const timerSecondsTotal = game?.timer_seconds ?? 15
  const started = round.started_at ? Date.parse(round.started_at) : null
  const secondsLeft = started
    ? Math.max(0, Math.round((started + timerSecondsTotal * 1000 - nowMs) / 1000))
    : timerSecondsTotal

  return (
    <PanelChrome
      subtitle={
        <>
          <span>Question {round.round_number}</span>
          {totalRounds ? <span> of {totalRounds}</span> : null}
          <span className="mx-3 text-white/30">·</span>
          <span>
            {answered}/{playerCount || '—'} answered
          </span>
          {!revealing && (
            <>
              <span className="mx-3 text-white/30">·</span>
              <span style={{ color: secondsLeft <= 3 ? '#fca5a5' : 'inherit' }}>{secondsLeft}s left</span>
            </>
          )}
          {revealing && <span className="mx-3 text-white/30">·</span>}
          {revealing && <span style={{ color: 'var(--primary, #fff)' }}>Answer revealed</span>}
        </>
      }
    >
      {metadata ? (
        <>
          <h2 className="text-5xl lg:text-6xl font-black leading-tight text-center max-w-6xl">{metadata.question}</h2>
          <div className="grid grid-cols-2 gap-6 w-full max-w-6xl mt-4">
            {metadata.choices.map((choice, i) => {
              const isCorrect = revealing && metadata.correct_index === i
              return (
                <div
                  key={i}
                  className="rounded-2xl border-2 px-8 py-6 text-3xl font-semibold flex items-start gap-4"
                  style={{
                    borderColor: isCorrect ? '#22c55e' : 'rgba(255,255,255,0.2)',
                    background: isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.06)',
                    color: isCorrect ? '#f0fdf4' : 'inherit',
                    boxShadow: isCorrect ? '0 0 40px rgba(34, 197, 94, 0.4)' : undefined,
                  }}
                >
                  <span
                    className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center text-2xl font-black"
                    style={{
                      background: isCorrect ? '#22c55e' : 'rgba(255,255,255,0.15)',
                      color: isCorrect ? '#052e16' : 'inherit',
                    }}
                  >
                    {CHOICE_LETTERS[i] ?? String(i + 1)}
                  </span>
                  <span className="flex-1">{choice}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="text-3xl text-white/60">Loading question…</p>
      )}
    </PanelChrome>
  )
}

function PanelChrome({ subtitle, children }: { subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full">
      <p className="text-white/60 text-lg uppercase tracking-widest">{subtitle}</p>
      {children}
    </div>
  )
}
