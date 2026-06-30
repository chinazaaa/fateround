'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { ExitIcon } from '@/components/host/host-icons'
import { HostWordHuntLobbyPanel } from '@/components/host-lobby/HostWordHuntLobbyPanel'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { WordHuntBoard } from '@/components/word-hunt/WordHuntBoard'
import { WordHuntPlayerView } from '@/components/word-hunt/WordHuntPlayerView'
import { WordHuntFinalResultsShareBlock } from '@/components/word-hunt/WordHuntFinalResultsShareBlock'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { parseWordHuntMetadata, tallyWordHuntScores, WORD_HUNT_MIN_PLAYERS } from '@/lib/word-hunt'
import { validWordsSetFromMetadata } from '@/lib/word-hunt-client'
import { useWordHuntGameTimer } from '@/hooks/useWordHuntGameTimer'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player } from '@/types'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useToast } from '@/components/ui/Toast'

const WORD_HUNT_SUBMISSION_SELECT = 'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

type WordHuntHostMode = 'spectator' | 'player'
type HostTab = 'manage' | 'play'

const HOST_MODE_KEY = (code: string) => `word_hunt_host_mode_${code.toUpperCase()}`

function getWordHuntHostMode(gameCode: string): WordHuntHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(HOST_MODE_KEY(gameCode)) as WordHuntHostMode) ?? 'spectator'
}
function setWordHuntHostMode(gameCode: string, mode: WordHuntHostMode) {
  localStorage.setItem(HOST_MODE_KEY(gameCode), mode)
}

interface WordHuntSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word: string
  path: number[]
  points_awarded: number
  submitted_at: string
}

export function WordHuntHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [validWords, setValidWords] = useState<string[]>([])
  const [submissions, setSubmissions] = useState<WordHuntSubmission[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)

  const [hostMode, setHostModeState] = useState<WordHuntHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) return
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (gameData.status === 'active') {
      const { data: roundData } = await supabase
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        const meta = parseWordHuntMetadata((roundData as Record<string, unknown>).word_hunt_metadata)
        if (meta) {
          setGrid(meta.grid)
          setValidWords(Array.from(validWordsSetFromMetadata(meta.valid_words)))
        }
        setRoundId(roundData.id as string)

        const { data: subs } = await supabase
          .from('word_hunt_submissions')
          .select(WORD_HUNT_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        setSubmissions((subs ?? []) as WordHuntSubmission[])
      }
    } else if (gameData.status === 'finished') {
      const [{ data: subs }, { data: roundData }] = await Promise.all([
        supabase.from('word_hunt_submissions').select(WORD_HUNT_SUBMISSION_SELECT).eq('game_id', gameCode),
        supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).eq('round_number', 1).maybeSingle(),
      ])
      setSubmissions((subs ?? []) as WordHuntSubmission[])
      if (roundData) {
        const meta = parseWordHuntMetadata((roundData as Record<string, unknown>).word_hunt_metadata)
        if (meta) {
          setGrid(meta.grid)
          setValidWords(Array.from(validWordsSetFromMetadata(meta.valid_words)))
        }
      }
    }
  }, [gameCode])

  const { label: timeLabel, timeUp, secondsLeft } = useWordHuntGameTimer(gameCode, game, load)

  const { removingPlayerId, removePlayer } = useHostRemovePlayer(gameCode, hostToken, async (playerId) => {
    if (playerId === hostPlayerId) {
      clearPlayerSession(gameCode)
      setHostPlayerId(null)
      setHostPlayerName('')
      setHostJoinName('')
    }
    await load()
  })

  useEffect(() => {
    load()
    setHostModeState(getWordHuntHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  useEffect(() => {
    const ch = supabase
      .channel(`word_hunt_host_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (!roundId) return
    const ch = supabase
      .channel(`word_hunt_host_subs_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_hunt_submissions', filter: `round_id=eq.${roundId}` },
        (payload) => {
          setSubmissions((prev) => {
            const exists = prev.some((s) => s.id === (payload.new as WordHuntSubmission).id)
            return exists ? prev : [...prev, payload.new as WordHuntSubmission]
          })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  useEffect(() => {
    const ch = supabase
      .channel(`word_hunt_host_players_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => {
          supabase
            .from('players')
            .select(PLAYER_SELECT)
            .eq('game_id', gameCode)
            .order('joined_at')
            .then(({ data }) => {
              if (data) setPlayers(data as Player[])
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode])

  const changeHostMode = (mode: WordHuntHostMode) => {
    if (game?.status !== 'waiting') return
    setHostModeState(mode)
    setWordHuntHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
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
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  async function startGame() {
    if (starting) return
    if (hostMode === 'player' && !hostPlayerId) {
      toastError('Join with your name before starting (Host + play mode)')
      return
    }
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        toastError(d.error || 'Failed to start')
        return
      }
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } finally {
      setStarting(false)
    }
  }

  async function handlePlayAgain() {
    if (playingAgain) return
    setPlayingAgain(true)
    const keepHostSession = hostMode === 'player' && hostPlayerId && hostPlayerName
    const savedPlayerId = hostPlayerId
    const savedPlayerName = hostPlayerName
    const savedSession = getPlayerSession(gameCode)

    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toastError(data.error ?? 'Failed to reset game')
        return
      }

      if (keepHostSession && savedPlayerId && savedPlayerName) {
        setPlayerSession(
          gameCode,
          savedPlayerId,
          savedPlayerName,
          savedSession?.playerGender ?? 'both',
          savedSession?.resumeToken ?? null
        )
        setHostPlayerId(savedPlayerId)
        setHostPlayerName(savedPlayerName)
      } else {
        clearPlayerSession(gameCode)
        setHostPlayerId(null)
        setHostPlayerName('')
        setHostJoinName('')
      }
      setTab('manage')
      await load()
    } finally {
      setPlayingAgain(false)
    }
  }

  const leaderboard = tallyWordHuntScores(submissions, players)
  const hostMySubmissions = hostPlayerId
    ? submissions.filter((submission) => submission.player_id === hostPlayerId)
    : undefined
  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length >= WORD_HUNT_MIN_PLAYERS
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const totalWords = submissions.length

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive play for a host-player.
  const interactivePlay = <WordHuntPlayerView gameCode={gameCode} />

  // Primary tab (host-only): read-only live board, progress, and leaderboard.
  const watchRound = game.status === 'active' && (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Words found</p>
          <p className="text-2xl font-black">{totalWords}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Time left</p>
          <p
            className={`text-xl font-black tabular-nums ${timeUp ? 'text-[var(--kill)]' : secondsLeft <= 10 ? 'text-[var(--marry)]' : 'text-[var(--primary)]'}`}
          >
            {timeLabel}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {grid && <WordHuntBoard grid={grid} selectedPath={[]} onPathChange={() => {}} disabled />}

        <div className="space-y-3">
          <p className="label-caps text-xs">Live scores</p>
          {leaderboard.map((row, i) => (
            <div key={row.player_id} className="glass-card px-3 py-2 flex items-center justify-between">
              <span className="text-sm font-medium">
                {i + 1}. {row.name}
              </span>
              <span className="text-sm font-bold">
                {row.points} pts · {row.word_count}w
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
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
      {game.status !== 'finished' && <HostRulesRow gameType="word_hunt" />}

      {game.status === 'active' && (
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

      {game.status === 'waiting' && (
        <>
          <HostWordHuntLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={players.length}
            onGameUpdate={setGame}
          />
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={() => void startGame()}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startLabel="Start hunt"
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${WORD_HUNT_MIN_PLAYERS} players to start (${readyPlayers.length}/${WORD_HUNT_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        </>
      )}

      {game.status === 'active' && (
        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={load}
          label="End game"
          icon={<ExitIcon size={16} />}
          confirmTitle="End this hunt early?"
          confirmMessage="The round will end and players will see the final scores."
          className="btn-danger-soft"
        />
      )}
    </div>
  )

  const finished = (
    <WordHuntFinalResultsShareBlock
      game={game}
      players={players}
      leaderboard={leaderboard}
      highlightPlayerId={hostPlayerId}
      mySubmissions={hostMySubmissions}
      allSubmissions={submissions}
      validWords={validWords.length > 0 ? validWords : undefined}
      playAgainButton={
        <button
          type="button"
          onClick={() => void handlePlayAgain()}
          disabled={playingAgain}
          className="btn-primary w-full py-3 font-bold"
        >
          {playingAgain ? 'Resetting…' : 'Play again'}
        </button>
      }
    />
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={finished}
    />
  )
}
