import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  cellBackground,
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
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postCodewordsChat,
  postCodewordsClue,
  postCodewordsEndTurn,
  postCodewordsExpireTurn,
  postCodewordsGuess,
  postCodewordsRole,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import {
  CODEWORDS_BOARD_SELECT,
  CODEWORDS_GUESS_SELECT,
  CODEWORDS_MESSAGE_SELECT,
  CODEWORDS_PLAYER_ROLE_SELECT,
} from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'

type Screen = 'loading' | 'join' | 'waiting' | 'pick_role' | 'playing' | 'finished' | 'not_found'

type CodewordsState = {
  board: CodewordsBoard | null
  roles: CodewordsPlayerRole[]
  guesses: CodewordsGuess[]
  messages: CodewordsMessage[]
}

export function CodewordsPlayerView({ gameCode }: { gameCode: string }) {
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
  const [timerTick, setTimerTick] = useState(0)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: CodewordsState; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [boardRes, rolesRes, guessesRes, messagesRes] = await Promise.all([
        getSupabase().from('codewords_boards').select(CODEWORDS_BOARD_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase().from('codewords_player_roles').select(CODEWORDS_PLAYER_ROLE_SELECT).eq('game_id', code),
        getSupabase()
          .from('codewords_guesses')
          .select(CODEWORDS_GUESS_SELECT)
          .eq('game_id', code)
          .order('created_at'),
        getSupabase()
          .from('codewords_messages')
          .select(CODEWORDS_MESSAGE_SELECT)
          .eq('game_id', code)
          .order('created_at'),
      ])
      if (boardRes.error || rolesRes.error || guessesRes.error || messagesRes.error) {
        return { state: { board: null, roles: [], guesses: [], messages: [] }, ok: false }
      }
      const state: CodewordsState = {
        board: (boardRes.data as CodewordsBoard | null) ?? null,
        roles: (rolesRes.data as CodewordsPlayerRole[]) ?? [],
        guesses: (guessesRes.data as CodewordsGuess[]) ?? [],
        messages: (messagesRes.data as CodewordsMessage[]) ?? [],
      }
      setCwState(state)
      return { state, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, state: CodewordsState): Screen => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') {
        const myRole = state.roles.find((r) => r.player_id === playerId)
        if (
          codewordsPlayerPicks(game) &&
          !codewordsRandomizeTeams(game) &&
          !myRole
        ) {
          return 'pick_role'
        }
        return 'waiting'
      }
      if (game.status === 'finished' || state.board?.winner) return 'finished'
      if (game.status === 'active' && state.board) {
        if (!state.roles.some((r) => r.player_id === playerId)) return 'waiting'
        return 'playing'
      }
      return 'waiting'
    },
    []
  )

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
    !!bootstrap.game
  )

  const activeState = bootstrap.gameState ?? cwState
  const board = activeState.board
  const roles = activeState.roles
  const guesses = activeState.guesses
  const messages = activeState.messages

  const myRole = roles.find((r) => r.player_id === bootstrap.myPlayerId) ?? null
  const playerNameById = useMemo(
    () => new Map(bootstrap.players.map((p) => [p.id, p.name])),
    [bootstrap.players]
  )

  const active = bootstrap.game?.status === 'active' && board && !board.winner

  useEffect(() => {
    if (!active || !board?.turn_deadline_at) return
    const id = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [active, board?.turn_deadline_at])

  useEffect(() => {
    if (!active || !board?.turn_deadline_at) return
    if (!isTurnExpired(board.turn_deadline_at)) return
    void postCodewordsExpireTurn(bootstrap.code).then(() => bootstrap.load()).catch(() => {})
  }, [active, board?.turn_deadline_at, timerTick, bootstrap.code, bootstrap.load])

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const saveRole = (team: CodewordsTeam, role: CodewordsRole) =>
    act(() => postCodewordsRole(bootstrap.code, bootstrap.myResumeToken!, team, role))

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
      />
    )
  }

  if (bootstrap.screen === 'pick_role' && bootstrap.game) {
    return (
      <GameShell bootstrap={bootstrap} title="Codewords" subtitle={`Pick your role · ${bootstrap.code}`}>
        <Text style={styles.pickHint}>Choose team and role before the host starts.</Text>
        <View style={styles.pickRow}>
          {(['red', 'blue'] as const).map((team) => (
            <Pressable
              key={team}
              style={[styles.pickBtn, pickTeam === team && styles.pickBtnActive]}
              onPress={() => setPickTeam(team)}
            >
              <Text style={styles.pickBtnText}>{teamLabel(team)}</Text>
            </Pressable>
          ))}
        </View>
        {pickTeam ? (
          <View style={styles.pickRow}>
            {(['spymaster', 'operative'] as const).map((role) => (
              <Pressable
                key={role}
                style={styles.pickBtn}
                disabled={acting}
                onPress={() => void saveRole(pickTeam, role)}
              >
                <Text style={styles.pickBtnText}>{roleLabel(role)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </GameShell>
    )
  }

  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return (
      <LobbyView {...lobbyProps!} onLeft={onLeft} />
    )
  }

  if (!bootstrap.game || !board || !myRole) return <GameLoading />

  if (bootstrap.screen === 'finished' || board.winner) {
    const title = board.winner ? `${teamLabel(board.winner)} team wins!` : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title={batch7GameLabel('codewords')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={title} />
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
    <GameShell bootstrap={bootstrap} title="Codewords" subtitle={`${teamLabel(myRole.team)} ${roleLabel(myRole.role)} · ${bootstrap.code}`}>
      <TurnBanner
        text={`${bannerText}${secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}`}
        isMyTurn={canGiveClue || canGuess}
      />

      <View style={styles.scoreRow}>
        <Text style={styles.scoreRed}>Red {redRev}/{redTotal}</Text>
        <Text style={styles.scoreBlue}>Blue {blueRev}/{blueTotal}</Text>
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
          const disabled = !canGuess || isRevealed
          return (
            <Pressable
              key={index}
              style={[styles.cell, { backgroundColor: bg }, isRevealed && styles.cellRevealed]}
              disabled={disabled || acting}
              onPress={() => act(() => postCodewordsGuess(bootstrap.code, bootstrap.myResumeToken!, index))}
            >
              <Text style={styles.cellWord}>{word}</Text>
              {cellAttribution[index] ? (
                <Text style={styles.cellAttr}>{cellAttribution[index]}</Text>
              ) : null}
              {showKey && !isRevealed ? (
                <Text style={styles.cellKey}>{cellType[0].toUpperCase()}</Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>

      {canGiveClue ? (
        <View style={styles.formBlock}>
          <TextInput
            style={styles.input}
            value={clueWord}
            onChangeText={setClueWord}
            placeholder="Clue word"
            placeholderTextColor="#71717a"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.inputSmall}
            value={clueNumber}
            onChangeText={setClueNumber}
            placeholder="0-9"
            placeholderTextColor="#71717a"
            keyboardType="number-pad"
            maxLength={1}
          />
          <Pressable
            style={styles.actionBtn}
            disabled={acting || !clueWord.trim()}
            onPress={() => {
              const n = Number.parseInt(clueNumber.trim(), 10)
              if (Number.isNaN(n) || n < 0 || n > 9) return
              void act(async () => {
                await postCodewordsClue(bootstrap.code, bootstrap.myResumeToken!, clueWord.trim(), n)
                setClueWord('')
                setClueNumber('')
              })
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
          onPress={() => act(() => postCodewordsEndTurn(bootstrap.code, bootstrap.myResumeToken!))}
        >
          <Text style={styles.actionText}>End turn early</Text>
        </Pressable>
      ) : null}

      {isOperative ? (
        <>
          <Text style={styles.chatTitle}>Team chat</Text>
          <ScrollView style={styles.chatLog} nestedScrollEnabled>
            {teamMessages.map((m) => (
              <Text key={m.id} style={styles.chatLine}>
                <Text style={styles.chatName}>{playerNameById.get(m.player_id) ?? 'Player'}: </Text>
                {m.text}
              </Text>
            ))}
          </ScrollView>
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
    </GameShell>
  )
}

const CELL = 64

const styles = StyleSheet.create({
  pickHint: { color: '#a1a1aa', marginBottom: 12, textAlign: 'center' },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 },
  pickBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2a2a35',
    minWidth: 120,
  },
  pickBtnActive: { borderWidth: 2, borderColor: '#f43f5e' },
  pickBtnText: { color: '#fafafa', fontWeight: '700', textAlign: 'center' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  scoreRed: { color: '#fca5a5', fontWeight: '800' },
  scoreBlue: { color: '#93c5fd', fontWeight: '800' },
  clueCard: { backgroundColor: '#1e1e28', borderRadius: 8, padding: 12, marginBottom: 8 },
  clueLabel: { color: '#a1a1aa', fontSize: 12, fontWeight: '700' },
  clueWord: { color: '#fafafa', fontSize: 18, fontWeight: '900' },
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
  cellKey: { position: 'absolute', top: 2, right: 4, fontSize: 8, color: '#52525b', fontWeight: '800' },
  formBlock: { gap: 8, marginTop: 8 },
  input: {
    backgroundColor: '#2a2a35',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fafafa',
  },
  inputSmall: {
    backgroundColor: '#2a2a35',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fafafa',
    width: 80,
  },
  actionBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  endTurnBtn: { backgroundColor: '#52525b', marginTop: 8 },
  actionText: { color: '#fff', fontWeight: '800' },
  chatTitle: { color: '#a1a1aa', fontWeight: '700', marginTop: 12, marginBottom: 4 },
  chatLog: { maxHeight: 100, backgroundColor: '#1e1e28', borderRadius: 8, padding: 8 },
  chatLine: { color: '#d4d4d8', fontSize: 13, marginBottom: 4 },
  chatName: { color: '#fafafa', fontWeight: '700' },
  chatRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, marginBottom: 16 },
})
