'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { WordHuntPlaySurface } from '@/components/word-hunt/WordHuntPlaySurface'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import {
  parseWordHuntMetadata,
  tallyWordHuntScores,
  WORD_HUNT_MIN_WORD_LENGTH,
} from '@/lib/word-hunt'
import { useWordHuntGameTimer } from '@/hooks/useWordHuntGameTimer'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { resolvePlayerSession } from '@/lib/player-resume'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { preJoinScreen } from '@/lib/viewers'
import { clearPlayerSession, setPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player } from '@/types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const WORD_HUNT_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

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

type View =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'

export function WordHuntPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError } = useToast()
  const cfg = gameTypeConfig('word_hunt')
  const [view, setView] = useState<View>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [submissions, setSubmissions] = useState<WordHuntSubmission[]>([])
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const { label: timeLabel, timeUp, secondsLeft } = useWordHuntGameTimer(gameCode, game)

  useLobbyOpenNotification(game?.status, () => void load())

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const syncView = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setView('game_started_waiting')
        return
      }
      if (pre === 'game_ended') {
        setView('game_ended')
        return
      }
      setView('join')
      return
    }
    if (gameData.status === 'waiting') {
      setView('waiting')
      return
    }
    if (gameData.status === 'finished') {
      setView('finished')
      return
    }
    setView('playing')
  }, [])

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) {
      setView('not_found')
      return
    }

    const plrs = (playersData ?? []) as Player[]
    setGame(gameData as Game)
    setPlayers(plrs)

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
    } else {
      setMyPlayerId(null)
      setMyPlayerName('')
    }

    if (gameData.status === 'finished' && playerId) {
      const { data: subs } = await supabase
        .from('word_hunt_submissions')
        .select(WORD_HUNT_SUBMISSION_SELECT)
        .eq('game_id', gameCode)
      setSubmissions((subs ?? []) as WordHuntSubmission[])
      setView('finished')
      return
    }

    if (gameData.status === 'active' && playerId) {
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
          setRoundId(roundData.id as string)

          const { data: subs } = await supabase
            .from('word_hunt_submissions')
            .select(WORD_HUNT_SUBMISSION_SELECT)
            .eq('round_id', roundData.id)
          setSubmissions((subs ?? []) as WordHuntSubmission[])
        }
      }
    } else {
      setGrid(null)
      setRoundId(null)
      setSubmissions([])
    }

    syncView(gameData as Game, playerId)
  }, [gameCode, syncView])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`word_hunt_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          void load()
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
      .channel(`word_hunt_subs_${roundId}`)
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
      .channel(`word_hunt_players_${gameCode}`)
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

  async function joinGame() {
    if (!joinName.trim() || joining) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: joinName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toastError(json.error ?? 'Failed to join')
        return
      }
      setPlayerSession(gameCode, json.playerId, json.playerName, json.playerGender ?? 'no_pref', json.resumeToken ?? null)
      setMyPlayerId(json.playerId)
      setMyPlayerName(json.playerName)
      await load()
    } finally {
      setJoining(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName('')
    void load()
  }

  async function handleSubmitWord() {
    if (!myPlayerId || !roundId || submitting || timeUp || selectedPath.length < WORD_HUNT_MIN_WORD_LENGTH) return

    const word = selectedPath
      .map((i) => {
        const row = Math.floor(i / 4)
        const col = i % 4
        return grid?.[row]?.[col] ?? ''
      })
      .join('')

    setSubmitting(true)
    try {
      const res = await fetch('/api/word-hunt/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, word, path: selectedPath }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast(json.error ?? 'Invalid word', false)
      } else {
        showToast(`+${json.pointsAwarded} pts — ${json.word}`, true)
        setSelectedPath([])
      }
    } finally {
      setSubmitting(false)
    }
  }

  const mySubmissions = myPlayerId ? submissions.filter((s) => s.player_id === myPlayerId) : []
  const myFoundWords = mySubmissions.map((s) => s.word)
  const myPoints = mySubmissions.reduce((sum, s) => sum + s.points_awarded, 0)
  const leaderboard = tallyWordHuntScores(submissions, players)
  const me = players.find((p) => p.id === myPlayerId)
  const isSpectator = me?.spectator === true
  const displayName = myPlayerName || me?.name || 'Player'

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (view === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
      </div>
    )
  }

  if (view === 'join') {
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="word_hunt"
            subtitle={cfg.tagline}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void joinGame()}
          joining={joining}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="word_hunt" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (view === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (view === 'waiting') {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={displayName}
          onRenamed={(name) => {
            setMyPlayerName(name)
            void load()
          }}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          description="Find words on the letter grid before time runs out."
          rulesLink={<GameRulesLink gameType="word_hunt" variant="subtle" />}
          isSpectator={isSpectator}
          onReady={async () => {
            if (!myPlayerId) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'finished') {
    return (
      <div className="min-h-screen flex flex-col">
        <GamePlayerChrome />
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">
          <div className="glass-card-strong p-8 text-center space-y-2">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-black">Time&apos;s up!</p>
            {leaderboard[0] && (
              <p className="text-muted text-base">
                {leaderboard[0].name} wins with {leaderboard[0].points} pts
              </p>
            )}
          </div>
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={leaderboard.map((row, i) => ({
              id: row.player_id,
              name: row.name,
              score: row.points,
              rank: i + 1,
            }))}
            highlightId={myPlayerId ?? undefined}
            scoreLabel={(n) => `${n} pts`}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <GamePlayerChrome />
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-[var(--primary)] text-white' : 'bg-[var(--kill)] text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4">
        {grid && (
          <WordHuntPlaySurface
            grid={grid}
            selectedPath={selectedPath}
            onPathChange={setSelectedPath}
            foundWords={myFoundWords}
            myPoints={myPoints}
            timeLabel={timeLabel}
            timeUp={timeUp}
            secondsLeft={secondsLeft}
            onClear={() => setSelectedPath([])}
            onSubmit={() => void handleSubmitWord()}
            submitting={submitting}
            disabled={timeUp || isSpectator}
          />
        )}

        <details className="glass-card p-4 group open:pb-4">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <div>
              <p className="label-caps text-xs">Live standings</p>
              <p className="text-faint text-[11px] mt-0.5 group-open:hidden">See who&apos;s ahead</p>
            </div>
            <span className="text-muted text-lg leading-none group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-[var(--border-strong)] pt-3">
            {leaderboard.slice(0, 8).map((row, i) => (
              <div
                key={row.player_id}
                className={`flex items-center justify-between text-sm ${row.player_id === myPlayerId ? 'font-bold text-[var(--foreground)]' : 'text-muted'}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-faint tabular-nums shrink-0">{i + 1}</span>
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-xs">
                  {row.points} pts · {row.word_count}w
                </span>
              </div>
            ))}
          </div>
        </details>
      </main>
    </div>
  )
}
