'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { WordleRoomBoard, type WordleRoomGradedGuess } from '@/components/wordle-room/WordleRoomBoard'
import { WordleRoomResults } from '@/components/wordle-room/WordleRoomResults'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { gameTypeConfig } from '@/lib/game-types'
import {
  tallyWordleRoomScores,
  validateWordleRoomGuess,
  WORDLE_ROOM_MIN_PLAYERS,
  wordleRoomWordScore,
  type WordleRoomProgressRow,
  type WordleRoomStandingRow,
} from '@/lib/wordle-room'
import { useWordleRoomGameTimer } from '@/hooks/useWordleRoomGameTimer'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameScores, useGameStats, useRosterBase } from '@/components/roster/RosterDrawerContext'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { PLAYER_SELECT } from '@/lib/supabase-selects'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { clearPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

interface WordleRoomStatus {
  currentWord?: string
  wordLength?: number
  maxAttempts?: number
  word_index?: number
  word_count?: number
  words_solved?: number
  total_guesses?: number
  categoryLabel?: string
  finished?: boolean
  status?: string
  guesses?: { guess: string; state: ('correct' | 'present' | 'absent')[] }[]
}

type Screen =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'

export function WordleRoomPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError } = useToast()
  const cfg = gameTypeConfig('wordle_room')
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const [roundId, setRoundId] = useState<string | null>(null)
  const [currentWord, setCurrentWord] = useState<string | null>(null)
  const [wordLength, setWordLength] = useState(5)
  const [maxAttempts, setMaxAttempts] = useState(6)
  const [wordIndex, setWordIndex] = useState(0)
  const [wordCount, setWordCount] = useState(5)
  const [wordsSolved, setWordsSolved] = useState(0)
  const [totalGuesses, setTotalGuesses] = useState(0)
  const [categoryLabel, setCategoryLabel] = useState('General English')
  const [myFinished, setMyFinished] = useState(false)
  const [guesses, setGuesses] = useState<WordleRoomGradedGuess[]>([])
  const [current, setCurrent] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined)
  const [revealWord, setRevealWord] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [progressRows, setProgressRows] = useState<WordleRoomProgressRow[]>([])
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const submitLockRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    return { state: null, ok: true }
  }, [])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      if (pre === 'late_join_choice') return 'late_join_choice'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const {
    screen,
    game,
    setGame,
    players,
    setPlayers,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  // Server truth for the current word + my progress on it. Also returns my graded guesses
  // for the current word, so a refresh or second device restores the tiles.
  const fetchStatus = useCallback(async () => {
    if (!myResumeToken) return
    const res = await fetch('/api/wordle-room/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
    })
    if (!res.ok) return
    const data = (await res.json()) as WordleRoomStatus
    if (data.currentWord) {
      setCurrentWord(data.currentWord)
      setWordLength(data.wordLength ?? data.currentWord.length)
      setMaxAttempts(data.maxAttempts ?? data.currentWord.length + 1)
      setWordIndex(data.word_index ?? 0)
      setWordCount(data.word_count ?? 5)
      setWordsSolved(data.words_solved ?? 0)
      setTotalGuesses(data.total_guesses ?? 0)
      setCategoryLabel(data.categoryLabel ?? 'General English')
      setMyFinished(data.finished === true)
      setGuesses((data.guesses ?? []).map((g) => ({ word: g.guess, states: g.state })))
      setCurrent('')
      setSelectedIndex(undefined)
      setRevealWord('')
    }
    if (data.status === 'finished') void load()
  }, [gameCode, myResumeToken, load])

  // Advance to the next word after the solve/loss reveal settles.
  const scheduleAdvance = useCallback(
    (delayMs: number) => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = setTimeout(() => {
        void fetchStatus()
      }, delayMs)
    },
    [fetchStatus]
  )

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [])

  // Resolve the round id so progress standings can be filtered by it.
  const loadRoundId = useCallback(async () => {
    const { data } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameCode)
      .eq('round_number', 1)
      .maybeSingle()
    if (data) setRoundId(data.id as string)
  }, [gameCode])

  const loadProgress = useCallback(async () => {
    if (!roundId) return
    const [{ data: progData }, { data: guessData }] = await Promise.all([
      supabase.from('wordle_room_progress').select('*').eq('game_id', gameCode).eq('round_id', roundId),
      supabase
        .from('wordle_room_guesses')
        .select('player_id, points_awarded')
        .eq('game_id', gameCode)
        .eq('round_id', roundId),
    ])
    if (progData) {
      const scoreMap: Record<string, number> = {}
      if (guessData) {
        for (const g of guessData) {
          scoreMap[g.player_id] = (scoreMap[g.player_id] ?? 0) + (g.points_awarded ?? 0)
        }
      }
      setProgressRows(
        (progData as WordleRoomProgressRow[]).map((p) => ({
          ...p,
          total_score: scoreMap[p.player_id] ?? 0,
        }))
      )
    }
  }, [gameCode, roundId])

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  useTurnNotifications({ status: game?.status })

  const { label: timeLabel, timeUp, secondsLeft } = useWordleRoomGameTimer(gameCode, game, () => void load())

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const router = useRouter()

  // Fetch the current word once the player is resolved and the room is live (or finished).
  useEffect(() => {
    if (!myResumeToken) return
    if (game?.status !== 'active' && game?.status !== 'finished') return
    void fetchStatus()
  }, [myResumeToken, game?.status, fetchStatus])

  useEffect(() => {
    if (game?.status !== 'active' && game?.status !== 'finished') return
    void loadRoundId()
  }, [game?.status, loadRoundId])

  useEffect(() => {
    if (!roundId) return
    void loadProgress()
  }, [roundId, loadProgress])

  // Realtime standings: progress rows + players both refresh live. My own row's update
  // re-syncs the current word (handles a second device or a missed transition).
  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_progress_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wordle_room_progress', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          void loadProgress()
          const row = payload.new as Partial<WordleRoomProgressRow>
          if (row.player_id === myPlayerId) void fetchStatus()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, myPlayerId, loadProgress, fetchStatus])

  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_game_${gameCode}`)
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
  }, [gameCode, load, setGame])

  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_players_${gameCode}`)
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
              if (data) setPlayers(data)
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, setPlayers])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: () => void load() })

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [myPlayerId, game?.status, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game ?? null,
    !myPlayerId
  )

  const viewerPromoteContext = useMemo(() => {
    if (!game || !myPlayerId || !me || !playerIsViewer(me, game)) return null
    return { hasContext: true }
  }, [game, myPlayerId, me])

  const handlePlayerLeft = useCallback(
    async (leftPlayerId: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== leftPlayerId))
      if (leftPlayerId === myPlayerId) {
        clearPlayerSession(gameCode)
        setMyPlayerId(null)
        await load()
      }
    },
    [gameCode, myPlayerId, setMyPlayerId, setPlayers, load]
  )

  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) return
      try {
        const res = await fetch(`/api/games/${gameCode}/replay-ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeToken: myResumeToken, ready }),
        })
        const json = await res.json()
        if (!res.ok) {
          toastError(json.error ?? 'Could not update replay status')
          return
        }
        void load()
      } catch {
        toastError('Failed to update replay status')
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const addLetter = useCallback(
    (key: string) => {
      const ch = key.toLowerCase()
      if (!/^[a-z]$/.test(ch)) return
      setMessage(null)
      setCurrent((c) => {
        const letters = Array.from({ length: wordLength }, (_, i) => (c[i] && c[i] !== ' ' ? c[i] : ' '))
        let idx = selectedIndex
        if (idx === undefined) {
          const firstEmpty = letters.findIndex((l) => l === ' ')
          idx = firstEmpty !== -1 ? firstEmpty : wordLength - 1
        }
        if (idx < 0 || idx >= wordLength) return c
        letters[idx] = ch
        const nextIndex = Math.min(idx + 1, wordLength - 1)
        setSelectedIndex(nextIndex)
        return letters.join('')
      })
    },
    [wordLength, selectedIndex]
  )

  const backspace = useCallback(() => {
    setMessage(null)
    setCurrent((c) => {
      const letters = Array.from({ length: wordLength }, (_, i) => (c[i] && c[i] !== ' ' ? c[i] : ' '))
      let idx = selectedIndex
      if (idx === undefined) {
        let lastFilled = -1
        for (let i = wordLength - 1; i >= 0; i--) {
          if (letters[i] !== ' ') {
            lastFilled = i
            break
          }
        }
        idx = lastFilled !== -1 ? lastFilled : 0
      }
      if (idx < 0 || idx >= wordLength) return c
      if (letters[idx] !== ' ') {
        // Clear character at active index, keep others fixed
        letters[idx] = ' '
      } else if (idx > 0) {
        // If already blank, move back one slot and clear it
        letters[idx - 1] = ' '
        setSelectedIndex(idx - 1)
      }
      return letters.join('')
    })
  }, [wordLength, selectedIndex])

  const submitGuess = useCallback(() => {
    if (!currentWord || !myResumeToken || timeUp || isViewer || myFinished) return
    if (submitLockRef.current) return
    const trimmedGuess = current.replace(/\s+/g, '')
    if (trimmedGuess.length < wordLength || current.includes(' ')) {
      setMessage('Not enough letters')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const validation = validateWordleRoomGuess(current, currentWord)
    if (!validation.ok) {
      setMessage(validation.error)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const guessWord = validation.normalized
    const localRow: WordleRoomGradedGuess = { word: guessWord, states: validation.states }
    const solved = localRow.states.every((s) => s === 'correct')
    const guessNumber = guesses.length + 1

    setGuesses((g) => [...g, localRow])
    setCurrent('')
    setMessage(null)
    submitLockRef.current = true

    void fetch('/api/wordle-room/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, word: guessWord }),
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) {
          setGuesses((g) => g.filter((row) => row !== localRow))
          showToast(json.error ?? 'Invalid guess', false)
          return
        }

        const wordDone = json.wordIndex !== wordIndex || json.finished === true
        if (wordDone) {
          if (solved) {
            setMessage(`Correct! +${json.pointsAwarded ?? wordleRoomWordScore(guessNumber, maxAttempts, true)} pts`)
          } else {
            setRevealWord(currentWord)
            setMessage(`Out of attempts — the word was ${currentWord.toUpperCase()}`)
          }
          // Reveal delay then pull the next word from the server.
          scheduleAdvance(solved ? 1500 : 2200)
        } else {
          setMessage('Nope — try again')
        }
      })
      .catch(() => {
        setGuesses((g) => g.filter((row) => row !== localRow))
        showToast('Could not submit guess — try again', false)
      })
      .finally(() => {
        submitLockRef.current = false
      })
  }, [
    currentWord,
    myResumeToken,
    timeUp,
    isViewer,
    myFinished,
    current,
    wordLength,
    guesses,
    wordIndex,
    maxAttempts,
    gameCode,
    scheduleAdvance,
  ])

  const standings: WordleRoomStandingRow[] = useMemo(
    () => tallyWordleRoomScores(progressRows, players),
    [progressRows, players]
  )
  const myStanding = useMemo(() => standings.find((s) => s.player_id === myPlayerId), [standings, myPlayerId])

  useRosterBase(game?.status === 'active' || game?.status === 'finished' ? players : undefined, game, myPlayerId)
  const rosterScores = useMemo(
    () => Object.fromEntries(standings.map((r) => [r.player_id, r.words_solved])),
    [standings]
  )
  useGameScores(rosterScores, { suffix: ' solved' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        standings.map((r) => [
          r.player_id,
          r.finished ? `🏁 ${r.words_solved}/${wordCount}` : `Word ${r.word_index + 1}/${wordCount}`,
        ])
      ),
    [standings, wordCount]
  )
  useGameStats(rosterDetails)

  const displayName = me?.name || 'Player'

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
      </div>
    )
  }

  if (screen === 'join') {
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
            gameType="wordle_room"
            subtitle={cfg.tagline}
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="wordle_room"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="wordle_room" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'late_join_choice' && game) {
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
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
    )
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={WORDLE_ROOM_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={false}
            gameCode={gameCode}
            onLeft={() => void handlePlayerLeft(myPlayerId ?? '')}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={displayName}
          onRenamed={() => {
            void load()
          }}
          onLeft={() => void handlePlayerLeft(myPlayerId ?? '')}
          title="Waiting for host to start"
          description="Race to solve the same words before time runs out."
          rulesLink={<GameRulesLink gameType="wordle_room" variant="subtle" />}
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

  if (screen === 'finished' && game) {
    const iWon =
      !!myStanding &&
      standings.length > 1 &&
      standings[0] != null &&
      myStanding === standings[0] &&
      standings[0].words_solved > 0
    return (
      <div className="min-h-screen flex flex-col">
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-4">
          <WordleRoomResults
            game={game}
            players={players}
            standings={standings}
            highlightPlayerId={myPlayerId}
            showCreateNewGame
          />
          {iWon && (
            <PostWinToCommunity
              gameType="wordle_room"
              gameCode={gameCode}
              winnerName={myStanding?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </main>
      </div>
    )
  }

  const boardDisabled = timeUp || isViewer

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-[var(--primary)] text-white' : 'bg-[var(--kill)] text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4 overscroll-none">
        {isViewer && (
          <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="wl-cat-badge inline-block" style={{ background: 'var(--wl-correct)', color: '#fff' }}>
            {categoryLabel}
          </span>
          <span className="text-sm font-semibold text-muted">
            Word {Math.min(wordIndex + 1, wordCount)}/{wordCount}
          </span>
          {timeUp ? (
            <span className="text-sm font-bold text-[var(--kill)]">Time's up</span>
          ) : game && (game.timer_seconds ?? 0) > 0 ? (
            <span className={`text-sm font-bold tabular-nums ${secondsLeft <= 10 ? 'text-[var(--marry)]' : ''}`}>
              {timeLabel}
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted">Untimed</span>
          )}
        </div>

        {currentWord && (
          <WordleRoomBoard
            word={currentWord}
            guesses={guesses}
            current={current}
            revealWord={revealWord}
            maxAttempts={maxAttempts}
            disabled={boardDisabled}
            message={message}
            shake={shake}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onAddLetter={addLetter}
            onBackspace={backspace}
            onSubmit={submitGuess}
          />
        )}

        <div className="glass-card p-3 space-y-2">
          <p className="label-caps text-xs">Race standings</p>
          {standings.length === 0 ? (
            <p className="text-xs text-muted">Waiting for the room to get going…</p>
          ) : (
            standings.map((row, i) => {
              const isMe = row.player_id === myPlayerId
              return (
                <div key={row.player_id} className="flex items-center justify-between text-sm">
                  <span className={`font-medium truncate ${isMe ? 'text-[var(--primary)] font-bold' : ''}`}>
                    {i + 1}. {row.name}
                    {isMe ? ' (you)' : ''}
                  </span>
                  <span className="font-bold tabular-nums text-muted">{row.total_score} pts</span>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted px-1">
          <span>
            Solved: <strong className="text-body">{wordsSolved}</strong>/{wordCount} · Guesses:{' '}
            <strong className="text-body">{totalGuesses}</strong>
          </span>
          {myFinished && <span className="font-semibold text-[var(--primary)]">You finished — waiting on others!</span>}
        </div>
      </main>
    </div>
  )
}
