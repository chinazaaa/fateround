'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  DESCRIBE_IT_SESSION_SELECT,
  DESCRIBE_IT_PLAYER_SELECT,
  DESCRIBE_IT_WORD_SELECT,
  DESCRIBE_IT_GUESS_SELECT,
} from '@/lib/supabase-selects'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { DescribeItGuess, DescribeItPlayer, DescribeItSession, DescribeItWord, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useDescribeItTimer } from '@/hooks/useDescribeItTimer'
import { useDescribeItSounds } from '@/hooks/useDescribeItSounds'
import {
  clampDescribeItTeams,
  clampDescribeItRounds,
  clampDescribeItMaxPlayers,
  clampDescribeItMode,
  computeDescribeItScores,
  describeItIndividualLeaderboard,
  describeItLobbyReady,
  DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  DESCRIBE_IT_MAX_PLAYER_OPTIONS,
  DESCRIBE_IT_MIN_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
  DESCRIBE_IT_ROUND_OPTIONS,
  DESCRIBE_IT_TEAM_OPTIONS,
  DESCRIBE_IT_TURN_OPTIONS,
  isDescribeItResultsPhase,
} from '@/lib/describe-it'
import { parseDescribeItWords, parseExcelDescribeItWords, parseStoredDescribeItWords } from '@/lib/describe-it-words'
import { LibraryPackBrowser } from '@/components/LibraryPackPicker'
import { questionSampleFile, questionUploadHint, parseQuestionSource } from '@/lib/custom-questions'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import {
  DescribeItCard,
  DescribeItPlayerScoreboard,
  DescribeItPrimaryButton,
  DescribeItScoreboard,
  DescribeItTeamRoster,
} from '@/components/describe-it/DescribeItChrome'
import { DescribeItPlayPanel } from '@/components/describe-it/DescribeItPlay'
import { DescribeItFinalResultsShareBlock } from '@/components/describe-it/DescribeItFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'

type HostMode = 'spectator' | 'player'
type HostTab = 'play' | 'manage'
const HOST_MODE_KEY = 'describe_it_host_mode'

function getHostMode(gameCode: string): HostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${HOST_MODE_KEY}_${gameCode}`) as HostMode) ?? 'spectator'
}
function storeHostMode(gameCode: string, mode: HostMode) {
  if (typeof window !== 'undefined') localStorage.setItem(`${HOST_MODE_KEY}_${gameCode}`, mode)
}

export function DescribeItHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<DescribeItSession | null>(null)
  const [teamRows, setTeamRows] = useState<DescribeItPlayer[]>([])
  const [words, setWords] = useState<DescribeItWord[]>([])
  const [guesses, setGuesses] = useState<DescribeItGuess[]>([])
  const [starting, setStarting] = useState(false)
  const [balancing, setBalancing] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [moving, setMoving] = useState(false)

  const [hostMode, setHostMode] = useState<HostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [wordsDraft, setWordsDraft] = useState('')
  const [savingWords, setSavingWords] = useState(false)
  const [wordsUploadError, setWordsUploadError] = useState<string | null>(null)
  const [wordSource, setWordSource] = useState<'platform' | 'library' | 'custom'>('custom')
  const [wordTab, setWordTab] = useState<'upload' | 'paste'>('upload')
  const wordsInitRef = useRef(false)
  const wordsFileRef = useRef<HTMLInputElement>(null)

  useApplyGameTheme(game?.theme)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setLoading(false)

    const [sessionRes, teamRes, wordRes, guessRes] = await Promise.all([
      supabase.from('describe_it_sessions').select(DESCRIBE_IT_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('describe_it_players')
        .select(DESCRIBE_IT_PLAYER_SELECT)
        .eq('game_id', gameCode)
        .order('created_at'),
      supabase.from('describe_it_words').select(DESCRIBE_IT_WORD_SELECT).eq('game_id', gameCode),
      supabase
        .from('describe_it_guesses')
        .select(DESCRIBE_IT_GUESS_SELECT)
        .eq('game_id', gameCode)
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    if (supabasePollOk(sessionRes)) setSession(sessionRes.data as DescribeItSession | null)
    if (supabasePollOk(teamRes)) setTeamRows((teamRes.data ?? []) as DescribeItPlayer[])
    if (supabasePollOk(wordRes)) setWords((wordRes.data ?? []) as DescribeItWord[])
    if (supabasePollOk(guessRes)) setGuesses((guessRes.data ?? []) as DescribeItGuess[])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostResumeToken(stored.resumeToken ?? null)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 80)
  }, [load])

  useEffect(() => {
    const channel = supabase.channel(`describe-it-host-${gameCode}`)
    for (const table of [
      'games',
      'players',
      'describe_it_sessions',
      'describe_it_players',
      'describe_it_words',
      'describe_it_guesses',
    ]) {
      const filter = table === 'games' ? `id=eq.${gameCode}` : `game_id=eq.${gameCode}`
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, scheduleLoad)
    }
    channel.subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  // Seed the words editor from the saved custom words once the game loads.
  useEffect(() => {
    if (wordsInitRef.current || !game) return
    wordsInitRef.current = true
    setWordsDraft(parseStoredDescribeItWords(game.custom_questions).join('\n'))
    setWordSource(parseQuestionSource(game.question_source, 'describe_it') === 'platform' ? 'platform' : 'custom')
  }, [game])

  const saveSettings = async (partial: Record<string, unknown>): Promise<boolean> => {
    try {
      await post('settings', { hostToken, ...partial })
      await load()
      return true
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update settings')
      return false
    }
  }

  const saveWords = async () => {
    setSavingWords(true)
    try {
      await saveSettings({ words: wordsDraft })
    } finally {
      setSavingWords(false)
    }
  }

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

  // Clear stale host-as-player state if the host's own row is removed elsewhere.
  useHostPlayerReconciliation(players, hostPlayerId, clearHostPlayer)

  const changeHostMode = (mode: HostMode) => {
    setHostMode(mode)
    storeHostMode(gameCode, mode)
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

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/describe-it/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Action failed')
  }

  const pickTeam = async (team: number) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setPicking(true)
    try {
      await post('team', { resumeToken: hostResumeToken, team })
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to pick team')
    } finally {
      setPicking(false)
    }
  }

  const sendAction = async (path: string, body: Record<string, unknown>) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      await post(path, { resumeToken: hostResumeToken, ...body })
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const moveTeam = async (playerId: string, team: number) => {
    setMoving(true)
    try {
      // Host reassigning another player's team — authorized by hostToken, not the host's own token.
      await post('team', { hostToken, playerId, team })
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
      await post('balance', { hostToken })
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to balance teams')
    } finally {
      setBalancing(false)
    }
  }

  const advanceTurn = async () => {
    setAdvancing(true)
    try {
      await post('advance', { hostToken })
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to advance')
    } finally {
      setAdvancing(false)
    }
  }

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
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
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
      if (data.game) setGame(data.game)
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const { secondsLeft, breakLeft, urgent } = useDescribeItTimer(gameCode, session, game?.status === 'active')
  const hostTeam = teamRows.find((r) => r.player_id === hostPlayerId)?.team ?? null
  useDescribeItSounds({
    session,
    words,
    myTeam: hostTeam,
    myPlayerId: hostPlayerId,
    enabled: hostMode === 'player' && !!hostPlayerId && game?.status === 'active',
  })

  const gameFinished = isDescribeItResultsPhase(game?.status, session)

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (gameFinished) setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [gameFinished, game?.status])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }
  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
      </div>
    )
  }

  const mode = clampDescribeItMode(game.describe_it_mode)
  const isIndividual = mode === 'individual'
  const numTeams = clampDescribeItTeams(game.describe_it_num_teams)
  const teamPlain = teamRows.map((r) => ({ player_id: r.player_id, team: r.team, score: r.score }))
  const playerScores = teamRows.map((r) => ({ player_id: r.player_id, score: r.score }))
  const ready = describeItLobbyReady(teamPlain, numTeams)
  // Biggest team — everyone describes only if there are at least this many rounds.
  const biggestTeamSize = Math.max(
    0,
    ...Array.from({ length: numTeams }, (_, i) => teamPlain.filter((r) => r.team === i + 1).length)
  )
  const currentRounds = clampDescribeItRounds(game.rounds_count)
  const readyPlayers = players.filter((p) => p.spectator !== true)
  const minPlayers = isIndividual ? DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL : DESCRIBE_IT_MIN_PLAYERS
  const canStart = readyPlayers.length >= minPlayers && (isIndividual || ready.ok)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showTabs = !gameFinished
  const gameStarted = game.status === 'active' && !gameFinished
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab (Play): interactive panel for a host-player.
  const interactivePlay = session && (
    <DescribeItPlayPanel
      session={session}
      players={players}
      teamRows={teamPlain}
      words={words}
      guesses={guesses}
      myPlayerId={hostPlayerId}
      secondsLeft={secondsLeft}
      breakLeft={breakLeft}
      urgent={urgent}
      onClue={(clue) => void sendAction('clue', { clue })}
      onGuess={(text) => void sendAction('guess', { text })}
      onSkip={() => void sendAction('skip', {})}
      acting={acting}
    />
  )

  // Primary tab (Watch): read-only gameplay for a host-only host.
  const watchRound = game.status === 'active' && !gameFinished && session && (
    <DescribeItPlayPanel
      session={session}
      players={players}
      teamRows={teamPlain}
      words={words}
      guesses={guesses}
      myPlayerId={null}
      secondsLeft={secondsLeft}
      breakLeft={breakLeft}
      urgent={urgent}
    />
  )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
        <HostModeSelector
          mode={hostMode}
          onChange={changeHostMode}
          joinedPlayerId={hostPlayerId}
          joinedPlayerName={hostPlayerName}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — play from the Play tab once you
              start.
            </p>
          }
        />
      )}
      {!gameFinished && <HostRulesRow gameType="describe_it" />}

      {game.status === 'active' && !gameFinished && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          highlightPlayerId={hostPlayerId}
        />
      )}

      {game.status === 'active' && !gameFinished && session && (
        <>
          {/* Host-player gets the scoreboard here (Play tab has the full game). Spectator
              hosts watch from the Watch tab — Manage only carries controls. */}
          {hostPlays &&
            (isIndividual ? (
              <DescribeItPlayerScoreboard
                leaderboard={describeItIndividualLeaderboard(teamPlain, players)}
                describerId={session.describer_player_id}
                myPlayerId={hostPlayerId}
                round={session.current_round}
                totalRounds={session.total_rounds}
              />
            ) : (
              <DescribeItScoreboard
                scores={computeDescribeItScores(words, numTeams)}
                activeTeam={session.active_team}
                myTeam={hostTeam}
                round={session.current_round}
                totalRounds={session.total_rounds}
              />
            ))}
          {session.phase === 'break' && (
            <button type="button" onClick={advanceTurn} disabled={advancing} className="btn-primary w-full py-2.5">
              {advancing ? 'Starting…' : isIndividual ? 'Next describer now →' : 'Next team now →'}
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
        </>
      )}

      {game.status === 'waiting' && (
        <>
          <DescribeItCard className="p-4 space-y-3">
            <p className="text-sm font-bold">Game settings</p>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-faint">Mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void saveSettings({ mode: 'team' })}
                  className={[
                    'rounded-xl border-2 px-3 py-2.5 text-left',
                    !isIndividual
                      ? 'border-[var(--primary)]/60 bg-[var(--primary)]/10'
                      : 'border-[var(--border-strong)] text-muted',
                  ].join(' ')}
                >
                  <span className="font-bold block text-sm">Teams</span>
                  <span className="text-faint text-[11px]">Teams race for words</span>
                </button>
                <button
                  type="button"
                  onClick={() => void saveSettings({ mode: 'individual' })}
                  className={[
                    'rounded-xl border-2 px-3 py-2.5 text-left',
                    isIndividual
                      ? 'border-[var(--primary)]/60 bg-[var(--primary)]/10'
                      : 'border-[var(--border-strong)] text-muted',
                  ].join(' ')}
                >
                  <span className="font-bold block text-sm">Individual</span>
                  <span className="text-faint text-[11px]">Solo — fastest guess wins</span>
                </button>
              </div>
              {isIndividual && (
                <div className="text-faint text-[11px] space-y-1">
                  <p>
                    Everyone takes turns describing one word; guessers score by speed and the describer earns the same
                    points their guessers do — so describing and guessing are worth the same.
                  </p>
                  <p
                    className={readyPlayers.length * currentRounds > 40 ? 'text-amber-400 font-semibold' : 'text-faint'}
                  >
                    Every player describes once per round, so {readyPlayers.length}{' '}
                    {readyPlayers.length === 1 ? 'player' : 'players'} × {currentRounds}{' '}
                    {currentRounds === 1 ? 'round' : 'rounds'} = {readyPlayers.length * currentRounds} turns.
                    {readyPlayers.length * currentRounds > 40 ? ' That’s a long game — try fewer rounds.' : ''}
                  </p>
                </div>
              )}
            </div>
            {!isIndividual && biggestTeamSize > currentRounds && (
              <p className="text-amber-400 text-xs">
                A new teammate describes each round. Your biggest team has {biggestTeamSize} players — pick{' '}
                {biggestTeamSize}+ rounds so everyone gets a turn to describe.
              </p>
            )}
            <div className={`grid gap-2 ${isIndividual ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {!isIndividual && (
                <label className="text-xs font-semibold text-faint space-y-1">
                  <span>Teams</span>
                  <select
                    value={numTeams}
                    onChange={(e) => void saveSettings({ numTeams: Number(e.target.value) })}
                    className="input-field w-full text-sm"
                  >
                    {DESCRIBE_IT_TEAM_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold text-faint space-y-1">
                <span>Rounds</span>
                <select
                  value={clampDescribeItRounds(game.rounds_count)}
                  onChange={(e) => void saveSettings({ rounds: Number(e.target.value) })}
                  className="input-field w-full text-sm"
                >
                  {DESCRIBE_IT_ROUND_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-faint space-y-1">
                <span>Turn</span>
                <select
                  value={game.timer_seconds}
                  onChange={(e) => void saveSettings({ turnSeconds: Number(e.target.value) })}
                  className="input-field w-full text-sm"
                >
                  {DESCRIBE_IT_TURN_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n === 60 ? '1m' : n === 120 ? '2m' : `${n}s`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-xs font-semibold text-faint space-y-1 block">
              <span>Max players</span>
              <select
                value={clampDescribeItMaxPlayers(game.max_players ?? DESCRIBE_IT_DEFAULT_MAX_PLAYERS)}
                onChange={(e) => void saveSettings({ maxPlayers: Number(e.target.value) })}
                className="input-field w-full text-sm"
              >
                {DESCRIBE_IT_MAX_PLAYER_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint">Words</p>
              <SegmentedControl
                value={wordSource}
                onChange={(v) => {
                  const next = v as 'platform' | 'library' | 'custom'
                  setWordSource(next)
                  setWordsUploadError(null)
                  if (next === 'platform') {
                    setWordsDraft('')
                    void saveSettings({ words: '' })
                  }
                }}
                options={[
                  { value: 'platform', label: 'Platform', hint: 'Use our built-in word bank.' },
                  { value: 'library', label: 'Library', hint: 'Pick a community word pack.' },
                  { value: 'custom', label: 'Your own', hint: 'Add your own words or upload a file.' },
                ]}
              />

              <p className="text-faint text-[11px]">
                Words that haven&apos;t been used yet are picked first — Play Again avoids repeats until the list runs
                out.
              </p>

              {wordSource === 'platform' && (
                <p className="text-faint text-[11px]">Using our built-in word bank — no upload needed.</p>
              )}

              {wordSource === 'library' && (
                <div className="surface-inset border border-theme rounded-xl p-3 space-y-2">
                  <LibraryPackBrowser
                    gameType="describe_it"
                    noun="words"
                    onPick={async (questions) => {
                      setWordsUploadError(null)
                      const incoming = parseStoredDescribeItWords(questions)
                      if (incoming.length === 0) return
                      const saved = await saveSettings({ words: incoming.join('\n') })
                      if (saved) {
                        setWordsDraft(incoming.join('\n'))
                        setWordSource('custom')
                      } else {
                        setWordsUploadError('Could not save the imported words. Please try again.')
                      }
                    }}
                  />
                  <p className="text-faint text-[11px]">Picking a pack replaces your word list.</p>
                </div>
              )}

              {wordSource === 'custom' && (
                <div className="space-y-2">
                  <p className="label-caps">Your words</p>
                  {parseDescribeItWords(wordsDraft).length > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ {parseDescribeItWords(wordsDraft).length} words already loaded — kept (unused first) unless you
                      replace them below.
                    </p>
                  )}
                  <p className="text-faint text-[11px]">{questionUploadHint('describe_it')}</p>
                  <a
                    href={questionSampleFile('describe_it').href}
                    download={questionSampleFile('describe_it').download}
                    className="inline-block text-sm text-[var(--primary)] underline"
                  >
                    Download sample CSV
                  </a>

                  <SegmentedControl
                    value={wordTab}
                    onChange={(v) => setWordTab(v as 'upload' | 'paste')}
                    options={[
                      { value: 'upload', label: 'Upload file' },
                      { value: 'paste', label: 'Paste' },
                    ]}
                  />

                  {wordTab === 'upload' ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => wordsFileRef.current?.click()}
                        className="btn-secondary w-full py-3 text-sm"
                      >
                        Choose CSV or Excel file
                      </button>
                      <p className="text-faint text-[11px]">Uploading a file replaces the current list.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={wordsDraft}
                        onChange={(e) => setWordsDraft(e.target.value)}
                        placeholder="pizza&#10;rainbow&#10;astronaut"
                        rows={3}
                        className="input-field w-full resize-y text-sm"
                      />
                      <button
                        type="button"
                        onClick={saveWords}
                        disabled={savingWords}
                        className="btn-secondary w-full py-2.5 text-sm"
                      >
                        {savingWords ? 'Saving…' : 'Save words'}
                      </button>
                    </div>
                  )}

                  <input
                    ref={wordsFileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      setWordsUploadError(null)
                      const ext = file.name.split('.').pop()?.toLowerCase()
                      try {
                        const rows =
                          ext === 'csv'
                            ? parseDescribeItWords(await file.text())
                            : ext === 'xlsx' || ext === 'xls'
                              ? await parseExcelDescribeItWords(await file.arrayBuffer())
                              : []
                        if (rows.length === 0) {
                          setWordsUploadError('No words found. Use one word per row.')
                          return
                        }
                        const next = rows
                        // Only commit the preview once the words actually persist, so the
                        // loaded list never implies a pool the backend didn't save.
                        const saved = await saveSettings({ words: next.join('\n') })
                        if (saved) setWordsDraft(next.join('\n'))
                        else setWordsUploadError('Could not save the imported words. Please try again.')
                      } catch {
                        setWordsUploadError('Could not read that file. Try a .csv or .xlsx.')
                      }
                    }}
                  />
                  {wordsUploadError && <p className="text-rose-400 text-xs">{wordsUploadError}</p>}
                  {parseDescribeItWords(wordsDraft).length > 0 && (
                    <div className="surface-inset border border-theme rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
                      <p className="text-muted text-xs uppercase tracking-wider">
                        Loaded ({parseDescribeItWords(wordsDraft).length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {parseDescribeItWords(wordsDraft).map((w, i) => (
                          <span
                            key={`${w}-${i}`}
                            className="inline-flex items-center gap-1 rounded-md border border-theme bg-[var(--surface-inset-bg)] px-2 py-1 text-xs"
                          >
                            {w}
                            <button
                              type="button"
                              onClick={() =>
                                setWordsDraft(
                                  parseDescribeItWords(wordsDraft)
                                    .filter((_, idx) => idx !== i)
                                    .join('\n')
                                )
                              }
                              className="text-faint hover:text-red-300"
                              aria-label={`Remove ${w}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="pt-1 border-t border-[var(--border)]">
              <HostAllowViewersField gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
            </div>
          </DescribeItCard>

          {isIndividual ? (
            <DescribeItCard className="p-4 space-y-2 text-center">
              <p className="text-sm font-bold">Everyone plays solo 🏆</p>
              <p className="text-faint text-xs">
                No teams — players take turns describing and race to guess. Need at least{' '}
                {DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL} players. See the full list below.
              </p>
              <p>
                <GameRulesLink gameType="describe_it" variant="subtle" />
              </p>
            </DescribeItCard>
          ) : (
            <DescribeItCard className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Teams ({numTeams})</p>
                <button
                  type="button"
                  onClick={balanceTeams}
                  disabled={balancing}
                  className="text-xs font-bold rounded-lg border border-[var(--border-strong)] px-3 py-1.5 hover:bg-[var(--primary)]/10"
                >
                  {balancing ? 'Balancing…' : 'Auto-balance'}
                </button>
              </div>
              <DescribeItTeamRoster
                numTeams={numTeams}
                teamRows={teamPlain}
                players={players}
                myPlayerId={hostPlays ? hostPlayerId : null}
                onPick={hostPlays ? pickTeam : undefined}
                picking={picking}
                onMoveTeam={moveTeam}
                moving={moving}
              />
              <p className="text-faint text-[11px] text-center">Tap a colored number to move a player to that team.</p>
              {!ready.ok && <p className="text-amber-400 text-xs text-center">{ready.error}</p>}
              <p className="text-center">
                <GameRulesLink gameType="describe_it" variant="subtle" />
              </p>
            </DescribeItCard>
          )}

          <HostLobbyPlayersSection
            players={players}
            removingPlayerId={removingPlayerId}
            onRemovePlayer={removePlayer}
            highlightPlayerId={hostPlayerId}
            alwaysShowReady
          />

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
                : readyPlayers.length < DESCRIBE_IT_MIN_PLAYERS
                  ? `Need at least ${DESCRIBE_IT_MIN_PLAYERS} players (${readyPlayers.length})`
                  : (ready.error ?? 'Every team needs at least 2 players')
            }
            className="space-y-3"
          />
        </>
      )}
    </div>
  )

  // Individual mode only — team mode has no single-player winner.
  const hostIndividualLb = isIndividual ? describeItIndividualLeaderboard(playerScores, players) : []
  const hostDescRow = hostIndividualLb.find((row) => row.id === hostPlayerId)
  const hostWonDescribe =
    !!hostDescRow &&
    hostIndividualLb[0] != null &&
    hostDescRow.score === hostIndividualLb[0].score &&
    hostIndividualLb[0].score > 0

  const finished = gameFinished && (
    <>
      <DescribeItFinalResultsShareBlock
        game={game}
        players={players}
        words={words}
        numTeams={numTeams}
        mode={mode}
        playerScores={playerScores}
        playAgainButton={
          <DescribeItPrimaryButton onClick={playAgain} loading={playingAgain}>
            Play again
          </DescribeItPrimaryButton>
        }
      />
      {hostWonDescribe && (
        <PostWinToCommunity
          gameType="describe_it"
          gameCode={gameCode}
          winnerName={hostDescRow?.name ?? ''}
          roundKey={session?.id}
        />
      )}
    </>
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={gameFinished ? 'finished' : game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={gameFinished ? undefined : <HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={finished}
    />
  )
}
