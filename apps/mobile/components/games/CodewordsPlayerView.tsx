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
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  countRevealedTeamCells,
  countTeamCells,
  effectiveTurnPhase,
  guessAttributionMap,
  isTurnExpired,
  roleLabel,
  secondsUntilDeadline,
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
import {
  CODEWORDS_GUESS_SELECT,
  CODEWORDS_MESSAGE_SELECT,
  CODEWORDS_PLAYER_ROLE_SELECT,
} from '@/lib/supabase-selects'
import { getPlayerSession } from '@/lib/secure-session'
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

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: CodewordsState; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      // The board comes from the server route, not a direct read: `codewords_boards.key` is no
      // longer anon-selectable (audit finding H2). The route returns the real key only to a
      // spymaster (resolved from the resume token) and masks it for everyone else.
      const session = await getPlayerSession(code)
      const [board, rolesRes, guessesRes, messagesRes] = await Promise.all([
        postCodewordsBoard(code, { resumeToken: session?.resumeToken }),
        getSupabase().from('codewords_player_roles').select(CODEWORDS_PLAYER_ROLE_SELECT).eq('game_id', code),
        getSupabase().from('codewords_guesses').select(CODEWORDS_GUESS_SELECT).eq('game_id', code).order('created_at'),
        getSupabase()
          .from('codewords_messages')
          .select(CODEWORDS_MESSAGE_SELECT)
          .eq('game_id', code)
          .order('created_at'),
      ])
      // Roles drive screen routing, so a failure there is a hard miss. The board now comes from
      // postCodewordsBoard, which returns null both for "no board yet" and on a transport error —
      // so, like web, we never hard-miss on the board alone: a seated player stays put and the
      // playing view shows a loading state until the board arrives. Guesses and messages only
      // enrich the view — if one errors (a transient RLS hiccup), degrade it to empty.
      if (rolesRes.error) {
        return { state: { board: null, roles: [], guesses: [], messages: [] }, ok: false }
      }
      const state: CodewordsState = {
        board,
        roles: (rolesRes.data as CodewordsPlayerRole[]) ?? [],
        guesses: guessesRes.error ? [] : ((guessesRes.data as CodewordsGuess[]) ?? []),
        messages: messagesRes.error ? [] : ((messagesRes.data as CodewordsMessage[]) ?? []),
      }
      setCwState(state)
      return { state, ok: true }
    },
    [gameCode]
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

  // Watch-or-play prompt for a late opener (fetched only on that screen).
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  // A codewords_boards realtime event triggers a full bootstrap.load(), which refetches the
  // board through postCodewordsBoard (the route) — we never apply the realtime payload directly,
  // since it no longer carries the redacted `key` column (audit finding H2).
  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'codewords_boards',
      'codewords_player_roles',
      'codewords_guesses',
      'codewords_messages',
    ],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  const activeState = bootstrap.gameState ?? cwState
  const board = activeState.board
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
    const specRedTotal = countTeamCells(board.key, 'red')
    const specBlueTotal = countTeamCells(board.key, 'blue')
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
              <CodewordsEndGameStats
                guesses={guesses}
                roles={roles}
                players={players}
                highlightPlayerId={bootstrap.myPlayerId}
                winner={board.winner}
              />
              <CodewordsScoreboard
                board={board}
                roles={roles}
                playerNameById={playerNameById}
                highlightPlayerId={bootstrap.myPlayerId}
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

  const redTotal = countTeamCells(board.key, 'red')
  const blueTotal = countTeamCells(board.key, 'blue')
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
                {showKey && !isRevealed ? (
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
