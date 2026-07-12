import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Round, type WordSearchFound } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildFoundOwnerGrid,
  buildPlayerFoundCells,
  parseWordSearchMetadata,
  placementCells,
  playerFoundWords,
  tallyWordSearchScores,
  wordSearchCompletionPercent,
  WORD_SEARCH_HINT_PENALTY,
  type WordSearchMetadata,
  type WordSearchPlacement,
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
import { postWordSearchFound, fetchWordSearchSolution } from '@/lib/game-api'
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
  const [previewWord, setPreviewWord] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const [placements, setPlacements] = useState<WordSearchPlacement[] | null>(null)

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const loadGameState = useCallback(
    async (game: Game): Promise<{ state: boolean; ok: boolean }> => {
      if (game.status !== 'active') {
        // Don't null the metadata here. On the finished screen every realtime
        // reload runs through this branch, and blanking metadata mid-reload
        // empties `standings` (points → 0 → winnerId → null), which flips the
        // finish title to "Game over" until afterResolve restores it — the
        // title flickers between "Game over" and "<name> wins!". Leave whatever
        // metadata we have; afterResolve refetches it for the finished screen.
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
        // Fetch round + finds together and commit both in the same tick so the
        // finished screen never renders with metadata set but finds empty
        // (which would zero the standings and flash the "Game over" title).
        const [roundRes, rowsRes] = await Promise.all([
          getSupabase()
            .from('rounds')
            .select(ROUND_SELECT)
            .eq('game_id', gameCode.toUpperCase())
            .eq('round_number', 1)
            .maybeSingle(),
          getSupabase()
            .from('word_search_found')
            .select(WORD_SEARCH_FOUND_SELECT)
            .eq('game_id', gameCode.toUpperCase()),
        ])
        const meta = roundRes.data ? parseWordSearchMetadata((roundRes.data as Round).word_search_metadata) : null
        if (meta) setMetadata(meta)
        setFound((rowsRes.data as WordSearchFound[]) ?? [])
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

  // Fetch the answer key once the hunt is over (routes gate on finished + service role).
  useEffect(() => {
    if (bootstrap.game?.status !== 'finished' || placements) return
    let cancelled = false
    void fetchWordSearchSolution(gameCode).then((p) => {
      if (!cancelled && p) setPlacements(p)
    })
    return () => {
      cancelled = true
    }
  }, [bootstrap.game?.status, gameCode, placements])

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

  // Individual-board race: the word list must match the board on screen — my finds while
  // playing, the watched player's finds while viewing. Using every player's finds would
  // strike words off my list the moment anyone else found them, hiding my own progress.
  const wordOwners = useMemo(() => {
    const owners = new Map<string, string>()
    if (boardPlayerId) {
      for (const w of playerFoundWords(found, boardPlayerId)) owners.set(w, boardPlayerId)
    }
    return owners
  }, [found, boardPlayerId])

  // Words for the top strip: unfound first, found pushed to the end, then chunked into
  // columns of two so they lay out in two horizontally-scrolling rows.
  const wordColumns = useMemo(() => {
    const todo: string[] = []
    const done: string[] = []
    for (const w of metadata?.words ?? []) (wordOwners.has(w) ? done : todo).push(w)
    const ordered = [...todo, ...done]
    const cols: string[][] = []
    for (let i = 0; i < ordered.length; i += 2) cols.push(ordered.slice(i, i + 2))
    return cols
  }, [metadata, wordOwners])

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
    // `standings` is already sorted best-first with full tiebreaks (points → words →
    // name), so its leader is the winner. Declare them the winner whenever they found
    // at least one word — net points can dip to/below 0 after hint penalties, and a
    // real winner shouldn't collapse to "Game over". Only a hunt where nobody found
    // anything falls back to "Game over".
    const leader = standings[0]
    const winnerId = leader && leader.wordsFound > 0 ? leader.player_id : null
    const answerCells =
      placements && metadata
        ? (() => {
            const g = metadata.grid.map((r) => r.map(() => false))
            for (const p of placements) {
              for (const [r, c] of placementCells(p)) {
                if (g[r]) g[r][c] = true
              }
            }
            return g
          })()
        : null
    const answersNotice =
      answerCells && metadata ? (
        <View style={styles.answersCard}>
          <Text style={styles.answersTitle}>Answer key</Text>
          <WordSearchBoardView metadata={metadata} myFoundCells={answerCells} readOnly />
          <View style={styles.answerChips}>
            {placements!.map((p) => (
              <View key={p.word} style={styles.answerChip}>
                <Text style={styles.answerChipText}>{p.word}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('word_search')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${leader!.name} wins!` : 'Game over'}
          subtitle="Final standings"
          leaderboard={pointsLeaderboard(entries, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
          roundKey={bootstrap.game?.session_started_at ?? undefined}
          notice={answersNotice}
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
                        style={[
                          styles.watchChipDot,
                          { backgroundColor: playerColors[p.id] ?? wordSearchPlayerColor(0) },
                        ]}
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

            {!viewing ? (
              <View style={styles.wordStrip}>
                <View style={styles.wordStripHeader}>
                  <Text style={styles.wordStripTitle}>Words to find</Text>
                  <Text style={styles.wordStripCount}>
                    {myFoundWordSet.size}/{metadata.words.length}
                  </Text>
                </View>
                <View style={styles.wordStripRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.wordStripScroll}
                    contentContainerStyle={styles.wordStripScrollContent}
                  >
                    {wordColumns.map((col, ci) => (
                      <View key={ci} style={styles.wordStripCol}>
                        {col.map((word) => (
                          <Text
                            key={word}
                            numberOfLines={1}
                            style={[styles.stripWord, wordOwners.has(word) && styles.stripWordFound]}
                          >
                            {word}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                  <Pressable
                    style={[styles.revealIcon, (submitting || allWordsFound) && styles.revealBtnDisabled]}
                    disabled={submitting || allWordsFound}
                    onPress={handleReveal}
                    accessibilityLabel="Reveal a hidden word"
                  >
                    <Text style={styles.revealIconText}>💡</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {!viewing ? (
              allWordsFound ? (
                <View style={styles.doneBanner}>
                  <Text style={styles.doneTitle}>🎉 All words found!</Text>
                  <Text style={styles.doneSub}>
                    Nicely done — waiting for the other players
                    {bootstrap.game?.game_duration_seconds ? ' or the timer' : ''} to finish.
                  </Text>
                </View>
              ) : (
                <View style={styles.previewBar}>
                  <Text style={styles.previewText}>{previewWord || 'Drag across the letters to spell a word'}</Text>
                </View>
              )
            ) : null}

            <WordSearchBoardView
              metadata={metadata}
              cellOwners={cellOwners}
              myFoundCells={myFoundCells}
              playerColors={playerColors}
              myPlayerId={boardPlayerId}
              onSelect={handleSelect}
              onDragActiveChange={setDragActive}
              onPreviewChange={setPreviewWord}
              readOnly={viewing}
            />

            {viewing ? (
              <Text style={styles.viewingHint}>You are watching — tap a name above to switch boards.</Text>
            ) : (
              <Text style={styles.hintHelp}>Press a word&apos;s first letter and drag to its last letter.</Text>
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
    previewBar: {
      alignSelf: 'center',
      minHeight: 40,
      minWidth: 160,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewText: { color: theme.text, fontSize: 20, fontWeight: '800', letterSpacing: 3 },
    doneBanner: {
      alignSelf: 'stretch',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      gap: 2,
    },
    doneTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
    doneSub: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    hintHelp: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    revealBtnDisabled: { opacity: 0.4 },
    // Compact word strip that sits above the board (two rows, horizontal scroll).
    wordStrip: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 6,
    },
    wordStripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    wordStripTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    wordStripCount: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    wordStripRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    wordStripScroll: { flex: 1 },
    wordStripScrollContent: { flexDirection: 'row', gap: 14, paddingRight: 8 },
    wordStripCol: { gap: 2 },
    stripWord: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
    stripWordFound: { color: WORD_SEARCH_MY_CELL_COLOR, textDecorationLine: 'line-through', opacity: 0.7 },
    revealIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(245,158,11,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.35)',
    },
    revealIconText: { fontSize: 17 },
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
    answersCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
      gap: 10,
      alignItems: 'center',
    },
    answersTitle: {
      alignSelf: 'flex-start',
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    answerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    answerChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.surfaceHover,
    },
    answerChipText: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
  })
