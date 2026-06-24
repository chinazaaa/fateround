'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { NpatActiveRound } from '@/components/npat/NpatActiveRound'
import { NpatFinalResultsShareBlock } from '@/components/npat/NpatFinalResultsShareBlock'
import { NpatScoreboard } from '@/components/npat/NpatScoreboard'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { HostModePanel } from '@/components/host/HostModePanel'
import { HostPlayManageTabs } from '@/components/host/HostPlayManageTabs'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
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
  parseNpatMetadata,
  resolveActiveNpatRound,
  setNpatHostMode,
  tallyNpatScores,
  type NpatHostMode,
} from '@/lib/npat'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, NPAT_ANSWER_SELECT, NPAT_MARK_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import type { Game, NpatAnswer, NpatMark, Player, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
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
  const [gameDurationSeconds, setGameDurationSeconds] = useState(0)
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
      setGameDurationSeconds(gameRes.data.game_duration_seconds ?? 0)
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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'npat_answers', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'npat_marks', filter: `game_id=eq.${gameCode}` },
        () => load()
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

  const currentRound = useMemo(() => {
    if (!game) return null
    return resolveActiveNpatRound(rounds, game.current_round_number)
  }, [rounds, game])

  const currentMetadata = currentRound ? parseNpatMetadata(currentRound.npat_metadata) : null

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    if (hostMode === 'player' && hostPlayerId && game?.status === 'active') {
      setTab('play')
    }
  }, [hostMode, hostPlayerId, game?.status])

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
      const saveRes = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          timer_seconds: timerSeconds,
          operative_timer_seconds: markingTimerSeconds,
          game_duration_seconds: gameDurationSeconds,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error ?? 'Failed to save timers')

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
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
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
  const showPlayTab = hostPlays && game?.status !== 'waiting' && game?.status !== 'finished'
  const canStart = players.length >= NPAT_MIN_PLAYERS

  const currentRoundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const currentRoundMarks = useMemo(
    () => (currentRound ? marks.filter((m) => m.round_id === currentRound.id) : []),
    [marks, currentRound]
  )
  const leaderboard = useMemo(() => tallyNpatScores(answers, players), [answers, players])
  const showManageScoreboard =
    game?.status === 'active' &&
    currentMetadata != null &&
    (currentMetadata.phase === 'writing' ||
      currentMetadata.phase === 'marking' ||
      currentMetadata.phase === 'host_review' ||
      currentMetadata.phase === 'reveal')

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const cfg = gameTypeConfig('i_call_on')
  const playerLink = `${appOrigin()}/game/${gameCode}`

  const playerManageBlock =
    game.status === 'waiting' || game.status === 'active' ? (
      <HostLobbyPlayersSection
        players={players}
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
      />
    ) : null

  const layout = hostPlayLayoutFlags(tab, showPlayTab, game.status)

  return (
    <HostPageShell gameCode={gameCode} {...layout}>
      <HostGameHeader game={game} />

      {game.status === 'waiting' && (
        <HostModePanel
          hostMode={hostMode}
          onModeChange={changeHostMode}
          joinBlock={
            !hostPlayerId ? (
              <div className="flex items-center gap-2 pt-1">
                <div className="w-36 sm:w-44 shrink-0">
                  <input
                    type="text"
                    value={hostJoinName}
                    onChange={(e) => setHostJoinName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && hostJoinGame()}
                    placeholder="Your name"
                    className="input-field w-full"
                    maxLength={40}
                  />
                </div>
                <button
                  type="button"
                  onClick={hostJoinGame}
                  disabled={!hostJoinName.trim() || hostJoining}
                  className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
                >
                  {hostJoining ? 'Joining…' : 'Join'}
                </button>
              </div>
            ) : undefined
          }
          joinedHint={
            hostPlayerId ? (
              <p className="text-sm text-muted">
                Playing as <strong className="text-body">{hostPlayerName}</strong> — switch to Play after you start.
              </p>
            ) : undefined
          }
        />
      )}

      {showPlayTab && <HostPlayManageTabs tab={tab} onTabChange={setTab} />}

      {tab === 'play' && hostPlays && hostPlayerId && game.status === 'active' && (
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

      {(tab === 'manage' || !showPlayTab) && (
        <div className="space-y-4">
          {game.status === 'waiting' && (
            <>
              {playerManageBlock}

              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-3">
                <p className="label-caps">Game settings</p>
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

              <HostLobbyWaitingFooter
                gameCode={gameCode}
                hostToken={hostToken}
                onStart={startGame}
                onEnded={load}
                canStart={canStart}
                starting={starting}
                startDisabledHint={
                  canStart
                    ? null
                    : `Need at least ${NPAT_MIN_PLAYERS} players to start (${players.length}/${NPAT_MIN_PLAYERS})`
                }
              />
            </>
          )}

          {game.status === 'active' && (
            <>
              {playerManageBlock}
              {!hostPlayerId && (
                <div className="glass-card p-6 text-center text-muted">
                  Game in progress — choose Host + play in Host mode and join as a player to call letters and submit
                  answers.
                </div>
              )}
              {hostPlayerId && tab === 'manage' && (
                <div className="glass-card p-4 text-center text-sm text-muted">
                  You&apos;re playing as <strong className="text-body">{hostPlayerName}</strong> — switch to the Play
                  tab to pick letters and submit answers.
                </div>
              )}
              <PaginatedLeaderboard
                title="Leaderboard"
                rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
                highlightId={hostPlayerId}
                scoreLabel={(score) => `${score} pts`}
              />
              {showManageScoreboard && currentMetadata && (
                <NpatScoreboard
                  letter={currentMetadata.letter}
                  players={players}
                  answers={currentRoundAnswers}
                  marks={currentRoundMarks}
                  metadata={currentMetadata}
                  showScores={currentMetadata.scores_computed || currentMetadata.phase === 'reveal'}
                  maskAnswers={currentMetadata.phase === 'writing'}
                />
              )}
            </>
          )}

          {game.status === 'finished' && (
            <NpatFinalResultsShareBlock
              game={game}
              players={players}
              leaderboard={leaderboard}
              highlightPlayerId={hostPlayerId}
              playAgainButton={
                <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-primary w-full py-3">
                  {playingAgain ? 'Resetting…' : 'Play again'}
                </button>
              }
            />
          )}

          {game.status === 'active' && <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} />}
        </div>
      )}
    </HostPageShell>
  )
}
