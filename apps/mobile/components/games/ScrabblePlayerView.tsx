import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player, ScrabblePlacedTile, ScrabblePlayerState, ScrabbleSession } from '@fateround/shared'
import { batch6GameLabel } from '@fateround/shared/batch-6-games'
import { SCRABBLE_BOARD_SIZE, scrabblePremiumAt } from '@fateround/shared/scrabble-constants'
import { currentTurnPlayerId, scorePlacement, withPlacedTiles } from '@fateround/shared/scrabble-board'
import { tileSetForDictionary } from '@fateround/shared/scrabble-rulesets'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import {
  postScrabbleExchange,
  postScrabbleExpireTurn,
  postScrabblePass,
  postScrabblePlay,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { SCRABBLE_PLAYER_STATE_SELECT, SCRABBLE_SESSION_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

type PendingTile = ScrabblePlacedTile & { rackIndex: number }

export function ScrabblePlayerView({ gameCode }: { gameCode: string }) {
  const [session, setSession] = useState<ScrabbleSession | null>(null)
  const [playerStates, setPlayerStates] = useState<ScrabblePlayerState[]>([])
  const [pending, setPending] = useState<PendingTile[]>([])
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(null)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [exchangeIndices, setExchangeIndices] = useState<number[]>([])
  const [acting, setActing] = useState(false)
  const [blankPicker, setBlankPicker] = useState<{ row: number; col: number; rackIndex: number } | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: ScrabbleSession | null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [sessionRes, statesRes] = await Promise.all([
        getSupabase().from('scrabble_sessions').select(SCRABBLE_SESSION_SELECT).eq('game_id', code).maybeSingle(),
        getSupabase()
          .from('scrabble_player_state')
          .select(SCRABBLE_PLAYER_STATE_SELECT)
          .eq('game_id', code)
          .order('player_order'),
      ])
      if (sessionRes.error || statesRes.error) return { state: null, ok: false }
      const sessionData = sessionRes.data as ScrabbleSession | null
      setSession(sessionData)
      setPlayerStates((statesRes.data as ScrabblePlayerState[]) ?? [])
      return { state: sessionData, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, ScrabbleSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'scrabble_sessions', 'scrabble_player_state'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const activeSession = session ?? bootstrap.gameState
  const myState = playerStates.find((s) => s.player_id === bootstrap.myPlayerId)
  const turnPlayerId = activeSession ? currentTurnPlayerId(activeSession) : null
  const isMyTurn = turnPlayerId === bootstrap.myPlayerId && !myState?.timed_out
  const tileSet = tileSetForDictionary(bootstrap.game?.scrabble_dictionary_id)

  const usedRackIndices = useMemo(() => new Set(pending.map((t) => t.rackIndex)), [pending])

  const previewBoard = useMemo(() => {
    if (!activeSession) return null
    return withPlacedTiles(activeSession.board, pending)
  }, [activeSession, pending])

  const placementPreview = useMemo(() => {
    if (!activeSession || pending.length === 0) return null
    return scorePlacement(activeSession.board, pending, tileSet.values)
  }, [activeSession, pending, tileSet.values])

  useEffect(() => {
    if (!activeSession || activeSession.phase !== 'playing') return
    if (activeSession.clock_mode !== 'standard' || !activeSession.turn_deadline_at) return
    const deadline = Date.parse(activeSession.turn_deadline_at)
    if (Number.isNaN(deadline) || Date.now() < deadline) return
    void postScrabbleExpireTurn(bootstrap.code).then(() => bootstrap.load()).catch(() => {})
  }, [activeSession?.turn_deadline_at, activeSession?.phase, activeSession?.clock_mode, bootstrap.code, bootstrap.load])

  const resetTurnUi = () => {
    setPending([])
    setSelectedRackIndex(null)
    setExchangeMode(false)
    setExchangeIndices([])
    setBlankPicker(null)
  }

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      resetTurnUi()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const placeAt = (row: number, col: number, letter: string, isBlank: boolean, rackIndex: number) => {
    setPending((prev) => [...prev.filter((t) => !(t.row === row && t.col === col)), { row, col, letter, isBlank, rackIndex }])
    setSelectedRackIndex(null)
    setBlankPicker(null)
  }

  const onCellPress = (row: number, col: number) => {
    if (!activeSession || !isMyTurn || acting || exchangeMode) return
    const existingPending = pending.find((t) => t.row === row && t.col === col)
    if (existingPending) {
      setPending((prev) => prev.filter((t) => !(t.row === row && t.col === col)))
      return
    }
    if (activeSession.board[row][col]) return
    if (selectedRackIndex == null || !myState) return
    const rackLetter = myState.rack[selectedRackIndex]
    if (!rackLetter) return
    if (rackLetter === '?') {
      setBlankPicker({ row, col, rackIndex: selectedRackIndex })
      return
    }
    placeAt(row, col, rackLetter, false, selectedRackIndex)
  }

  const onRackPress = (index: number, letter: string) => {
    if (!isMyTurn || acting) return
    if (exchangeMode) {
      setExchangeIndices((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
      )
      return
    }
    if (usedRackIndices.has(index)) return
    setSelectedRackIndex((prev) => (prev === index ? null : index))
  }

  const submitPlay = () => act(() => postScrabblePlay(bootstrap.code, bootstrap.myResumeToken!, pending))
  const submitPass = () => act(() => postScrabblePass(bootstrap.code, bootstrap.myResumeToken!))
  const submitExchange = () =>
    act(() => postScrabbleExchange(bootstrap.code, bootstrap.myResumeToken!, exchangeIndices))

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
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game || !activeSession || !previewBoard) return <GameLoading />

  if (bootstrap.screen === 'finished' || activeSession.phase === 'finished') {
    const winner = bootstrap.players.find((p) => p.id === activeSession.winner_player_id)
    const title = activeSession.is_tie ? 'Tie game!' : winner ? `${winner.name} wins!` : 'Game over'
    const scores = playerStates
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((s) => {
        const name = bootstrap.players.find((p) => p.id === s.player_id)?.name ?? 'Player'
        return `${name}: ${s.score}`
      })
      .join(' · ')
    return (
      <GameShell title={batch6GameLabel('scrabble')} subtitle={bootstrap.code}>
        <FinishedPanel title={title} detail={scores || activeSession.status_message || undefined} />
      </GameShell>
    )
  }

  const turnPlayer = bootstrap.players.find((p) => p.id === turnPlayerId)
  const canExchange = (activeSession.bag?.length ?? 0) >= 7

  return (
    <GameShell title="Scrabble" subtitle={`Code ${bootstrap.code}`}>
      <TurnBanner
        text={
          exchangeMode
            ? `Exchange mode — pick tiles (${exchangeIndices.length})`
            : pending.length > 0
              ? placementPreview?.valid
                ? `Preview +${placementPreview.score} (${placementPreview.words.join(', ')})`
                : placementPreview?.error ?? 'Place tiles on the board'
              : isMyTurn
                ? 'Your turn — pick a rack tile, then tap a square'
                : `${turnPlayer?.name ?? 'Player'}'s turn`
        }
        isMyTurn={isMyTurn}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.board}>
          {Array.from({ length: SCRABBLE_BOARD_SIZE }, (_, row) => (
            <View key={row} style={styles.boardRow}>
              {Array.from({ length: SCRABBLE_BOARD_SIZE }, (_, col) => {
                const prem = scrabblePremiumAt(row, col)
                const cell = previewBoard[row][col]
                const isPending = pending.some((t) => t.row === row && t.col === col)
                const isLast = activeSession.last_move?.tiles.some((t) => t.row === row && t.col === col)
                return (
                  <Pressable
                    key={col}
                    style={[
                      styles.cell,
                      prem === 'TW' && styles.tw,
                      prem === 'DW' && styles.dw,
                      prem === 'TL' && styles.tl,
                      prem === 'DL' && styles.dl,
                      isPending && styles.pendingCell,
                      isLast && styles.lastCell,
                    ]}
                    disabled={!isMyTurn || acting}
                    onPress={() => onCellPress(row, col)}
                  >
                    {!cell && prem ? <Text style={styles.premLabel}>{prem}</Text> : null}
                    {cell ? (
                      <Text style={styles.tileLetter}>{cell.letter}</Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.scoreRow}>
        {playerStates.map((s) => {
          const name = bootstrap.players.find((p) => p.id === s.player_id)?.name ?? '?'
          const active = s.player_id === turnPlayerId
          return (
            <Text key={s.player_id} style={[styles.scoreChip, active && styles.scoreActive]}>
              {name}: {s.score}
              {s.timed_out ? ' (out)' : ''}
            </Text>
          )
        })}
      </View>

      <View style={styles.rack}>
        {myState?.rack.map((letter, index) => {
          const used = usedRackIndices.has(index)
          const selected = selectedRackIndex === index
          const exchanging = exchangeIndices.includes(index)
          return (
            <Pressable
              key={index}
              style={[
                styles.rackTile,
                used && styles.rackUsed,
                selected && styles.rackSelected,
                exchanging && styles.rackExchange,
              ]}
              disabled={!isMyTurn || acting || (used && !exchangeMode)}
              onPress={() => onRackPress(index, letter)}
            >
              <Text style={styles.rackLetter}>{letter === '?' ? '?' : letter}</Text>
            </Pressable>
          )
        })}
      </View>

      {isMyTurn ? (
        <View style={styles.actions}>
          {!exchangeMode ? (
            <>
              <ActionBtn label="Recall" disabled={acting || pending.length === 0} onPress={() => setPending([])} />
              <ActionBtn
                label={`Play${placementPreview?.valid ? ` +${placementPreview.score}` : ''}`}
                primary
                disabled={acting || !placementPreview?.valid}
                onPress={() => void submitPlay()}
              />
              <ActionBtn label="Pass" disabled={acting} onPress={() => void submitPass()} />
              <ActionBtn
                label="Exchange"
                disabled={acting || !canExchange}
                onPress={() => {
                  setExchangeMode(true)
                  setPending([])
                  setSelectedRackIndex(null)
                }}
              />
            </>
          ) : (
            <>
              <ActionBtn label="Cancel" disabled={acting} onPress={() => setExchangeMode(false)} />
              <ActionBtn
                label="Confirm exchange"
                primary
                disabled={acting || exchangeIndices.length === 0}
                onPress={() => void submitExchange()}
              />
            </>
          )}
        </View>
      ) : null}

      <Modal visible={!!blankPicker} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.modalTitle}>Blank tile — choose letter</Text>
            <View style={styles.letterGrid}>
              {tileSet.alphabet.map((letter) => (
                <Pressable
                  key={letter}
                  style={styles.letterBtn}
                  onPress={() =>
                    blankPicker && placeAt(blankPicker.row, blankPicker.col, letter, true, blankPicker.rackIndex)
                  }
                >
                  <Text style={styles.letterBtnText}>{letter}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.promoCancel} onPress={() => setBlankPicker(null)}>
              <Text style={styles.promoCancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </GameShell>
  )
}

function ActionBtn({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <Pressable
      style={[styles.actionBtn, primary && styles.actionPrimary, disabled && styles.actionDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  )
}

const CELL = 22

const styles = StyleSheet.create({
  board: { alignSelf: 'center', borderWidth: 2, borderColor: '#2a2a35', marginVertical: 8 },
  boardRow: { flexDirection: 'row' },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c9b896',
    borderWidth: 0.5,
    borderColor: '#8b7355',
  },
  tw: { backgroundColor: '#dc2626' },
  dw: { backgroundColor: '#f472b6' },
  tl: { backgroundColor: '#2563eb' },
  dl: { backgroundColor: '#38bdf8' },
  pendingCell: { borderWidth: 2, borderColor: '#22c55e' },
  lastCell: { backgroundColor: '#fde68a' },
  premLabel: { fontSize: 7, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  tileLetter: { fontSize: 14, fontWeight: '900', color: '#171717' },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  scoreChip: { color: '#a1a1aa', fontWeight: '600', fontSize: 13 },
  scoreActive: { color: '#fafafa' },
  rack: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginVertical: 8 },
  rackTile: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#f5e6c8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#8b7355',
  },
  rackUsed: { opacity: 0.35 },
  rackSelected: { borderColor: '#f43f5e' },
  rackExchange: { borderColor: '#38bdf8' },
  rackLetter: { fontSize: 16, fontWeight: '900', color: '#171717' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2a2a35',
  },
  actionPrimary: { backgroundColor: '#f43f5e' },
  actionDisabled: { opacity: 0.45 },
  actionText: { color: '#fafafa', fontWeight: '700', fontSize: 13 },
  actionTextPrimary: { color: '#fff' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalScroll: { backgroundColor: '#1e1e28', borderRadius: 12, padding: 16 },
  modalTitle: { color: '#fafafa', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  letterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  letterBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2a2a35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBtnText: { color: '#fafafa', fontWeight: '800', fontSize: 16 },
  promoCancel: { padding: 12, marginTop: 8 },
  promoCancelText: { color: '#a1a1aa', textAlign: 'center' },
})
