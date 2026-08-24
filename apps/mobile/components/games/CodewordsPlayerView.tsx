import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type {
  CodewordsBoard,
  CodewordsGuess,
  CodewordsMessage,
  CodewordsPlayerRole,
  CodewordsRole,
  CodewordsTeam,
  Game,
  Player,
} from '@fateround/shared'
import { batch7GameLabel } from '@fateround/shared/batch-7-games'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import {
  cellBackground,
  cellTextColor,
  codewordsKeyIsMasked,
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  countRevealedTeamCells,
  effectiveTurnPhase,
  guessAttributionMap,
  isTurnExpired,
  mergeCodewordsBoardUpdate,
  roleLabel,
  secondsUntilDeadline,
  teamCellTotal,
  teamLabel,
  waitingTurnMessage,
} from '@fateround/shared/codewords'
import { GameInfoChips } from '@/components/GameInfoChips'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { CodewordsAchievementPosts } from '@/components/games/CodewordsAchievementPosts'
import { CodewordsTimerBar } from '@/components/games/CodewordsTimerBar'
import { CodewordsWaitingActivity } from '@/components/games/CodewordsWaitingActivity'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import {
  CodewordsBoardReveal,
  CodewordsEndGameStats,
  CodewordsScoreboard,
} from '@/components/games/CodewordsStatsViews'
import { codewordsOperativeLeaderboard } from '@/components/games/codewords-stats'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import {
  postCodewordsBoard,
  postCodewordsChat,
  postCodewordsClue,
  postCodewordsEndTurn,
  postCodewordsExpireTurn,
  postCodewordsGuess,
  postCodewordsRole,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { CODEWORDS_GUESS_SELECT, CODEWORDS_MESSAGE_SELECT, CODEWORDS_PLAYER_ROLE_SELECT } from '@/lib/supabase-selects'
import { uniqueTopic } from '@/lib/realtime'
import type { PlayerSession } from '@/lib/secure-session'
import { usePlayerSessionActions } from '@/lib/player-session'
import { useToast } from '@/components/ui/Toast'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const CODEWORDS_RULES = [
  'Two teams — Red and Blue — each with one spymaster and operatives.',
  'Spymasters see the secret colour key and give a one-word clue plus a number (how many words it relates to).',
  'Operatives tap words on the 5×5 grid to guess. Correct guesses let you keep going; wrong guesses end your turn.',
  'First team to find all their words wins. Hit the assassin and your team loses!',
]

/**
 * How long a cached board may go without a reconciling fetch through /api/codewords/board.
 * Realtime keeps the board current between fetches; this only catches missed events, so it is
 * deliberately slow — the route is rate-limited per (hashed) IP, and a whole room behind one
 * Wi-Fi/CGNAT address shares that bucket.
 */
const BOARD_RECONCILE_MS = 15_000
const BOARD_RETRY_BASE_MS = 2_000
const BOARD_RETRY_MAX_MS = 15_000

const ROLE_DESCRIPTIONS: Record<CodewordsRole, string> = {
  spymaster: 'See the secret key and give a one-word clue plus a number each turn.',
  operative: 'Tap words on the grid to guess based on your spymaster’s clue.',
}

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'pick_role'
  | 'playing'
  | 'finished'
  | 'not_found'

type CodewordsState = {
  board: CodewordsBoard | null
  roles: CodewordsPlayerRole[]
  guesses: CodewordsGuess[]
  messages: CodewordsMessage[]
}

export function CodewordsPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const toast = useToast()
  const [cwState, setCwState] = useState<CodewordsState>({
    board: null,
    roles: [],
    guesses: [],
    messages: [],
  })
  const [acting, setActing] = useState(false)
  const [clueWord, setClueWord] = useState('')
  const [clueNumber, setClueNumber] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [pickTeam, setPickTeam] = useState<CodewordsTeam | null>(null)
  const [pickRole, setPickRole] = useState<CodewordsRole | null>(null)
  const [timerTick, setTimerTick] = useState(0)

  // --- Board state ----------------------------------------------------------------------
  // The board is the one slice that does NOT come from the table (`codewords_boards.key` is no
  // longer anon-selectable — audit finding H2), so it is held here rather than inside
  // CodewordsState: realtime merges it in place and only a few events justify paying for the
  // rate-limited /api/codewords/board round trip. `boardRef` is the shared source of truth
  // between the load closure and the realtime handler; `board` is what renders.
  const [board, setBoard] = useState<CodewordsBoard | null>(null)
  const boardRef = useRef<CodewordsBoard | null>(null)
  /** When the last successful route fetch landed (0 = never). */
  const boardFetchedAtRef = useRef(0)
  /** Set when we know the cached board is (or may be) behind — forces the next fetch. */
  const boardStaleRef = useRef(true)
  const boardRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRetryDelayRef = useRef(BOARD_RETRY_BASE_MS)
  /** My role at the last load — a change (promotion) invalidates the cached key. */
  const lastRoleRef = useRef<CodewordsRole | null>(null)
  /** `status:session_started_at` at the last load — a change also invalidates the cached key. */
  const lastSessionKeyRef = useRef<string | null>(null)
  /** Latest reconciled resume token, for fetches that happen outside a load. */
  const resumeTokenRef = useRef<string | null>(null)
  /** Assigned below, once `bootstrap` exists. */
  const reloadRef = useRef<() => void>(() => {})

  const applyBoard = useCallback((next: CodewordsBoard | null) => {
    boardRef.current = next
    setBoard(next)
  }, [])

  /**
   * Fetch the board through the route. Returns false only on a genuine failure (429/5xx/
   * offline) — "the game has no board row yet" is a successful answer of `null`.
   */
  const fetchBoard = useCallback(
    async (resumeToken: string | null): Promise<boolean> => {
      const res = await postCodewordsBoard(gameCode, resumeToken)
      if (!res.ok) return false
      boardFetchedAtRef.current = Date.now()
      boardStaleRef.current = false
      boardRetryDelayRef.current = BOARD_RETRY_BASE_MS
      const next = res.board
      const prev = boardRef.current
      if (
        next &&
        prev &&
        prev.id === next.id &&
        (prev.revealed_indices?.length ?? 0) > (next.revealed_indices?.length ?? 0)
      ) {
        // The route read a replica that trails a realtime update we already applied. Take only
        // the key (the reason we asked at all) and keep the newer live fields.
        applyBoard({ ...prev, key: next.key, key_totals: next.key_totals ?? prev.key_totals })
      } else {
        applyBoard(next)
      }
      return true
    },
    [gameCode, applyBoard]
  )

  /**
   * Retry a failed board fetch on a backoff instead of leaving the player on a stale board
   * until the next realtime event. One timer at a time; the delay resets on success.
   */
  const scheduleBoardRetry = useCallback(() => {
    if (boardRetryRef.current) return
    const delay = boardRetryDelayRef.current
    boardRetryDelayRef.current = Math.min(delay * 2, BOARD_RETRY_MAX_MS)
    boardRetryRef.current = setTimeout(() => {
      boardRetryRef.current = null
      void fetchBoard(resumeTokenRef.current).then((ok) => {
        if (!ok) {
          scheduleBoardRetry()
          return
        }
        // A board that arrived late can be the one that ends the game — re-run the bootstrap so
        // the finished screen isn't held back until the next event.
        if (boardRef.current?.winner) reloadRef.current()
      })
    }, delay)
  }, [fetchBoard])

  useEffect(
    () => () => {
      if (boardRetryRef.current) clearTimeout(boardRetryRef.current)
    },
    []
  )

  /**
   * Decide whether this load needs to pay for a board fetch, and never let a failed one become
   * state. Reasons to fetch: we have no board, something invalidated the cached one (new round,
   * a reveal, a role change), a spymaster is holding a masked key, or the periodic reconcile is
   * due. Everything else reuses the cached board that realtime keeps merged — the load path runs
   * on every chat message and guess, and a POST per event per device trips the shared
   * rate-limit bucket for a whole room (review on PR #787).
   */
  const resolveBoard = useCallback(
    async (game: Game, resumeToken: string | null, myRole: CodewordsPlayerRole | null) => {
      if (game.status === 'waiting') {
        // Lobby (including a replay that reset the round) — drop the finished board.
        applyBoard(null)
        boardStaleRef.current = true
        boardFetchedAtRef.current = 0
        return null
      }
      // A lifecycle change re-decides who may see the key — most importantly `finished`, where
      // the route hands the full key to everyone for the end-of-game reveal. Without this an
      // operative's post-game board stays masked (grey cells, no colours) until the reconcile.
      const sessionKey = `${game.status}:${game.session_started_at ?? ''}`
      if (sessionKey !== lastSessionKeyRef.current) {
        boardStaleRef.current = true
        lastSessionKeyRef.current = sessionKey
      }
      const cached = boardRef.current
      const spymasterWithoutKey = myRole?.role === 'spymaster' && cached != null && codewordsKeyIsMasked(cached)
      const reconcileDue = Date.now() - boardFetchedAtRef.current > BOARD_RECONCILE_MS
      if (cached && !boardStaleRef.current && !spymasterWithoutKey && !reconcileDue) return cached

      const ok = await fetchBoard(resumeToken)
      if (ok) return boardRef.current
      // A 429/5xx/dropped packet is NOT "there is no board": keep the one on screen (grid, clue
      // and timer stay live) and retry, instead of collapsing a live game into a spinner.
      boardStaleRef.current = true
      scheduleBoardRetry()
      return cached
    },
    [applyBoard, fetchBoard, scheduleBoardRetry]
  )

  const loadGameState = useCallback(
    async (
      game: Game,
      _players: Player[],
      session: PlayerSession | null
    ): Promise<{ state: CodewordsState; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      // `session` is the bootstrap's freshly reconciled session, so the board fetch below
      // authenticates with the token this device actually owns. Reading SecureStore here
      // instead would use the pre-reconciliation token and hand a rejoined spymaster an
      // operative's masked grid until some later event reloaded (review on PR #787).
      resumeTokenRef.current = session?.resumeToken ?? null
      const [rolesRes, guessesRes, messagesRes] = await Promise.all([
        getSupabase().from('codewords_player_roles').select(CODEWORDS_PLAYER_ROLE_SELECT).eq('game_id', code),
        getSupabase().from('codewords_guesses').select(CODEWORDS_GUESS_SELECT).eq('game_id', code).order('created_at'),
        getSupabase()
          .from('codewords_messages')
          .select(CODEWORDS_MESSAGE_SELECT)
          .eq('game_id', code)
          .order('created_at'),
      ])
      // Roles drive screen routing, so a failure there is a hard miss. The board never hard-
      // misses: a seated player stays put and keeps the board they have (see resolveBoard).
      // Guesses and messages only enrich the view — if one errors (a transient RLS hiccup),
      // degrade it to empty.
      if (rolesRes.error) {
        return { state: { board: boardRef.current, roles: [], guesses: [], messages: [] }, ok: false }
      }
      const roles = (rolesRes.data as CodewordsPlayerRole[]) ?? []
      const myRole = session ? (roles.find((r) => r.player_id === session.playerId) ?? null) : null
      // A promotion (operative → spymaster) has to bring the real key with it.
      if (myRole?.role !== lastRoleRef.current) {
        boardStaleRef.current = true
        lastRoleRef.current = myRole?.role ?? null
      }
      const state: CodewordsState = {
        board: await resolveBoard(game, session?.resumeToken ?? null, myRole),
        roles,
        guesses: guessesRes.error ? [] : ((guessesRes.data as CodewordsGuess[]) ?? []),
        messages: messagesRes.error ? [] : ((messagesRes.data as CodewordsMessage[]) ?? []),
      }
      setCwState(state)
      return { state, ok: true }
    },
    [gameCode, resolveBoard]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null, state: CodewordsState): Screen => {
    if (!playerId) {
      // No session yet: offer the platform pre-join gates (watch-or-play for a
      // late opener, "game started — waiting for lobby", or "game ended").
      const pre = preJoinScreen(game, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (game.status === 'waiting') {
      const myRole = state.roles.find((r) => r.player_id === playerId)
      if (codewordsPlayerPicks(game) && !codewordsRandomizeTeams(game) && !myRole) {
        return 'pick_role'
      }
      return 'waiting'
    }
    if (game.status === 'finished' || state.board?.winner) return 'finished'
    if (game.status === 'active') {
      // A seated player is in the game even before the board row loads. Don't
      // gate on `state.board` here: a slow or transient board fetch would
      // otherwise bounce them back to the lobby "waiting for host" screen (and
      // stay stuck across refreshes). The playing view renders a loading state
      // until the board arrives — matching web, which routes on status alone.
      if (state.roles.some((r) => r.player_id === playerId)) return 'playing'
      return 'waiting'
    }
    return 'waiting'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, CodewordsState>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)
  reloadRef.current = () => void bootstrap.load()

  // Watch-or-play prompt for a late opener (fetched only on that screen).
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  // `codewords_boards` is deliberately NOT in this list: every entry here triggers a full
  // bootstrap.load(), and chat/guess traffic from a whole room would then fan out one
  // /api/codewords/board POST per device per message into a shared, rate-limited bucket
  // (review on PR #787). Board changes are handled by the dedicated subscription below, which
  // merges the payload the way web does and only hits the route when it must.
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'codewords_player_roles', 'codewords_guesses', 'codewords_messages'],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  // Board realtime. The payload no longer carries the redacted `key` column, so it is merged
  // onto the key we already hold (mergeCodewordsBoardUpdate) rather than applied verbatim — and
  // the route is re-hit only when the merge cannot be right: a new board row (new round, new
  // key) or a newly revealed cell (masked keys carry `null` there until the server colours it).
  const hasGame = !!bootstrap.game
  useEffect(() => {
    if (!hasGame) return
    const code = gameCode.toUpperCase()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`codewords-board-${code}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'codewords_boards', filter: `game_id=eq.${code}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            applyBoard(null)
            boardStaleRef.current = true
            return
          }
          const incoming = payload.new as CodewordsBoard
          const prev = boardRef.current
          applyBoard(mergeCodewordsBoardUpdate(prev, incoming))
          const rowReplaced = !prev || prev.id !== incoming.id
          const revealedChanged = (prev?.revealed_indices?.length ?? -1) !== (incoming.revealed_indices?.length ?? 0)
          // A winner means the game is over and the route now releases the full key to everyone.
          const justWon = !!incoming.winner && !prev?.winner
          if (rowReplaced || revealedChanged || justWon) {
            void fetchBoard(resumeTokenRef.current).then((ok) => {
              if (!ok) {
                boardStaleRef.current = true
                scheduleBoardRetry()
              }
            })
          }
          // The board can end the game before the games row lands; re-run the bootstrap so the
          // finished screen isn't held back (a new round has to re-route too).
          if (rowReplaced || incoming.winner) reloadRef.current()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, hasGame, applyBoard, fetchBoard, scheduleBoardRetry])

  const activeState = bootstrap.gameState ?? cwState
  const roles = activeState.roles
  const guesses = activeState.guesses
  const messages = activeState.messages

  const myRole = roles.find((r) => r.player_id === bootstrap.myPlayerId) ?? null
  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))
  const playerNameById = useMemo(() => new Map(bootstrap.players.map((p) => [p.id, p.name])), [bootstrap.players])

  const active = bootstrap.game?.status === 'active' && board && !board.winner

  // Notify remaining teammates when a team member leaves/is removed, and flag an
  // auto-promotion to spymaster. useGameTableSync only re-fetches, so we diff here.
  const prevTeamMatesRef = useRef<Map<string, string> | null>(null)
  const prevMyRoleRef = useRef<CodewordsRole | null>(null)
  useEffect(() => {
    const myTeam = myRole?.team ?? null
    if (bootstrap.game?.status === 'active' && myTeam) {
      const teamMates = new Map<string, string>()
      for (const r of roles) {
        if (r.team === myTeam && r.player_id !== bootstrap.myPlayerId) {
          teamMates.set(r.player_id, playerNameById.get(r.player_id) ?? 'A teammate')
        }
      }
      const prev = prevTeamMatesRef.current
      if (prev) {
        for (const [id, name] of prev) {
          if (!teamMates.has(id) && roles.every((r) => r.player_id !== id)) {
            toast.show(`${name} left your team`, 'info')
          }
        }
      }
      prevTeamMatesRef.current = teamMates
    } else {
      prevTeamMatesRef.current = null
    }

    const prevRole = prevMyRoleRef.current
    if (prevRole === 'operative' && myRole?.role === 'spymaster') {
      toast.show("You're now your team's spymaster", 'info')
    }
    prevMyRoleRef.current = myRole?.role ?? null
  }, [roles, myRole, playerNameById, bootstrap.game?.status, bootstrap.myPlayerId, toast])

  useEffect(() => {
    if (!active || !board?.turn_deadline_at) return
    const id = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [active, board?.turn_deadline_at])

  useEffect(() => {
    if (!active || !board?.turn_deadline_at) return
    if (!isTurnExpired(board.turn_deadline_at)) return
    void postCodewordsExpireTurn(bootstrap.code)
      .then(() => bootstrap.load())
      .catch(() => {})
  }, [active, board?.turn_deadline_at, timerTick, bootstrap.code, bootstrap.load])

  const act = async (fn: () => Promise<unknown>, successMsg?: string) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
      if (successMsg) toast.success(successMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setActing(false)
    }
  }

  const saveRole = (team: CodewordsTeam, role: CodewordsRole) =>
    act(
      () => postCodewordsRole(bootstrap.code, bootstrap.myResumeToken!, team, role),
      `You're on ${teamLabel(team)} as ${roleLabel(role)}`
    )

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }
  if (bootstrap.screen === 'late_join_choice' && bootstrap.game) {
    return (
      <LateJoinChoiceScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        context={lateJoin.context}
        contextLoading={lateJoin.loading}
        nameInput={bootstrap.joinName}
        onNameChange={bootstrap.setJoinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        onJoinAsPlayer={() => void bootstrap.join(undefined, { joinAsViewer: false })}
      />
    )
  }
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }

  if (bootstrap.screen === 'pick_role' && bootstrap.game) {
    return (
      <GameShell bootstrap={bootstrap} title="Codewords" subtitle="Pick your role">
        <ScrollView contentContainerStyle={styles.pickScroll}>
          <Text style={styles.pickHint}>Choose your team and role before the host starts.</Text>

          <Text style={styles.pickSectionLabel}>Team</Text>
          <View style={styles.pickRow}>
            {(['red', 'blue'] as const).map((team) => (
              <Pressable
                key={team}
                style={[
                  styles.teamBtn,
                  team === 'red' ? styles.teamBtnRed : styles.teamBtnBlue,
                  pickTeam === team && styles.pickBtnActive,
                ]}
                onPress={() => setPickTeam(team)}
              >
                <Text style={styles.teamBtnText}>{teamLabel(team)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.pickSectionLabel}>Role</Text>
          <View style={styles.roleColumn}>
            {(['spymaster', 'operative'] as const).map((role) => (
              <Pressable
                key={role}
                style={[styles.roleBtn, pickRole === role && styles.pickBtnActive]}
                onPress={() => setPickRole(role)}
              >
                <Text style={styles.roleBtnTitle}>{roleLabel(role)}</Text>
                <Text style={styles.roleBtnDesc}>{ROLE_DESCRIPTIONS[role]}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.actionBtn, (!pickTeam || !pickRole || acting) && styles.actionBtnDisabled]}
            disabled={!pickTeam || !pickRole || acting}
            onPress={() => pickTeam && pickRole && void saveRole(pickTeam, pickRole)}
          >
            <Text style={styles.actionText}>Confirm team &amp; role</Text>
          </Pressable>

          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>How to play</Text>
            {CODEWORDS_RULES.map((rule) => (
              <Text key={rule} style={styles.ruleLine}>
                {'•'} {rule}
              </Text>
            ))}
          </View>
        </ScrollView>
      </GameShell>
    )
  }

  if (bootstrap.game && bootstrap.game.status === 'active' && board && !board.winner && isViewer) {
    const spectatorTurn = waitingTurnMessage(board, roles, playerNameById)
    const specRevealed = new Set(board.revealed_indices)
    const specAttribution = guessAttributionMap(guesses, playerNameById)
    // Totals from `key_totals`, never by counting the key: an operative's key is masked, so
    // counting it reports "cells already revealed" as the team total — a scoreboard claiming
    // both teams have found all their words (a redacted read rendered as game state).
    const specRedTotal = teamCellTotal(board, 'red')
    const specBlueTotal = teamCellTotal(board, 'blue')
    const specRedRev = countRevealedTeamCells(board.key, board.revealed_indices, 'red')
    const specBlueRev = countRevealedTeamCells(board.key, board.revealed_indices, 'blue')
    return (
      <GameShell bootstrap={bootstrap} title="Codewords" subtitle="Watching">
        <ScrollView contentContainerStyle={styles.content}>
          <TurnBanner text={spectatorTurn} isMyTurn={false} />
          <View style={styles.scoreRow}>
            <Text style={styles.scoreRed}>
              Red {specRedRev}/{specRedTotal}
            </Text>
            <Text style={styles.scoreBlue}>
              Blue {specBlueRev}/{specBlueTotal}
            </Text>
          </View>
          {board.current_clue_word ? (
            <View style={styles.clueCard}>
              <Text style={styles.clueLabel}>Clue</Text>
              <Text style={styles.clueWord}>
                {board.current_clue_word} · {board.current_clue_number}
                {board.guesses_remaining != null ? ` (${board.guesses_remaining} left)` : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.grid}>
            {board.words.map((word, index) => {
              const isRevealed = specRevealed.has(index)
              const cellType = board.key[index]
              const bg = cellBackground(cellType, isRevealed, false)
              const fg = cellTextColor(cellType, isRevealed, false)
              const onDark = fg !== '#171717'
              return (
                <View key={index} style={[styles.cell, { backgroundColor: bg }, isRevealed && styles.cellRevealed]}>
                  <Text style={[styles.cellWord, { color: fg }]}>{word}</Text>
                  {specAttribution[index] ? (
                    <Text style={[styles.cellAttr, onDark && styles.cellAttrOnDark]}>{specAttribution[index]}</Text>
                  ) : null}
                </View>
              )
            })}
          </View>
          <View style={styles.scoreboardBlock}>
            <CodewordsScoreboard
              board={board}
              roles={roles}
              playerNameById={playerNameById}
              highlightPlayerId={bootstrap.myPlayerId}
            />
          </View>
        </ScrollView>
      </GameShell>
    )
  }

  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return (
      <LobbyView
        {...lobbyProps!}
        onLeft={onLeft}
        activity={
          <CodewordsWaitingActivity
            myRole={myRole}
            isSpectator={isViewer}
            roles={roles}
            playerNameById={playerNameById}
          />
        }
      />
    )
  }

  if (!bootstrap.game || !board || !myRole) return <GameLoading />

  if (bootstrap.screen === 'finished' || board.winner) {
    const title = board.winner ? `${teamLabel(board.winner)} team wins!` : 'Game over'
    const players = bootstrap.players.map((p) => ({ id: p.id, name: p.name }))
    const leaderboard = codewordsOperativeLeaderboard(guesses, roles, players, bootstrap.myPlayerId)
    const finishAttribution = guessAttributionMap(guesses, playerNameById)
    return (
      <GameShell bootstrap={bootstrap} title={batch7GameLabel('codewords')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle="Operatives"
          leaderboard={leaderboard}
          notice={
            <View style={styles.finishExtras}>
              {bootstrap.myPlayerId ? (
                <CodewordsAchievementPosts
                  guesses={guesses}
                  roles={roles}
                  players={bootstrap.players}
                  winner={board.winner}
                  myPlayerId={bootstrap.myPlayerId}
                  gameCode={bootstrap.code}
                  roundKey={board.id ?? null}
                />
              ) : null}
              {/* Skip the live-game Scoreboard here (team progress bars + rosters):
                  the winner banner already tells the outcome and the board reveal
                  colours every cell, so the extra panel just repeats what's on
                  screen. MVP cards + spymaster list + board reveal cover the story. */}
              <CodewordsEndGameStats
                guesses={guesses}
                roles={roles}
                players={players}
                highlightPlayerId={bootstrap.myPlayerId}
                winner={board.winner}
              />
              <CodewordsBoardReveal board={board} cellAttribution={finishAttribution} />
            </View>
          }
        />
      </GameShell>
    )
  }

  const turnPhase = effectiveTurnPhase(board)
  const isSpymaster = myRole.role === 'spymaster'
  const isOperative = myRole.role === 'operative'
  const isMyTurn = board.current_turn === myRole.team
  const canGiveClue = isMyTurn && isSpymaster && turnPhase === 'clue' && !board.current_clue_word
  const canGuess = isMyTurn && isOperative && turnPhase === 'guess' && !!board.current_clue_word
  const showKey = isSpymaster || !!board.winner
  const revealed = new Set(board.revealed_indices)
  const cellAttribution = guessAttributionMap(guesses, playerNameById)
  const teamMessages = messages.filter((m) => m.team === myRole.team)
  const secondsLeft = secondsUntilDeadline(board.turn_deadline_at)
  void timerTick

  const bannerText = !isMyTurn
    ? waitingTurnMessage(board, roles, playerNameById)
    : turnPhase === 'clue'
      ? isSpymaster
        ? 'Your turn — give a one-word clue'
        : 'Waiting for your spymaster'
      : isOperative
        ? 'Tap words to guess'
        : 'Your operatives are guessing'

  // See the note in the spectator board: masked keys make counting the key wrong.
  const redTotal = teamCellTotal(board, 'red')
  const blueTotal = teamCellTotal(board, 'blue')
  const redRev = countRevealedTeamCells(board.key, board.revealed_indices, 'red')
  const blueRev = countRevealedTeamCells(board.key, board.revealed_indices, 'blue')

  return (
    <GameShell bootstrap={bootstrap} title="Codewords" subtitle={`${teamLabel(myRole.team)} ${roleLabel(myRole.role)}`}>
      <KeyboardAwareGameScroll contentContainerStyle={styles.content}>
        <TurnBanner text={bannerText} isMyTurn={canGiveClue || canGuess} />

        {board.turn_deadline_at && secondsLeft > 0 ? (
          <CodewordsTimerBar
            label={
              turnPhase === 'clue'
                ? isMyTurn && isSpymaster
                  ? 'Spymaster timer'
                  : 'Waiting for clue'
                : 'Operative timer'
            }
            seconds={secondsLeft}
            enableAlerts={canGiveClue || canGuess}
          />
        ) : null}

        <View style={styles.scoreRow}>
          <Text style={styles.scoreRed}>
            Red {redRev}/{redTotal}
          </Text>
          <Text style={styles.scoreBlue}>
            Blue {blueRev}/{blueTotal}
          </Text>
        </View>

        {board.current_clue_word ? (
          <View style={styles.clueCard}>
            <Text style={styles.clueLabel}>Clue</Text>
            <Text style={styles.clueWord}>
              {board.current_clue_word} · {board.current_clue_number}
              {board.guesses_remaining != null ? ` (${board.guesses_remaining} left)` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {board.words.map((word, index) => {
            const isRevealed = revealed.has(index)
            const cellType = board.key[index]
            const bg = cellBackground(cellType, isRevealed, showKey)
            const fg = cellTextColor(cellType, isRevealed, showKey)
            const onDark = fg !== '#171717'
            const disabled = !canGuess || isRevealed
            return (
              <Pressable
                key={index}
                style={[styles.cell, { backgroundColor: bg }, isRevealed && styles.cellRevealed]}
                disabled={disabled || acting}
                onPress={() => act(() => postCodewordsGuess(bootstrap.code, bootstrap.myResumeToken!, index))}
              >
                <Text style={[styles.cellWord, { color: fg }]}>{word}</Text>
                {cellAttribution[index] ? (
                  <Text style={[styles.cellAttr, onDark && styles.cellAttrOnDark]}>{cellAttribution[index]}</Text>
                ) : null}
                {/* `cellType` is null on a masked key — a spymaster whose board hasn't been
                    re-fetched with their key yet. Show nothing rather than a wrong letter. */}
                {showKey && !isRevealed && cellType ? (
                  <Text style={[styles.cellKey, onDark && styles.cellAttrOnDark]}>{cellType[0].toUpperCase()}</Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        {canGiveClue ? (
          <View style={styles.formBlock}>
            <View style={styles.clueRow}>
              <TextInput
                style={[styles.input, styles.clueInput]}
                value={clueWord}
                onChangeText={(t) => setClueWord(t.replace(/\s/g, '').slice(0, 40))}
                placeholder="Clue word"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                maxLength={40}
              />
              <TextInput
                style={[styles.inputSmall, styles.numberInput]}
                value={clueNumber}
                onChangeText={(t) => setClueNumber(t.replace(/[^0-9]/g, '').slice(0, 1))}
                placeholder="#"
                placeholderTextColor="#71717a"
                keyboardType="number-pad"
                maxLength={1}
              />
            </View>
            <Pressable
              style={[styles.actionBtn, (acting || !clueWord.trim() || !clueNumber.trim()) && styles.actionBtnDisabled]}
              disabled={acting || !clueWord.trim() || !clueNumber.trim()}
              onPress={() => {
                const n = Number.parseInt(clueNumber.trim(), 10)
                if (Number.isNaN(n) || n < 0 || n > 9) return
                void act(async () => {
                  await postCodewordsClue(bootstrap.code, bootstrap.myResumeToken!, clueWord.trim(), n)
                  setClueWord('')
                  setClueNumber('')
                }, 'Clue sent')
              }}
            >
              <Text style={styles.actionText}>Send clue</Text>
            </Pressable>
          </View>
        ) : null}

        {canGuess ? (
          <Pressable
            style={[styles.actionBtn, styles.endTurnBtn]}
            disabled={acting}
            onPress={() => act(() => postCodewordsEndTurn(bootstrap.code, bootstrap.myResumeToken!), 'Turn ended')}
          >
            <Text style={styles.actionText}>End turn early</Text>
          </Pressable>
        ) : null}

        <View style={styles.scoreboardBlock}>
          <CodewordsScoreboard
            board={board}
            roles={roles}
            playerNameById={playerNameById}
            highlightPlayerId={bootstrap.myPlayerId}
          />
        </View>

        {isOperative ? (
          <>
            <Text style={styles.chatTitle}>Team chat</Text>
            {/* Plain View (not a nested ScrollView) so it doesn't trap touches
                inside KeyboardAwareGameScroll; show the most recent messages and
                let the page scroll handle overflow. */}
            <View style={styles.chatLog}>
              {teamMessages.slice(-12).map((m) => (
                <Text key={m.id} style={styles.chatLine}>
                  <Text style={styles.chatName}>{playerNameById.get(m.player_id) ?? 'Player'}: </Text>
                  {m.text}
                </Text>
              ))}
            </View>
            <View style={styles.chatRow}>
              <TextInput
                style={styles.input}
                value={chatDraft}
                onChangeText={setChatDraft}
                placeholder="Message operatives…"
                placeholderTextColor="#71717a"
              />
              <Pressable
                style={styles.actionBtn}
                disabled={acting || !chatDraft.trim()}
                onPress={() => {
                  const text = chatDraft.trim()
                  if (!text) return
                  void act(async () => {
                    await postCodewordsChat(bootstrap.code, bootstrap.myResumeToken!, text)
                    setChatDraft('')
                  })
                }}
              >
                <Text style={styles.actionText}>Send</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const CELL = 64

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    pickScroll: { paddingBottom: 24 },
    pickHint: { color: theme.textMuted, marginBottom: 12, textAlign: 'center' },
    pickSectionLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
    teamBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      minWidth: 120,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    // Functional team colors, fixed in both schemes.
    teamBtnRed: { backgroundColor: '#dc2626' },
    teamBtnBlue: { backgroundColor: '#2563eb' },
    teamBtnText: { color: '#fff', fontWeight: '800', textAlign: 'center', fontSize: 16 },
    roleColumn: { gap: 8, marginBottom: 16 },
    roleBtn: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    roleBtnTitle: { color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 2 },
    roleBtnDesc: { color: theme.textMuted, fontSize: 12, lineHeight: 16 },
    pickBtnActive: { borderWidth: 2, borderColor: theme.primary },
    actionBtnDisabled: { opacity: 0.5 },
    rulesCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
      gap: 6,
    },
    rulesTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    ruleLine: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
    finishExtras: { gap: 16, marginTop: 12 },
    scoreboardBlock: { marginTop: 12 },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    scoreRed: { color: '#fca5a5', fontWeight: '800' },
    scoreBlue: { color: '#93c5fd', fontWeight: '800' },
    clueCard: { backgroundColor: theme.surface, borderRadius: 8, padding: 12, marginBottom: 8 },
    clueLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    clueWord: { color: theme.text, fontSize: 18, fontWeight: '900' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginVertical: 8 },
    cell: {
      width: CELL,
      height: CELL,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 4,
      borderWidth: 1,
      borderColor: '#52525b',
    },
    cellRevealed: { opacity: 0.95 },
    cellWord: { color: '#171717', fontWeight: '800', fontSize: 11, textAlign: 'center' },
    cellAttr: { color: '#52525b', fontSize: 8, marginTop: 2 },
    // Secondary cell text (guess attribution / key initial) sits on the dark
    // assassin background here — lighten it so it stays readable.
    cellAttrOnDark: { color: '#d4d4d8' },
    cellKey: { position: 'absolute', top: 2, right: 4, fontSize: 8, color: '#52525b', fontWeight: '800' },
    formBlock: { gap: 8, marginTop: 8 },
    clueRow: { flexDirection: 'row', gap: 8 },
    clueInput: { flex: 1 },
    numberInput: { width: 56, textAlign: 'center' },
    input: {
      backgroundColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
    },
    inputSmall: {
      backgroundColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      width: 80,
    },
    actionBtn: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    endTurnBtn: { backgroundColor: theme.textFaint, marginTop: 8 },
    // white on the rose / dark action buttons — intentional
    actionText: { color: '#fff', fontWeight: '800' },
    chatTitle: { color: theme.textMuted, fontWeight: '700', marginTop: 12, marginBottom: 4 },
    chatLog: { backgroundColor: theme.surface, borderRadius: 8, padding: 8, gap: 2 },
    chatLine: { color: theme.textSecondary, fontSize: 13, marginBottom: 4 },
    chatName: { color: theme.text, fontWeight: '700' },
    chatRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  })
