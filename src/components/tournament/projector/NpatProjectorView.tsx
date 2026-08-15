'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import {
  parseNpatMetadata,
  resolveActiveNpatRound,
  phaseSecondsLeft,
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
} from '@/lib/npat'
import type { NpatMetadata, NpatCategory } from '@/types'

/**
 * Projector view for an I Call On game. Big letter at the top, phase-aware
 * countdown, and a live per-category board showing which players have
 * submitted an answer (masked while writing; revealed once the phase moves
 * to marking / reveal). Players interact from their phones — this is the
 * shared surface for the room.
 *
 * Reveal in this shape is server-driven: as soon as the game engine flips
 * the round's phase, the projector re-renders and drops the mask.
 */

type Round = {
  id: string
  round_number: number
  status: 'pending' | 'active' | 'finished'
  started_at: string | null
  ended_at: string | null
  submitter_player_id: string | null
  npat_metadata: NpatMetadata | Record<string, unknown> | null
}

type Game = {
  id: string
  status: 'waiting' | 'active' | 'finished' | null
  current_round_number: number | null
  timer_seconds: number | null
  operative_timer_seconds: number | null
}

type Player = { id: string; name: string; spectator: boolean | null }

type Answer = {
  player_id: string
  round_id: string
  submitted_at: string | null
  name: string | null
  animal: string | null
  place: string | null
  thing: string | null
  food: string | null
}

const PHASE_LABEL: Record<string, string> = {
  letter_pick: 'Picking a letter',
  writing: 'Writing answers',
  marking: 'Marking answers',
  host_review: 'Host reviewing',
  reveal: 'Answers revealed',
}

export function NpatProjectorView({ gameCode }: { gameCode: string }) {
  const [game, setGame] = useState<Game | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  const load = useCallback(async () => {
    const [g, r, p, a] = await Promise.all([
      supabase
        .from('games')
        .select('id, status, current_round_number, timer_seconds, operative_timer_seconds')
        .eq('id', gameCode)
        .maybeSingle(),
      supabase
        .from('rounds')
        .select('id, round_number, status, started_at, ended_at, submitter_player_id, npat_metadata')
        .eq('game_id', gameCode)
        .order('round_number', { ascending: true }),
      supabase.from('players').select('id, name, spectator').eq('game_id', gameCode),
      supabase
        .from('npat_answers')
        .select('player_id, round_id, submitted_at, name, animal, place, thing, food')
        .eq('game_id', gameCode),
    ])
    if (g.data) setGame(g.data as Game)
    if (r.data) setRounds(r.data as Round[])
    if (p.data) setPlayers(p.data as Player[])
    if (a.data) setAnswers(a.data as Answer[])
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'npat_answers', 'npat_marks'],
    load
  )

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  const round = resolveActiveNpatRound(
    rounds as Parameters<typeof resolveActiveNpatRound>[0],
    game?.current_round_number ?? 0
  ) as Round | null
  if (!round) {
    return (
      <PanelChrome subtitle={game?.status === 'waiting' ? 'Waiting for host to start…' : 'Loading…'}>
        <p className="text-4xl" style={{ color: 'var(--muted)' }}>
          I Call On
        </p>
      </PanelChrome>
    )
  }

  const metadata =
    round.npat_metadata && typeof round.npat_metadata === 'object'
      ? parseNpatMetadata(round.npat_metadata as Record<string, unknown>)
      : null
  const phase = metadata?.phase ?? 'letter_pick'
  const letter = metadata?.letter
  const active = players.filter((p) => p.spectator !== true)
  const roundAnswers = answers.filter((a) => a.round_id === round.id && a.submitted_at)
  const submittedIds = new Set(roundAnswers.map((a) => a.player_id))
  const callerId = round.submitter_player_id
  const callerName = callerId ? (active.find((p) => p.id === callerId)?.name ?? null) : null

  // Only reveal actual answer text once we're out of the write phase — during
  // writing the board just shows a dot per submitter, no leaked strings.
  const reveal = phase === 'marking' || phase === 'host_review' || phase === 'reveal'

  // `phaseSecondsLeft` reads Date.now() internally — we re-render every 500ms
  // via nowMs so this stays live without threading a clock into the helper.
  void nowMs
  const secondsLeft = metadata
    ? phaseSecondsLeft(metadata, game?.timer_seconds ?? 60, game?.operative_timer_seconds ?? 45)
    : null

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top strip: letter + phase + countdown */}
      <div
        className="rounded-2xl px-6 py-4 flex items-center gap-6"
        style={{ background: 'var(--surface-inset-bg)', borderLeft: '6px solid var(--primary)' }}
      >
        <div>
          <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Letter
          </p>
          <p className="text-7xl font-black leading-none" style={{ color: 'var(--primary)' }}>
            {letter ?? '—'}
          </p>
        </div>
        <div className="flex-1">
          <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Phase
          </p>
          <p className="text-3xl font-bold">{PHASE_LABEL[phase] ?? phase}</p>
          {callerName && phase === 'letter_pick' && (
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {callerName} is picking
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Countdown
          </p>
          <p
            className="text-5xl font-black tabular-nums"
            style={{ color: secondsLeft != null && secondsLeft <= 5 ? '#ef4444' : 'var(--primary)' }}
          >
            {secondsLeft != null ? `${secondsLeft}s` : '—'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Submitted
          </p>
          <p className="text-5xl font-black tabular-nums">
            {submittedIds.size}
            <span style={{ color: 'var(--faint)' }}>/</span>
            {active.length || '—'}
          </p>
        </div>
      </div>

      {/* Per-category board */}
      <div className="grid grid-cols-5 gap-3 flex-1 min-h-0">
        {NPAT_CATEGORIES.map((cat) => (
          <div
            key={cat}
            className="rounded-2xl border p-4 flex flex-col gap-2 min-h-0"
            style={{ background: 'var(--surface-inset-bg)', borderColor: 'var(--border)' }}
          >
            <p className="text-lg font-bold uppercase tracking-widest text-center" style={{ color: 'var(--muted)' }}>
              {NPAT_CATEGORY_LABELS[cat as NpatCategory] ?? cat}
            </p>
            <ol className="flex-1 space-y-1.5 overflow-y-auto pr-1">
              {active.map((p) => {
                const submitted = submittedIds.has(p.id)
                const answer = reveal ? (roundAnswers.find((a) => a.player_id === p.id)?.[cat] ?? '') : ''
                return (
                  <li key={p.id} className="flex items-baseline gap-2 text-xl" style={{ opacity: submitted ? 1 : 0.4 }}>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        background: submitted ? 'var(--primary)' : 'transparent',
                        border: submitted ? undefined : '1px solid var(--faint)',
                      }}
                      aria-hidden
                    />
                    <span className="text-sm truncate w-24" style={{ color: 'var(--muted)' }}>
                      {p.name}
                    </span>
                    <span className="flex-1 truncate font-semibold">
                      {reveal
                        ? answer || (
                            <span className="italic" style={{ color: 'var(--faint)' }}>
                              —
                            </span>
                          )
                        : ''}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelChrome({ subtitle, children }: { subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full">
      <p className="text-lg uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
        {subtitle}
      </p>
      {children}
    </div>
  )
}
