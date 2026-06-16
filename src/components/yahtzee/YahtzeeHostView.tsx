'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  YahtzeeCard,
  YahtzeeLoadingScreen,
  YahtzeePrimaryButton,
  YahtzeeSecondaryButton,
  YahtzeeShell,
  YahtzeeTurnBanner,
} from '@/components/yahtzee/YahtzeeChrome'
import { YahtzeeDiceRow } from '@/components/yahtzee/YahtzeeDice'
import { YahtzeeLeaderboard, YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId, YAHTZEE_MIN_PLAYERS, upperBonus, upperScore } from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import type { Game, Player, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'

export function YahtzeeHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)

  useApplyGameTheme(game?.theme)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, scoresRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('yahtzee_player_scores').select(YAHTZEE_PLAYER_SCORES_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, scoresRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as YahtzeeSession | null)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`yahtzee-host-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_sessions', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_player_scores', filter: `game_id=eq.${gameCode}` }, () => void load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

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
      success('Game started!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const finishGame = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end game')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end game')
    } finally {
      setEnding(false)
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
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('yahtzee')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.length >= YAHTZEE_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const activePlayerScore = scores.find((s) => s.player_id === turnPlayerId)

  if (!game) return <YahtzeeLoadingScreen />

  return (
    <YahtzeeShell title={game.title} subtitle={`${cfg.label} · Room ${gameCode}`}>
      <CopyLinkButton
        value={joinUrl}
        label="Copy player link"
        className="w-full !rounded-2xl !border-[var(--border-strong)] !bg-[var(--card)] !text-[var(--foreground)] hover:!bg-[var(--card-hover)]"
      />

      {game.status === 'waiting' && (
        <>
          <YahtzeeCard className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-faint">Lobby</p>
                <p className="text-2xl font-black">
                  {players.length} <span className="text-lg font-semibold text-muted">players</span>
                </p>
              </div>
              <div className="text-4xl">🎲</div>
            </div>
            <div className="space-y-2">
              {players.length === 0 ? (
                <p className="text-sm text-faint text-center py-4">Waiting for players…</p>
              ) : (
                players.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-inset-bg)] px-3 py-2.5 border border-[var(--border-strong)]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_25%,transparent)] text-sm font-bold">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-semibold">{p.name}</span>
                  </div>
                ))
              )}
            </div>
            {!canStart && (
              <p className="text-sm text-[var(--marry)] text-center">Need at least {YAHTZEE_MIN_PLAYERS} players</p>
            )}
          </YahtzeeCard>
          <YahtzeePrimaryButton onClick={startGame} disabled={!canStart} loading={starting}>
            Start Yahtzee
          </YahtzeePrimaryButton>
        </>
      )}

      {game.status === 'active' && session && (
        <>
          <YahtzeeTurnBanner turnName={turnPlayer?.name ?? '—'} message={session.status_message} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <YahtzeeCard className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-faint">Dice</p>
                  <p className="text-sm font-semibold">Rolls left: {session.rolls_remaining}</p>
                </div>
                <div className="text-3xl">🎲</div>
              </div>

              <YahtzeeDiceRow dice={session.dice} held={session.held} />
              <p className="text-center text-xs text-muted">Host view</p>
            </YahtzeeCard>

            {activePlayerScore && (
              <YahtzeeCard className="p-4">
                <p className="text-xs uppercase tracking-widest text-faint mb-3">
                  {turnPlayer?.name}&apos;s sheet
                </p>

                <div className="mb-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-muted font-semibold">Upper: {upperScore(activePlayerScore.scores.categories)}</span>
                  <span className="text-sm font-bold tabular-nums text-[var(--marry)]">
                    {upperBonus(activePlayerScore.scores.categories) > 0
                      ? `+${upperBonus(activePlayerScore.scores.categories)} bonus`
                      : 'No bonus yet'}
                  </span>
                </div>

                <YahtzeeScorecard
                  categories={activePlayerScore.scores.categories}
                  dice={session.dice}
                  scoringEnabled={false}
                />
              </YahtzeeCard>
            )}
          </div>
          <YahtzeeLeaderboard rows={scores} players={players} />
          <YahtzeeSecondaryButton onClick={finishGame} disabled={ending}>
            {ending ? 'Ending…' : 'End game early'}
          </YahtzeeSecondaryButton>
        </>
      )}

      {game.status === 'finished' && (
        <>
          <YahtzeeCard className="py-10 text-center">
            <div className="text-6xl mb-3">🏆</div>
            <p className="text-2xl font-black text-[var(--marry)]">
              {winner ? `${winner.name} wins!` : 'Game over'}
            </p>
          </YahtzeeCard>
          <YahtzeeLeaderboard rows={scores} players={players} />
          <YahtzeePrimaryButton onClick={playAgain} loading={playingAgain}>
            Play again
          </YahtzeePrimaryButton>
        </>
      )}

      <YahtzeeSecondaryButton onClick={() => router.push('/create')}>Create another game</YahtzeeSecondaryButton>
    </YahtzeeShell>
  )
}
