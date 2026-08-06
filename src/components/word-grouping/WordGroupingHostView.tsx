'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, WORD_GROUPING_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { FinishedWinnerHero } from '@/components/FinishedWinnerHero'
import { HostLobby } from '@/components/game-lobby/HostLobby'
import { HostModeSelector } from '@/components/game-lobby/HostModeSelector'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useGameScores, useGameStats } from '@/components/roster/RosterDrawerContext'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { gameTypeConfig } from '@/lib/game-types'
import {
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_TOTAL_GROUPS,
  WORD_GROUPING_GAME_DURATION_OPTIONS,
  tallyWordGroupingScores,
} from '@fate-round/shared/word-grouping'
import { WordGroupingPlayerView } from './WordGroupingPlayerView'
import { formatMinutesSeconds } from '@/lib/timer-format'
import type { Game, Player } from '@/types'

const GROUP_COLORS: Record<number, string> = {
  1: '#f9df6d',
  2: '#a0c35a',
  3: '#b0c4ef',
  4: '#ba81c5',
}

interface Submission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  group_index: number
  difficulty: number
  guess_words: string[]
  is_correct: boolean
  mistakes_at_time: number
  submitted_at: string
}

interface SolutionGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

export function WordGroupingHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const cfg = gameTypeConfig('word_grouping')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [solution, setSolution] = useState<SolutionGroup[] | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())

  const { hostMode, setHostMode, hostPlayerId } = useHostSeat(gameCode, hostToken, game)

  const load = useCallback(async () => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (gameRes.data) setGame(gameRes.data as Game)
    if (plrsRes.data) setPlayers(plrsRes.data as Player[])

    const g = gameRes.data as Game | null
    if (g && (g.status === 'active' || g.status === 'finished')) {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        setRoundId(roundData.id)
        const { data: subs } = await supabase
          .from('word_grouping_submissions')
          .select(WORD_GROUPING_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        if (subs) setSubmissions(subs as Submission[])
      }

      if (g.status === 'finished') {
        const res = await fetch(`/api/word-grouping/solution?gameId=${gameCode}`)
        if (res.ok) {
          const { solution: sol } = await res.json()
          if (sol?.groups) setSolution(sol.groups)
        }
      }
    }
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useGameRosterPoll(gameCode, game?.status === 'waiting' || game?.status === 'active')
  useRegisterGameSettings(game)

  // Realtime: game changes
  useEffect(() => {
    if (!game) return
    const channel = supabase
      .channel(`wg-host-game-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => {
          load()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [game, gameCode, load])

  // Realtime: submissions
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`wg-host-subs-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'word_grouping_submissions',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => {
          const row = payload.new as Submission
          setSubmissions((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [roundId])

  // Timer tick
  useEffect(() => {
    if (game?.status !== 'active') return
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [game?.status])

  // Scoring
  const scores = useMemo(() => {
    const playersArr = players.map((p) => ({ id: p.id, name: p.name }))
    const tally = tallyWordGroupingScores(playersArr, submissions)
    return tally.map((t) => ({
      playerId: t.id,
      kiss: t.points,
      marry: t.groups,
      kill: t.mistakes,
    }))
  }, [players, submissions])

  useGameScores(scores)
  useGameStats(
    useMemo(
      () =>
        players.map((p) => {
          const mySubs = submissions.filter((s) => s.player_id === p.id)
          const groups = mySubs.filter((s) => s.is_correct).length
          const mistakes = mySubs.filter((s) => !s.is_correct).length
          const done = groups >= WORD_GROUPING_TOTAL_GROUPS || mistakes >= WORD_GROUPING_MAX_MISTAKES
          return {
            playerId: p.id,
            label: done ? `${groups}/4 ✓` : `${groups}/4`,
          }
        }),
      [players, submissions]
    )
  )

  const leaderboardRows = useMemo(() => {
    const playersArr = players.map((p) => ({ id: p.id, name: p.name }))
    return tallyWordGroupingScores(playersArr, submissions)
  }, [players, submissions])

  const sessionElapsedSeconds = useMemo(() => {
    if (!game?.session_started_at) return 0
    return Math.floor((nowMs - new Date(game.session_started_at).getTime()) / 1000)
  }, [game?.session_started_at, nowMs])

  const timerSeconds = game?.game_duration_seconds ?? 0
  const timeRemaining = timerSeconds > 0 ? Math.max(0, timerSeconds - sessionElapsedSeconds) : null

  // Handle start game
  const handleStart = async () => {
    await fetch(`/api/games/${gameCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken }),
    })
  }

  const handlePlayAgain = async () => {
    await fetch(`/api/games/${gameCode}/play-again`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken }),
    })
  }

  if (!game) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted">Loading…</div>
      </div>
    )
  }

  // Waiting / lobby
  if (game.status === 'waiting') {
    return (
      <HostLobby game={game} players={players} hostToken={hostToken} gameCode={gameCode} onStart={handleStart}>
        <HostModeSelector mode={hostMode} onChange={setHostMode} />
      </HostLobby>
    )
  }

  // Host plays along
  if (game.status === 'active' && hostMode === 'player') {
    return <WordGroupingPlayerView gameCode={gameCode} />
  }

  // Active — host spectating
  if (game.status === 'active') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Word Grouping — Live</h2>
          {timeRemaining !== null && (
            <span
              className="font-bold tabular-nums"
              style={{ color: timeRemaining <= 10 ? 'var(--error)' : undefined }}
            >
              {formatMinutesSeconds(timeRemaining)}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {players
            .filter((p) => !p.spectator)
            .map((p) => {
              const pSubs = submissions.filter((s) => s.player_id === p.id)
              const groups = pSubs.filter((s) => s.is_correct).length
              const mistakes = pSubs.filter((s) => !s.is_correct).length
              const done = groups >= WORD_GROUPING_TOTAL_GROUPS || mistakes >= WORD_GROUPING_MAX_MISTAKES
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted">
                    {groups}/4 groups · {mistakes} mistake{mistakes !== 1 ? 's' : ''}
                    {done && ' ✓'}
                  </span>
                </div>
              )
            })}
        </div>
      </div>
    )
  }

  // Finished
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <FinishedWinnerHero leaderboard={leaderboardRows} game={game} gameType="word_grouping" />

      {solution &&
        solution
          .sort((a, b) => a.difficulty - b.difficulty)
          .map((group) => (
            <div
              key={group.category}
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1], color: '#1a1a1a' }}
            >
              <div className="font-bold uppercase tracking-wider text-sm">{group.category}</div>
              <div className="mt-1 font-medium text-sm">{group.words.join(', ')}</div>
            </div>
          ))}

      <PaginatedLeaderboard
        rows={leaderboardRows.map((r, i) => ({
          rank: i + 1,
          name: r.name,
          value: `${r.points} pts`,
          detail: `${r.groups}/4 groups · ${r.mistakes} mistakes`,
        }))}
      />

      <div className="flex gap-2">
        <button type="button" onClick={handlePlayAgain} className="fr-btn fr-btn--primary flex-1">
          Play again
        </button>
      </div>
    </div>
  )
}
