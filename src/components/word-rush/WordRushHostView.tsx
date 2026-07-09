'use client'

import { useCallback, useEffect, useState } from 'react'
import { WordRushPlayPanel } from '@/components/word-rush/WordRushPlay'
import { WordRushFinishedResults } from '@/components/word-rush/WordRushFinishedResults'
import { WordRushCard, WordRushTeamRoster } from '@/components/word-rush/WordRushChrome'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
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
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useToast } from '@/components/ui/Toast'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
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
} from '@/lib/word-rush'
import type { Game, Player, WordRushAnswer, WordRushPlayer, WordRushSession } from '@/types'

type HostTab = 'play' | 'manage'
type HostMode = 'spectator' | 'player'
const HOST_MODE_KEY = 'word_rush_host_mode'

function getHostMode(gameCode: string): HostMode {
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(`${HOST_MODE_KEY}_${gameCode}`) as HostMode) ?? 'player'
}

function storeHostMode(gameCode: string, mode: HostMode) {
  if (typeof window !== 'undefined') localStorage.setItem(`${HOST_MODE_KEY}_${gameCode}`, mode)
}

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
  const [hostMode, setHostMode] = useState<HostMode>('player')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [picking, setPicking] = useState(false)
  const [moving, setMoving] = useState(false)
  const [balancing, setBalancing] = useState(false)
  const [shuffling, setShuffling] = useState(false)
  const [endingRound, setEndingRound] = useState(false)

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
    setHostMode(getHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored?.playerId) {
      setHostPlayerId(stored.playerId)
      setHostResumeToken(stored.resumeToken ?? null)
      setHostPlayerName(stored.playerName)
    }
  }, [load, gameCode])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const clearHostPlayer = () => {
    setHostPlayerId(null)
    setHostResumeToken(null)
    setHostPlayerName('')
    clearPlayerSession(gameCode)
  }

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, (id) => {
    if (id === hostPlayerId) clearHostPlayer()
    void load()
  })
  useHostPlayerReconciliation(players, hostPlayerId, clearHostPlayer)
  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'word_rush_sessions', 'word_rush_players', 'word_rush_answers'],
    load
  )
  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })
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

  const changeHostMode = async (mode: HostMode) => {
    const prev = hostMode
    setHostMode(mode)
    storeHostMode(gameCode, mode)
    if (mode === 'spectator' && prev === 'player' && hostPlayerId) {
      try {
        const res = await fetch('/api/players', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, playerId: hostPlayerId, hostToken }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to leave seat')
        }
        clearHostPlayer()
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to leave seat')
      }
    }
  }

  const hostJoinGame = async () => {
    if (!hostJoinName.trim()) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: hostJoinName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const renameHost = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || !hostPlayerId) return
    try {
      const res = await fetch('/api/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId: hostPlayerId, playerName: trimmed, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update name')
      setHostPlayerName(data.playerName)
      setPlayerSession(gameCode, hostPlayerId, data.playerName, 'both', hostResumeToken)
      await load()
      success('Name updated!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update name')
    }
  }

  const pickTeam = async (team: number) => {
    if (!hostPlayerId || !hostResumeToken) {
      toastError('Join as a player first')
      return
    }
    setPicking(true)
    try {
      const res = await fetch('/api/word-rush/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, team }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to pick team')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to pick team')
    } finally {
      setPicking(false)
    }
  }

  const moveTeam = async (playerId: string, team: number) => {
    setMoving(true)
    try {
      const res = await fetch('/api/word-rush/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId, team }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to move player')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to move player')
    } finally {
      setMoving(false)
    }
  }

  const balanceTeams = async () => {
    setBalancing(true)
    try {
      const res = await fetch('/api/word-rush/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to balance teams')
      await load()
      success('Teams balanced')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to balance teams')
    } finally {
      setBalancing(false)
    }
  }

  const shuffleTeams = async () => {
    setShuffling(true)
    try {
      const res = await fetch('/api/word-rush/shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to shuffle teams')
      await load()
      success('Teams shuffled')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to shuffle teams')
    } finally {
      setShuffling(false)
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
    const keepHostSession = hostMode === 'player' && hostPlayerId && hostPlayerName
    const savedPlayerId = hostPlayerId
    const savedPlayerName = hostPlayerName
    const savedResumeToken = hostResumeToken
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      if (data.game) setGame(data.game)
      setSession(null)
      setAnswers([])
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
      await load()
      if (keepHostSession && savedPlayerId && savedPlayerName) {
        setPlayerSession(gameCode, savedPlayerId, savedPlayerName, 'both', savedResumeToken)
        setHostPlayerId(savedPlayerId)
        setHostPlayerName(savedPlayerName)
        setHostResumeToken(savedResumeToken)
      } else {
        clearHostPlayer()
      }
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
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const watchRound =
    game.status === 'active' && session ? (
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
        onEndRoundEarly={() => void endRoundEarly()}
        endingRound={endingRound}
      />
    ) : (
      <div className="glass-card p-6 text-center space-y-2">
        <p className="font-bold">Watch mode</p>
        <p className="text-muted text-sm">
          Open {appOrigin()}/game/{gameCode} on your phone to follow along.
        </p>
      </div>
    )

  const submitWord = async (text: string) => {
    if (!hostResumeToken) {
      toastError('Join as a player first')
      return { error: 'Join as a player first' }
    }
    try {
      const res = await fetch('/api/word-rush/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, text }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to submit')
        return { error: data.error ?? 'Failed to submit' }
      }
      if (data.correct && data.points) success(`+${data.points} pts!`)
      await load()
      return { correct: data.correct as boolean | undefined }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to submit')
      return { error: err instanceof Error ? err.message : 'Failed to submit' }
    }
  }

  const endRoundEarly = async () => {
    setEndingRound(true)
    try {
      const res = await fetch('/api/word-rush/end-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end round')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end round')
    } finally {
      setEndingRound(false)
    }
  }

  const interactivePlay = session ? (
    <WordRushPlayPanel
      session={session}
      players={players}
      teamRows={teamPlain}
      answers={answers}
      myPlayerId={hostPlays ? hostPlayerId : null}
      secondsLeft={secondsLeft}
      intermissionLeft={intermissionLeft}
      urgent={urgent}
      readOnly={!hostPlays}
      onSubmit={hostPlays ? (text) => submitWord(text) : undefined}
      onEndRoundEarly={() => void endRoundEarly()}
      endingRound={endingRound}
      onPrompt={
        hostPlays
          ? (startLetter, endLetter) => {
              if (!hostResumeToken) return
              void fetch('/api/word-rush/prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, startLetter, endLetter }),
              }).then(() => load())
            }
          : undefined
      }
    />
  ) : (
    <div className="glass-card p-6 text-center text-muted text-sm">Start the game to watch the round.</div>
  )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
        <HostModeSelector
          mode={hostMode}
          onChange={(m) => void changeHostMode(m)}
          joinedPlayerId={hostPlayerId}
          joinedPlayerName={hostPlayerName}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          onEditName={renameHost}
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — play from the Play tab once you
              start.
            </p>
          }
        />
      )}
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
        </WordRushCard>
      )}
      {game.status === 'waiting' && mode === 'team' && (
        <WordRushCard className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">Teams ({numTeams})</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void balanceTeams()}
                disabled={balancing || shuffling}
                className="text-xs font-bold rounded-lg border border-[var(--border-strong)] px-3 py-1.5 hover:bg-orange-500/10 disabled:opacity-50"
              >
                {balancing ? 'Balancing…' : 'Auto-balance'}
              </button>
              <button
                type="button"
                onClick={() => void shuffleTeams()}
                disabled={balancing || shuffling}
                className="text-xs font-bold rounded-lg border border-[var(--border-strong)] px-3 py-1.5 hover:bg-orange-500/10 disabled:opacity-50"
              >
                {shuffling ? 'Shuffling…' : 'Shuffle'}
              </button>
            </div>
          </div>
          <WordRushTeamRoster
            numTeams={numTeams}
            teamRows={teamPlain}
            players={players}
            myPlayerId={hostPlays ? hostPlayerId : null}
            onPick={hostPlays ? (team) => void pickTeam(team) : undefined}
            picking={picking}
            onMoveTeam={(playerId, team) => void moveTeam(playerId, team)}
            moving={moving}
          />
          <p className="text-faint text-[11px] text-center">Tap a colored number to move a player to that team.</p>
          {!lobbyReady.ok && <p className="text-amber-400 text-xs text-center">{lobbyReady.error}</p>}
        </WordRushCard>
      )}
      {(game.status === 'waiting' || game.status === 'active') && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}
      {(game.status === 'waiting' || game.status === 'active') && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          highlightPlayerId={hostPlayerId}
          alwaysShowReady={game.status === 'waiting'}
        />
      )}
      {game.status === 'active' && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Game controls</p>
          {(session?.phase === 'playing' || session?.phase === 'awaiting_prompt') && (
            <button
              type="button"
              disabled={endingRound}
              onClick={() => void endRoundEarly()}
              className="btn-secondary w-full py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {endingRound ? 'Ending round…' : 'End round early'}
            </button>
          )}
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
          meId={hostPlayerId}
          isHost
          minPlayers={minPlayers}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
          starting={starting}
        />
        <button
          type="button"
          onClick={() =>
            void confirm({
              title: 'Return to lobby?',
              message: 'Tweak settings before the next game.',
              confirmLabel: 'Return to lobby',
            }).then((ok) => ok && void resetGame(false))
          }
          disabled={playingAgain}
          className="mt-1 py-2 text-sm font-medium text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby instead
        </button>
      </div>
    )
  }

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={game.status !== 'finished'}
      gameStarted={game.status === 'active'}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={finished}
    />
  )
}
