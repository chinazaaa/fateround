import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Round, type WordSearchFound } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildFoundOwnerGrid,
  buildPlayerFoundCells,
  parseWordSearchMetadata,
  playerFoundWords,
  tallyWordSearchScores,
  wordSearchCompletionPercent,
  WORD_SEARCH_HINT_PENALTY,
  type WordSearchMetadata,
} from '@fateround/shared/word-search'
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { WordSearchBoardView } from '@/components/games/word-search/WordSearchBoardView'
import { WordSearchGameTimerBar } from '@/components/games/word-search/WordSearchGameTimerBar'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWordSearchFound } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, WORD_SEARCH_FOUND_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import {
  wordSearchPlayerColor,
  formatMinutesSeconds,
  getPlayerTimeSpent,
  ordinal,
  WORD_SEARCH_MY_CELL_COLOR,
} from '@/components/games/word-search/standings'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function WordSearchPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [metadata, setMetadata] = useState<WordSearchMetadata | null>(null)
  const [found, setFound] = useState<WordSearchFound[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const loadGameState = useCallback(
    async (game: Game): Promise<{ state: boolean; ok: boolean }> => {
      if (game.status !== 'active') {
        setMetadata(null)
        return { state: false, ok: true }
      }
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { state: false, ok: true }
      const meta = parseWordSearchMetadata((roundData as Round).word_search_metadata)
      if (!meta) return { state: false, ok: true }
      setMetadata(meta)
      return { state: true, ok: true }
    },
    [gameCode]
  )

  const bootstrap = useGameViewBootstrap<Screen, boolean>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState: (game, _players) => loadGameState(game),
    computeScreen: (game, playerId, state) => {
      if (game.status === 'finished') return 'finished'
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      return state ? 'playing' : 'waiting'
    },
    afterResolve: async (game, playerId) => {
      // Finished games show the leaderboard to everyone; active games load the round's finds.
      if (game.status === 'finished') {
        const { data: roundData } = await getSupabase()
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode.toUpperCase())
          .eq('round_number', 1)
          .maybeSingle()
        const meta = roundData ? parseWordSearchMetadata((roundData as Round).word_search_metadata) : null
        if (meta) setMetadata(meta)
        const { data: rows } = await getSupabase()
          .from('word_search_found')
          .select(WORD_SEARCH_FOUND_SELECT)
          .eq('game_id', gameCode.toUpperCase())
        setFound((rows as WordSearchFound[]) ?? [])
        return
      }
      if (!playerId || game.status !== 'active') return
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return
      const { data: rows } = await getSupabase()
        .from('word_search_found')
        .select(WORD_SEARCH_FOUND_SELECT)
        .eq('round_id', roundData.id)
      setFound((rows as WordSearchFound[]) ?? [])
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'word_search_found'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  // Tick once a second while playing so the live time column stays fresh.
  useEffect(() => {
    if (bootstrap.screen !== 'playing') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bootstrap.screen])

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const viewing = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const activePlayers = useMemo(() => bootstrap.players.filter((p) => p.spectator !== true), [bootstrap.players])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = wordSearchPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const cellOwners = useMemo(() => (metadata ? buildFoundOwnerGrid(metadata, found) : []), [metadata, found])

  const standings = useMemo(
    () => (metadata ? tallyWordSearchScores(metadata, found, bootstrap.players) : []),
    [metadata, found, bootstrap.players]
  )

  const myRank = standings.findIndex((r) => r.player_id === bootstrap.myPlayerId) + 1
  const myCompletion =
    metadata && bootstrap.myPlayerId ? wordSearchCompletionPercent(metadata, found, bootstrap.myPlayerId) : 0
  const myFoundWordSet = useMemo(
    () => (bootstrap.myPlayerId ? playerFoundWords(found, bootstrap.myPlayerId) : new Set<string>()),
    [found, bootstrap.myPlayerId]
  )
  const allWordsFound = !!metadata && myFoundWordSet.size >= metadata.words.length

  // Viewer watches one active player's personal board (their found cells filled).
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    standings.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = bootstrap.players.find((p) => p.id === effectiveWatchedId)
  const watchedCompletion =
    metadata && effectiveWatchedId ? wordSearchCompletionPercent(metadata, found, effectiveWatchedId) : 0

  const boardPlayerId = viewing ? effectiveWatchedId : bootstrap.myPlayerId
  const myFoundCells = useMemo(
    () => (metadata && boardPlayerId ? buildPlayerFoundCells(metadata, found, boardPlayerId) : undefined),
    [metadata, found, boardPlayerId]
  )

  // First finder per word (earliest found), for word-list colouring.
  const wordOwners = useMemo(() => {
    const owners = new Map<string, string>()
    const sorted = [...found].sort((a, b) => new Date(a.found_at).getTime() - new Date(b.found_at).getTime())
    for (const f of sorted) if (!owners.has(f.word)) owners.set(f.word, f.player_id)
    return owners
  }, [found])

  // Surface the difficulty as a header pill during play instead of a floating subtitle.
  const difficultyLabel = metadata?.difficulty
    ? metadata.difficulty.charAt(0).toUpperCase() + metadata.difficulty.slice(1)
    : null
  useHeaderBadge(bootstrap.screen === 'playing' && difficultyLabel ? difficultyLabel : null)

  const submitSelection = async (start: [number, number], end: [number, number], hint: boolean) => {
    if (!bootstrap.myResumeToken || !bootstrap.myPlayerId || viewing) return
    if (hint) setSubmitting(true)
    try {
      const result = await postWordSearchFound(
        bootstrap.code,
        bootstrap.myResumeToken,
        start[0],
        start[1],
        end[0],
        end[1],
        hint
      )
      if (result.found) {
        if (result.alreadyFound) showToast(`Already found ${result.word}`, true)
        else if (hint) showToast(`Revealed ${result.word} · ${WORD_SEARCH_HINT_PENALTY} pts`, false)
        else showToast(`Found ${result.word}!`, true)
        // Optimistically highlight the word right away — otherwise it doesn't appear until
        // the refetch below finishes (two round-trips), which reads as a lag.
        const pid = bootstrap.myPlayerId
        if (pid && result.word && result.start && result.end && !result.alreadyFound) {
          const [sr, sc] = result.start
          const [er, ec] = result.end
          const word = result.word
          setFound((prev) =>
            prev.some((f) => f.player_id === pid && f.word === word)
              ? prev
              : [
                  ...prev,
                  {
                    id: `optimistic-${word}`,
                    game_id: bootstrap.code,
                    round_id: '',
                    player_id: pid,
                    word,
                    start_row: sr,
                    start_col: sc,
                    end_row: er,
                    end_col: ec,
                    via_hint: hint,
                    found_at: new Date().toISOString(),
                  },
                ]
          )
        }
      } else if (!hint) {
        showToast('No hidden word there', false)
      }
      await bootstrap.load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      // Timer expiry (or a finish race) flips the game — refetch to land on results.
      if (msg.toLowerCase().includes('time')) await bootstrap.load()
      else showToast(msg, false)
    } finally {
      if (hint) setSubmitting(false)
    }
  }

  const handleSelect = (start: [number, number], end: [number, number]) => {
    void submitSelection(start, end, false)
  }

  const handleReveal = () => {
    if (viewing || submitting || allWordsFound) return
    Alert.alert(
      'Reveal a word?',
      `Fills in one of the remaining words for a ${WORD_SEARCH_HINT_PENALTY}-point penalty.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reveal word',
          onPress: () => {
            // The server picks a random unfound word; the endpoints are ignored for hints.
            void submitSelection([0, 0], [0, 0], true)
          },
        },
      ]
    )
  }

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
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const entries = bootstrap.players
      .filter((p) => !p.spectator)
      .map((p) => {
        const row = standings.find((r) => r.player_id === p.id)
        const pct = metadata ? wordSearchCompletionPercent(metadata, found, p.id) : 0
        const timeSecs = getPlayerTimeSpent(bootstrap.game, found, p.id, pct, nowMs, p.joined_at)
        return {
          id: p.id,
          name: p.name,
          points: row?.points ?? 0,
          detail: bootstrap.game?.session_started_at ? `⏱ ${formatMinutesSeconds(timeSecs)}` : undefined,
        }
      })
    const top = [...entries].sort((a, b) => b.points - a.points)[0]
    const winnerId = top && top.points > 0 ? top.id : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('word_search')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${top!.name} wins!` : 'Game over'}
          subtitle="Final standings"
          leaderboard={pointsLeaderboard(entries, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
          roundKey={bootstrap.game?.session_started_at ?? undefined}
        />
      </GameShell>
    )
  }

  const headerName = viewing ? (watchedPlayer?.name ?? 'Player') : (me?.name ?? 'Me')
  const headerCompletion = viewing ? watchedCompletion : myCompletion

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('word_search')} subtitle={bootstrap.code}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!dragActive}>
        <WordSearchGameTimerBar gameCode={bootstrap.code} game={bootstrap.game} />

        {toast ? (
          <View style={[styles.toast, toast.ok ? styles.toastOk : styles.toastBad]}>
            <Text style={styles.toastText}>{toast.msg}</Text>
          </View>
        ) : null}

        {/* Viewer player-picker: switch whose board you're watching. */}
        {viewing ? (
          activePlayers.length > 0 ? (
            <View style={styles.watchCard}>
              <Text style={styles.watchLabel}>Watching a player&apos;s board</Text>
              <View style={styles.watchChips}>
                {activePlayers.map((p) => {
                  const active = p.id === effectiveWatchedId
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.watchChip, active && styles.watchChipActive]}
                      onPress={() => setWatchedPlayerId(p.id)}
                    >
                      <View
                        style={[styles.watchChipDot, { backgroundColor: playerColors[p.id] ?? wordSearchPlayerColor(0) }]}
                      />
                      <Text style={[styles.watchChipText, active && styles.watchChipTextActive]} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : (
            <Text style={styles.waiting}>
              No players have joined the puzzle yet — pick a player to watch once they do.
            </Text>
          )
        ) : null}

        {!metadata ? (
          <Text style={styles.waiting}>Waiting for puzzle…</Text>
        ) : (
          <>
            {/* Status header (mine, or the watched player's) */}
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <View style={[styles.swatch, { backgroundColor: WORD_SEARCH_MY_CELL_COLOR }]} />
                <View>
                  <Text style={styles.statusName}>{headerName}</Text>
                  <Text style={styles.statusMeta}>
                    {!viewing && myRank > 0 ? `${ordinal(myRank)} · ` : ''}
                    {headerCompletion}%
                  </Text>
                </View>
              </View>
              {bootstrap.game?.session_started_at ? (
                <View style={styles.timePill}>
                  <Text style={styles.timePillText}>
                    ⏱{' '}
                    {formatMinutesSeconds(
                      getPlayerTimeSpent(
                        bootstrap.game,
                        found,
                        (viewing ? effectiveWatchedId : bootstrap.myPlayerId) || '',
                        headerCompletion,
                        nowMs,
                        (viewing ? watchedPlayer : me)?.joined_at
                      )
                    )}
                  </Text>
                </View>
              ) : null}
            </View>

            <WordSearchBoardView
              metadata={metadata}
              cellOwners={cellOwners}
              myFoundCells={myFoundCells}
              playerColors={playerColors}
              myPlayerId={boardPlayerId}
              onSelect={handleSelect}
              onDragActiveChange={setDragActive}
              readOnly={viewing}
            />

            {viewing ? (
              <Text style={styles.viewingHint}>You are watching — tap a name above to switch boards.</Text>
            ) : (
              <>
                <View style={styles.hintRow}>
                  <Text style={styles.hintHelp}>Press a word&apos;s first letter and drag to its last letter.</Text>
                  <Pressable
                    style={[styles.revealBtn, (submitting || allWordsFound) && styles.revealBtnDisabled]}
                    disabled={submitting || allWordsFound}
                    onPress={handleReveal}
                  >
                    <Text style={styles.revealText}>💡 Reveal</Text>
                  </Pressable>
                </View>

                {/* Word list — struck through as words are found, coloured to first finder. */}
                <View style={styles.wordList}>
                  {metadata.words.map((word) => {
                    const owner = wordOwners.get(word)
                    const foundByMe = myFoundWordSet.has(word)
                    const color = owner
                      ? owner === bootstrap.myPlayerId
                        ? WORD_SEARCH_MY_CELL_COLOR
                        : playerColors[owner] ?? wordSearchPlayerColor(0)
                      : null
                    return (
                      <View
                        key={word}
                        style={[
                          styles.wordChip,
                          owner ? { borderColor: color ?? undefined, backgroundColor: `${color}22` } : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.wordChipText,
                            owner && styles.wordChipTextFound,
                            foundByMe && { color: color ?? undefined },
                          ]}
                        >
                          {word}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </>
            )}

            {/* Live standings */}
            {standings.length > 0 ? (
              <View style={styles.standings}>
                {standings.map((rowData, i) => {
                  const pct = metadata ? wordSearchCompletionPercent(metadata, found, rowData.player_id) : 0
                  const color = playerColors[rowData.player_id] ?? wordSearchPlayerColor(0)
                  const timeSecs = getPlayerTimeSpent(
                    bootstrap.game,
                    found,
                    rowData.player_id,
                    pct,
                    nowMs,
                    activePlayers.find((p) => p.id === rowData.player_id)?.joined_at
                  )
                  const isMe = rowData.player_id === bootstrap.myPlayerId
                  return (
                    <View key={rowData.player_id} style={[styles.standRow, isMe && styles.standRowMe]}>
                      <View style={[styles.swatchSm, { backgroundColor: color }]} />
                      <View style={styles.standInfo}>
                        <Text style={styles.standName} numberOfLines={1}>
                          {rowData.name}
                        </Text>
                        <Text style={styles.standMeta} numberOfLines={1}>
                          {ordinal(i + 1)} of {standings.length} · {rowData.wordsFound} words · {pct}%
                          {bootstrap.game?.session_started_at ? ` · ⏱ ${formatMinutesSeconds(timeSecs)}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.standPoints}>{rowData.points} pts</Text>
                    </View>
                  )
                })}
              </View>
            ) : null}
          </>
        )}

        <View style={styles.rulesRow}>
          <GameRulesLink gameType="word_search" variant="subtle" />
        </View>
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    waiting: { color: theme.textMuted, textAlign: 'center', marginTop: 24 },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 2,
    },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    swatch: { width: 16, height: 16, borderRadius: 4 },
    statusName: { color: theme.text, fontWeight: '700', fontSize: 15 },
    statusMeta: { color: theme.textMuted, fontSize: 13, marginTop: 1 },
    timePill: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    timePillText: { color: theme.textMuted, fontWeight: '600', fontSize: 13 },
    watchCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    watchLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    watchChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    watchChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    watchChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    watchChipDot: { width: 10, height: 10, borderRadius: 3 },
    watchChipText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', maxWidth: 120 },
    watchChipTextActive: { color: '#fff' },
    viewingHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 12 },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    hintHelp: { flex: 1, minWidth: 0, color: theme.textMuted, fontSize: 13 },
    revealBtn: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: 'rgba(245,158,11,0.15)',
    },
    revealBtnDisabled: { opacity: 0.4 },
    revealText: { color: '#b45309', fontWeight: '800', fontSize: 13 },
    wordList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    wordChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    wordChipText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
    wordChipTextFound: { textDecorationLine: 'line-through' },
    toast: {
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
    },
    toastOk: { backgroundColor: '#10b981' },
    toastBad: { backgroundColor: '#ef4444' },
    toastText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    standings: { marginTop: 20, gap: 8 },
    standRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: theme.surfaceHover,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    standRowMe: { borderColor: theme.border, backgroundColor: theme.surface },
    standInfo: { flex: 1, minWidth: 0 },
    standName: { color: theme.text, fontWeight: '600', fontSize: 14 },
    standMeta: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
    standPoints: { color: theme.text, fontWeight: '700', fontSize: 14 },
    swatchSm: { width: 12, height: 12, borderRadius: 3 },
    rulesRow: { alignItems: 'center', marginTop: 16 },
  })
