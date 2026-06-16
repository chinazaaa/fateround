'use client'

// Yahtzee: player-facing roll/hold/score loop.

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
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId, YAHTZEE_MIN_PLAYERS, upperBonus, upperScore, totalScore } from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { Game, Player, YahtzeeCategory, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { preJoinScreen } from '@/lib/viewers'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'waiting' | 'active' | 'finished' | 'not_found'

export function YahtzeePlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)
  const [localHeld, setLocalHeld] = useState<boolean[]>([false, false, false, false, false])

  useApplyGameTheme(game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      setScreen('join')
      return
    }
    if (gameData.status === 'waiting') {
      setScreen('waiting')
      return
    }
    if (gameData.status === 'active') {
      setScreen('active')
      return
    }
    setScreen('finished')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, scoresRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('yahtzee_player_scores').select(YAHTZEE_PLAYER_SCORES_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, scoresRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data
    const sessionData = sessionRes.data as YahtzeeSession | null

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setSession(sessionData)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])

    if (sessionData?.held) {
      setLocalHeld(sessionData.held)
    }

    const stored = getPlayerSession(gameCode)
    let playerId = stored?.playerId ?? null
    if (stored && plrs && !plrs.some((p) => p.id === stored.playerId)) {
      clearPlayerSession(gameCode)
      playerId = null
      setMyPlayerId(null)
    } else if (stored) {
      setMyPlayerId(stored.playerId)
    }
    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`yahtzee-player-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_sessions', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_player_scores', filter: `game_id=eq.${gameCode}` }, () => void load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const join = async () => {
    if (!joinName.trim()) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: joinName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both')
      setMyPlayerId(data.playerId)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const postAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId) return
    setActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const toggleHold = async (index: number) => {
    if (!session || !myPlayerId) return
    const next = [...localHeld]
    next[index] = !next[index]
    setLocalHeld(next)
    await postAction('/api/yahtzee/hold', { held: next })
  }

  const cfg = gameTypeConfig('yahtzee')
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === myPlayerId
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const myScore = scores.find((s) => s.player_id === myPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const canRoll = isMyTurn && (session?.rolls_remaining ?? 0) > 0
  const canScore = isMyTurn && (session?.rolls_this_turn ?? 0) > 0

  if (screen === 'loading') return <YahtzeeLoadingScreen />

  if (screen === 'not_found') {
    return (
      <YahtzeeShell title="Game not found">
        <YahtzeePrimaryButton onClick={() => router.push('/')}>Back home</YahtzeePrimaryButton>
      </YahtzeeShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => setScreen('join')} />
  }

  if (screen === 'join') {
    return (
      <YahtzeeShell title={game?.title ?? cfg.label} subtitle="Enter your name to join">
        <YahtzeeCard className="p-6 space-y-5 max-w-md mx-auto">
          <div className="text-center">
            <div className="text-5xl mb-3">🎲</div>
            <p className="text-sm text-muted">2–8 players · roll, hold, score</p>
          </div>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name"
            className="input-field w-full"
            maxLength={40}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <YahtzeePrimaryButton onClick={() => void join()} disabled={!joinName.trim()} loading={joining}>
            Join game
          </YahtzeePrimaryButton>
        </YahtzeeCard>
        <ShareGameLinkCard gameCode={gameCode} className="max-w-md mx-auto" />
      </YahtzeeShell>
    )
  }

  if (screen === 'waiting') {
    return (
      <YahtzeeShell title={game?.title} subtitle="Waiting for the host to start">
        <YahtzeeCard className="p-4 text-center">
          <p className="text-3xl font-black text-[var(--primary)]">{players.length}</p>
          <p className="text-sm text-muted">
            player{players.length === 1 ? '' : 's'} joined · need {YAHTZEE_MIN_PLAYERS}+
          </p>
        </YahtzeeCard>
        <ShareGameLinkCard gameCode={gameCode} />
      </YahtzeeShell>
    )
  }

  if (screen === 'finished') {
    return (
      <YahtzeeShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        <YahtzeeCard className="py-10 text-center">
          <div className="text-6xl mb-3">🏆</div>
          {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
        </YahtzeeCard>
        <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={myPlayerId} />
        <YahtzeeSecondaryButton onClick={() => router.push('/')}>Back home</YahtzeeSecondaryButton>
      </YahtzeeShell>
    )
  }

  return (
    <YahtzeeShell title={game?.title}>
      <YahtzeeTurnBanner
        turnName={turnPlayer?.name ?? '—'}
        isMyTurn={isMyTurn}
        message={session?.status_message}
      />

      {session && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <YahtzeeCard className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-faint">Dice</p>
                <p className="text-sm font-semibold">
                  Rolls left: {session.rolls_remaining}
                  {isMyTurn && session.rolls_this_turn > 0 ? ' · Hold dice' : ''}
                </p>
              </div>
              <div className="text-3xl">{isMyTurn ? '🎲' : '—'}</div>
            </div>

            <YahtzeeDiceRow
              dice={session.dice}
              held={localHeld}
              interactive={isMyTurn && (session.rolls_this_turn ?? 0) > 0 && session.rolls_remaining > 0}
              onToggleHold={toggleHold}
            />

            {canRoll && (
              <YahtzeePrimaryButton onClick={() => postAction('/api/yahtzee/roll')} loading={acting}>
                Roll dice
              </YahtzeePrimaryButton>
            )}
          </YahtzeeCard>

          {myScore && (
            <YahtzeeCard className="p-4">
              <p className="text-xs uppercase tracking-widest text-faint mb-3">Your scorecard</p>
              {isMyTurn && (
                <div className="mb-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-muted font-semibold">Upper: {upperScore(myScore.scores.categories)}</span>
                  <span className="text-sm font-bold tabular-nums text-[var(--marry)]">
                    {upperBonus(myScore.scores.categories) > 0 ? `+${upperBonus(myScore.scores.categories)} bonus` : 'No bonus yet'}
                  </span>
                  <span className="sr-only">Total score {totalScore(myScore.scores.categories)}</span>
                </div>
              )}

              <YahtzeeScorecard
                categories={myScore.scores.categories}
                dice={isMyTurn ? session.dice : undefined}
                scoringEnabled={canScore}
                onScore={(category: YahtzeeCategory) => postAction('/api/yahtzee/score', { category })}
              />
            </YahtzeeCard>
          )}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint mb-2 px-1">Standings</p>
        <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={myPlayerId} />
      </div>
    </YahtzeeShell>
  )
}
