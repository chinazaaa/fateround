'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { WordHuntPlaySurface } from '@/components/word-hunt/WordHuntPlaySurface'
import { WordHuntFinalResultsShareBlock } from '@/components/word-hunt/WordHuntFinalResultsShareBlock'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { gameTypeConfig } from '@/lib/game-types'
import { parseWordHuntMetadata, tallyWordHuntScores, wordHuntPoints, WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'
import { validateWordHuntSubmissionClient, validWordsSetFromMetadata } from '@/lib/word-hunt-client'
import { useWordHuntGameTimer } from '@/hooks/useWordHuntGameTimer'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { resolvePlayerSession } from '@/lib/player-resume'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { clearPlayerSession, setPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player } from '@/types'

const WORD_HUNT_SUBMISSION_SELECT = 'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

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
  | 'late_join_choice'
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
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [validWords, setValidWords] = useState<Set<string>>(new Set())
  const [submissions, setSubmissions] = useState<WordHuntSubmission[]>([])
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const inFlightWordsRef = useRef<Set<string>>(new Set())

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
      if (pre === 'late_join_choice') {
        setView('late_join_choice')
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
      setMyResumeToken(session.resumeToken ?? null)
    } else {
      setMyPlayerId(null)
      setMyPlayerName('')
      setMyResumeToken(null)
    }

    if (gameData.status === 'finished' && playerId) {
      const [{ data: subs }, { data: roundData }] = await Promise.all([
        supabase.from('word_hunt_submissions').select(WORD_HUNT_SUBMISSION_SELECT).eq('game_id', gameCode),
        supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).eq('round_number', 1).maybeSingle(),
      ])
      setSubmissions((subs ?? []) as WordHuntSubmission[])
      if (roundData) {
        const meta = parseWordHuntMetadata((roundData as Record<string, unknown>).word_hunt_metadata)
        if (meta) {
          setGrid(meta.grid)
          setValidWords(validWordsSetFromMetadata(meta.valid_words))
        }
      }
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
          setValidWords(validWordsSetFromMetadata(meta.valid_words))
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
      setValidWords(new Set())
      setRoundId(null)
      setSubmissions([])
    }

    syncView(gameData as Game, playerId)
  }, [gameCode, syncView])

  const { label: timeLabel, timeUp, secondsLeft } = useWordHuntGameTimer(gameCode, game, load)

  useLobbyOpenNotification(game?.status, () => {
    if (view === 'finished' || view === 'game_started_waiting' || view === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    view === 'late_join_choice',
    secondsLeft
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && view === 'playing',
    secondsLeft
  )

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
            const incoming = payload.new as WordHuntSubmission
            const exists = prev.some(
              (submission) =>
                submission.id === incoming.id ||
                (submission.player_id === incoming.player_id && submission.word === incoming.word)
            )
            return exists ? prev : [...prev, incoming]
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

  const joinGame = useCallback(
    async (opts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer } : {}),
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          toastError(json.error ?? 'Failed to join')
          return
        }
        setPlayerSession(
          gameCode,
          json.playerId,
          json.playerName,
          json.playerGender ?? 'no_pref',
          json.resumeToken ?? null
        )
        setMyPlayerId(json.playerId)
        setMyPlayerName(json.playerName)
        setMyResumeToken(json.resumeToken ?? null)
        await load()
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, load, toastError]
  )

  useRoomMemberAutoJoin({
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen: view,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => joinGame({ name }),
  })

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName('')
    void load()
  }

  const handleSubmitWord = useCallback(
    (pathOverride?: number[]) => {
      const path = pathOverride ?? selectedPath
      if (!myPlayerId || !roundId || !grid || timeUp || path.length < WORD_HUNT_MIN_WORD_LENGTH) return

      if (!myResumeToken) {
        showToast('Reconnecting… try again in a moment', false)
        return
      }

      const foundSet = new Set(submissions.filter((s) => s.player_id === myPlayerId).map((s) => s.word))
      const validation = validateWordHuntSubmissionClient(grid, path, validWords, foundSet)
      if (!validation.ok) {
        showToast(validation.error, false)
        if (validation.clearPath) {
          setSelectedPath([])
        }
        return
      }

      setSelectedPath([])

      if (inFlightWordsRef.current.has(validation.normalized)) return
      inFlightWordsRef.current.add(validation.normalized)

      const pointsAwarded = wordHuntPoints(validation.normalized.length)
      const optimisticId = `pending-${validation.normalized}`

      setSubmissions((prev) => {
        const withoutPending = prev.filter(
          (submission) =>
            submission.id !== optimisticId &&
            !(submission.player_id === myPlayerId && submission.word === validation.normalized)
        )
        return [
          ...withoutPending,
          {
            id: optimisticId,
            game_id: gameCode,
            round_id: roundId,
            player_id: myPlayerId,
            word: validation.normalized,
            path,
            points_awarded: pointsAwarded,
            submitted_at: new Date().toISOString(),
          },
        ]
      })

      void fetch('/api/word-hunt/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          word: validation.normalized,
          path,
        }),
      })
        .then(async (res) => {
          const json = await res.json()
          if (!res.ok) {
            setSubmissions((prev) =>
              prev.filter(
                (submission) =>
                  submission.id !== optimisticId &&
                  !(submission.player_id === myPlayerId && submission.word === validation.normalized)
              )
            )
            showToast(json.error ?? 'Invalid word', false)
            return
          }

          setSubmissions((prev) => {
            const withoutPending = prev.filter((submission) => submission.id !== optimisticId)
            const submissionId = typeof json.submissionId === 'string' ? json.submissionId : optimisticId
            const word = typeof json.word === 'string' ? json.word : validation.normalized
            const alreadyThere = withoutPending.some(
              (submission) =>
                submission.id === submissionId || (submission.player_id === myPlayerId && submission.word === word)
            )
            if (alreadyThere) return withoutPending
            return [
              ...withoutPending,
              {
                id: submissionId,
                game_id: gameCode,
                round_id: roundId,
                player_id: myPlayerId,
                word,
                path,
                points_awarded: json.pointsAwarded ?? pointsAwarded,
                submitted_at: new Date().toISOString(),
              },
            ]
          })
        })
        .catch(() => {
          setSubmissions((prev) =>
            prev.filter(
              (submission) =>
                submission.id !== optimisticId &&
                !(submission.player_id === myPlayerId && submission.word === validation.normalized)
            )
          )
          showToast('Could not submit word — try again', false)
        })
        .finally(() => {
          inFlightWordsRef.current.delete(validation.normalized)
        })
    },
    [gameCode, grid, myPlayerId, myResumeToken, roundId, selectedPath, submissions, timeUp, validWords]
  )

  const mySubmissions = myPlayerId ? submissions.filter((s) => s.player_id === myPlayerId) : []
  const myFoundWords = mySubmissions.map((s) => s.word)
  const myPoints = mySubmissions.reduce((sum, s) => sum + s.points_awarded, 0)
  const leaderboard = tallyWordHuntScores(submissions, players)
  const displayName = myPlayerName || me?.name || 'Player'

  // Viewers watch one player's hunt at a time — the shared grid is static, so the
  // interesting part is seeing a chosen player's words and score fill in live.
  const watchablePlayers = game ? players.filter((p) => !playerIsViewer(p, game)) : []
  const effectiveWatchedId =
    (watchedPlayerId && watchablePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard.find((row) => watchablePlayers.some((p) => p.id === row.player_id))?.player_id ??
    watchablePlayers[0]?.id ??
    null
  const watchedSubmissions = effectiveWatchedId ? submissions.filter((s) => s.player_id === effectiveWatchedId) : []
  const watchedFoundWords = watchedSubmissions.map((s) => s.word)
  const watchedPoints = watchedSubmissions.reduce((sum, s) => sum + s.points_awarded, 0)

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
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

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

  if (view === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={allowLatePlayers(game)}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void joinGame({ joinAsViewer: true })}
        onJoinAsPlayer={() => void joinGame({ joinAsViewer: false })}
      />
    )
  }

  if (view === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (view === 'waiting') {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
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
          isSpectator={isViewer}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'finished' && game) {
    return (
      <div className="min-h-screen flex flex-col">
        <GamePlayerChrome />
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full">
          <WordHuntFinalResultsShareBlock
            game={game}
            players={players}
            leaderboard={leaderboard}
            highlightPlayerId={myPlayerId}
            mySubmissions={mySubmissions}
            allSubmissions={submissions}
            validWords={validWords.size > 0 ? Array.from(validWords) : undefined}
            showCreateNewGame
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
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4 overscroll-none">
        {isViewer && (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
        )}

        {isViewer &&
          (watchablePlayers.length > 0 ? (
            <div className="glass-card p-3 space-y-2">
              <p className="label-caps text-xs">Watching a player&apos;s board</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {watchablePlayers.map((p) => {
                  const active = p.id === effectiveWatchedId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setWatchedPlayerId(p.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        active
                          ? 'bg-[var(--chip-active-bg)] text-[var(--chip-active-text)] border-[var(--chip-active-border)]'
                          : 'bg-[var(--surface-inset-bg)] text-muted border-[var(--border-strong)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="glass-card p-3 text-center text-xs text-muted">
              No players have joined the hunt yet — you&apos;ll see their board here once they do.
            </p>
          ))}

        {grid && (
          <WordHuntPlaySurface
            grid={grid}
            selectedPath={isViewer ? [] : selectedPath}
            onPathChange={setSelectedPath}
            onStrokeEnd={handleSubmitWord}
            foundWords={isViewer ? watchedFoundWords : myFoundWords}
            validWords={validWords}
            myPoints={isViewer ? watchedPoints : myPoints}
            timeLabel={timeLabel}
            timeUp={timeUp}
            secondsLeft={secondsLeft}
            disabled={timeUp || isViewer}
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
