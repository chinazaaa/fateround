'use client'

import { useCallback, useEffect, useState } from 'react'
import { WordRushPlayPanel } from '@/components/word-rush/WordRushPlay'
import { WordRushFinishedResults } from '@/components/word-rush/WordRushFinishedResults'
import { WordRushCard } from '@/components/word-rush/WordRushChrome'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { appOrigin } from '@/lib/site'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  WORD_RUSH_ANSWER_SELECT,
  WORD_RUSH_PLAYER_SELECT,
  WORD_RUSH_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useWordRushTimer } from '@/hooks/useWordRushTimer'
import {
  WORD_RUSH_MIN_PLAYERS,
  WORD_RUSH_MIN_PLAYERS_INDIVIDUAL,
  WORD_RUSH_ROUND_OPTIONS,
  WORD_RUSH_TEAM_OPTIONS,
  WORD_RUSH_TURN_OPTIONS,
  formatWordRushTurnTimer,
  WORD_RUSH_MAX_PLAYER_OPTIONS,
  clampWordRushMode,
  clampWordRushPromptMode,
  clampWordRushTeams,
  wordRushLobbyReady,
  teamLabel,
} from '@/lib/word-rush'
import type { Game, Player, WordRushAnswer, WordRushPlayer, WordRushSession } from '@/types'

type HostTab = 'play' | 'manage'

export function WordRushHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<WordRushSession | null>(null)
  const [teamRows, setTeamRows] = useState<WordRushPlayer[]>([])
  const [answers, setAnswers] = useState<WordRushAnswer[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, teamRes, answerRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('word_rush_sessions').select(WORD_RUSH_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('word_rush_players').select(WORD_RUSH_PLAYER_SELECT).eq('game_id', gameCode),
      supabase
        .from('word_rush_answers')
        .select(WORD_RUSH_ANSWER_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(80),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, teamRes, answerRes)) return false
    if (gameRes.data) setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession((sessionRes.data as WordRushSession | null) ?? null)
    setTeamRows((teamRes.data ?? []) as WordRushPlayer[])
    setAnswers((answerRes.data ?? []) as WordRushAnswer[])
    return true
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'word_rush_sessions', 'word_rush_players', 'word_rush_answers'],
    load
  )
  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, () => void load())
  const { secondsLeft, intermissionLeft, urgent } = useWordRushTimer(gameCode, session, true)

  const saveSettings = async (patch: Record<string, unknown>) => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/word-rush/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      await load()
      success('Settings saved')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const startGame = async () => {
    if (starting) return
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
      setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const resetGame = async (sameSettings: boolean) => {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      if (data.game) setGame(data.game)
      setSession(null)
      setAnswers([])
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
      await load()
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const mode = clampWordRushMode(game.word_rush_mode)
  const promptMode = clampWordRushPromptMode(game.word_rush_prompt_mode)
  const numTeams = clampWordRushTeams(game.word_rush_num_teams)
  const readyPlayers = players.filter((p) => p.spectator !== true)
  const minPlayers = mode === 'individual' ? WORD_RUSH_MIN_PLAYERS_INDIVIDUAL : WORD_RUSH_MIN_PLAYERS
  const lobbyReady = wordRushLobbyReady(teamRows, numTeams, mode)
  const canStart = readyPlayers.length >= minPlayers && lobbyReady.ok
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team, score: r.score }))

  const watchRound = (
    <div className="glass-card p-6 text-center space-y-2">
      <p className="font-bold">Watch mode</p>
      <p className="text-muted text-sm">
        Open {appOrigin()}/game/{gameCode} on your phone to follow along.
      </p>
    </div>
  )

  const interactivePlay = session ? (
    <WordRushPlayPanel
      session={session}
      players={players}
      teamRows={teamPlain}
      answers={answers}
      myPlayerId={null}
      secondsLeft={secondsLeft}
      intermissionLeft={intermissionLeft}
      urgent={urgent}
      readOnly
    />
  ) : (
    <div className="glass-card p-6 text-center text-muted text-sm">Start the game to watch the round.</div>
  )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status !== 'finished' && <HostRulesRow gameType="word_rush" />}
      {game.status === 'waiting' && (
        <WordRushCard className="space-y-4">
          <p className="font-bold">Word Rush settings</p>
          <div className="grid grid-cols-2 gap-2">
            {(['team', 'individual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={savingSettings}
                onClick={() => void saveSettings({ mode: m })}
                className={[
                  'rounded-xl border-2 px-3 py-3 text-sm font-bold capitalize',
                  mode === m ? 'border-orange-400 bg-orange-500/15' : 'border-[var(--border-strong)]',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['automatic', 'manual'] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={savingSettings}
                onClick={() => void saveSettings({ promptMode: p })}
                className={[
                  'rounded-xl border-2 px-3 py-3 text-sm font-bold capitalize',
                  promptMode === p ? 'border-orange-400 bg-orange-500/15' : 'border-[var(--border-strong)]',
                ].join(' ')}
              >
                {p}
              </button>
            ))}
          </div>
          {mode === 'team' && (
            <label className="block text-sm">
              Teams
              <select
                className="input-field w-full mt-1"
                value={numTeams}
                disabled={savingSettings}
                onChange={(e) => void saveSettings({ numTeams: Number(e.target.value) })}
              >
                {WORD_RUSH_TEAM_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} teams
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            {mode === 'team' ? 'Team turn length' : 'Round length'}
            <select
              className="input-field w-full mt-1"
              value={game.timer_seconds ?? 120}
              disabled={savingSettings}
              onChange={(e) => void saveSettings({ turnSeconds: Number(e.target.value) })}
            >
              {WORD_RUSH_TURN_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {formatWordRushTurnTimer(n)}
                </option>
              ))}
            </select>
          </label>
          {mode === 'individual' && (
            <label className="block text-sm">
              Rounds
              <select
                className="input-field w-full mt-1"
                value={game.rounds_count ?? 5}
                disabled={savingSettings}
                onChange={(e) => void saveSettings({ rounds: Number(e.target.value) })}
              >
                {WORD_RUSH_ROUND_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} rounds
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Max players
            <select
              className="input-field w-full mt-1"
              value={game.max_players ?? 12}
              disabled={savingSettings}
              onChange={(e) => void saveSettings({ maxPlayers: Number(e.target.value) })}
            >
              {WORD_RUSH_MAX_PLAYER_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {mode === 'team' && (
            <div className="text-sm space-y-1">
              {Array.from({ length: numTeams }, (_, i) => i + 1).map((team) => (
                <div key={team}>
                  <span className="font-semibold">{teamLabel(team)}:</span>{' '}
                  {teamRows
                    .filter((r) => r.team === team)
                    .map((r) => players.find((p) => p.id === r.player_id)?.name ?? '?')
                    .join(', ') || '—'}
                </div>
              ))}
            </div>
          )}
        </WordRushCard>
      )}
      {game.status === 'active' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}
      {(game.status === 'waiting' || game.status === 'active') && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          alwaysShowReady={game.status === 'waiting'}
        />
      )}
      {game.status === 'active' && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Game controls</p>
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={16} />}
            className="btn-danger-soft"
          />
        </div>
      )}
      {game.status === 'waiting' && !game.replay_pending && (
        <HostLobbyWaitingFooter
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          onGameUpdate={setGame}
          onStart={() => void startGame()}
          onEnded={load}
          canStart={canStart}
          starting={starting}
          startDisabledHint={
            canStart
              ? null
              : readyPlayers.length < minPlayers
                ? `Need at least ${minPlayers} players (${readyPlayers.length}/${minPlayers})`
                : lobbyReady.ok
                  ? null
                  : lobbyReady.error
          }
        />
      )}
    </div>
  )

  const finished = (
    <WordRushFinishedResults
      game={game}
      session={session}
      players={players}
      teamRows={teamRows}
      answers={answers}
      playAgainButton={
        <button
          type="button"
          disabled={playingAgain}
          onClick={() =>
            void confirm({
              title: 'Play again — same settings?',
              message: 'Reopens the game for ready-up.',
              confirmLabel: 'Play again',
            }).then((ok) => ok && void resetGame(true))
          }
          className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
        >
          {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
        </button>
      }
      returnToLobbyButton={
        <button
          type="button"
          disabled={playingAgain}
          onClick={() =>
            void confirm({
              title: 'Return to lobby?',
              message: 'Tweak settings before the next game.',
              confirmLabel: 'Return to lobby',
            }).then((ok) => ok && void resetGame(false))
          }
          className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby
        </button>
      }
    />
  )

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8">
        <ReplayReadyRing
          players={players}
          meId={null}
          isHost
          minPlayers={minPlayers}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
          starting={starting}
        />
      </div>
    )
  }

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind="watch"
      showTabs={game.status !== 'finished'}
      gameStarted={game.status === 'active'}
      header={<HostGameHeader game={game} />}
      primary={game.status === 'active' ? interactivePlay : watchRound}
      manage={manage}
      finished={finished}
    />
  )
}
