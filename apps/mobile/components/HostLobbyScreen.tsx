import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game, Player } from '@fateround/shared'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { startGame, postPlayAgain, postFinishGame, removePlayerAsHost, checkFreshness } from '@/lib/game-api'
import { gameLabel } from '@/lib/mobile-registry'
import { GameInfoChips } from '@/components/GameInfoChips'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { HostLobbyPlayCard } from '@/components/host/HostLobbyPlayCard'
import { MissingPlayersPrompt } from '@/components/host/MissingPlayersPrompt'
import { IdleWarningBanner } from '@/components/host/IdleWarningBanner'
import { ReplayReadyRing } from '@/components/lifecycle/ReplayReadyRing'
import { HostLobbySettingsSheet } from '@/components/host/HostLobbySettingsSheet'
import { TransferHostSheet } from '@/components/host/TransferHostSheet'
import { AddBotButton } from '@/components/host/AddBotButton'
import { CodewordsHostLobby } from '@/components/host/lobby/CodewordsHostLobby'
import { TeamRosterHostLobby } from '@/components/host/lobby/TeamRosterHostLobby'
import { WordPoolLobbyEditor, supportsLobbyWordPool } from '@/components/host/lobby/WordPoolLobbyEditor'
import { clearPlayerSession, getPlayerSession, setPlayerSession, type PlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'
import { joinGame } from '@/lib/api'
import { clearSoloAutoStart, hasSoloAutoStart, setSoloAutoStart } from '@/lib/solo-auto-start'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useGamePlayerLimits } from '@/hooks/useGamePlayerLimits'
import { isLobbyLimitGameType } from '@fateround/shared/lobby-limits'
import { resolveLobbyMaxPlayers } from '@fateround/shared/game-limits-lite'
import { WORD_RUSH_MIN_PLAYERS_INDIVIDUAL } from '@fateround/shared/word-rush'
import { uniqueTopic } from '@/lib/realtime'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
}

/**
 * Generic host lobby. The host watches players arrive, shares the code, and starts
 * the game. Once active, HostGameScreen routes to the in-game host dashboard.
 */
export function HostLobbyScreen({ gameCode, hostToken }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  // Measured, not hardcoded — the pinned footer grows when Start shows an error,
  // and the floating voice pill has to keep clearing it.
  const [footerHeight, setFooterHeight] = useState(0)
  const [starting, setStarting] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Codewords "goes first" preference — ephemeral (sent to the start route, like
  // web). Owned here since the settings sheet is a separate modal.
  const [firstTeam, setFirstTeam] = useState<'random' | 'red' | 'blue'>('random')
  const [transferOpen, setTransferOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(true)
  const [hostSession, setHostSession] = useState<PlayerSession | null>(null)
  const hostPlayerId = hostSession?.playerId ?? null
  const resumeToken = hostSession?.resumeToken ?? null
  const { limits } = useGamePlayerLimits()

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!gameRes.error && gameRes.data) setGame(gameRes.data as Game)
    if (!playersRes.error) setPlayers((playersRes.data ?? []) as Player[])
    setLoading(false)
  }, [gameCode])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-lobby-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  // Re-read on change, not just on mount: rotating the player code from the share
  // sheet mints a new resume token, and ours authenticates the ready-up calls.
  useEffect(() => {
    const read = () => void getPlayerSession(gameCode).then((session) => setHostSession(session))
    read()
    return subscribePlayerSession(gameCode, read)
  }, [gameCode])

  const onSelfRemoved = useCallback(() => {
    void clearPlayerSession(gameCode)
    setHostSession(null)
  }, [gameCode])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)
  useHostPlayerReconciliation(players, hostPlayerId, onSelfRemoved)

  const onShare = useCallback(() => setShareOpen(true), [])

  const onEndLobby = useCallback(() => {
    Alert.alert('Close this lobby?', 'This ends the game for everyone. You can’t undo it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End lobby',
        style: 'destructive',
        onPress: () => {
          setEnding(true)
          setError(null)
          void postFinishGame(gameCode, hostToken)
            .then(() => router.replace('/'))
            .catch((e) => setError(e instanceof Error ? e.message : 'Could not end the lobby'))
            .finally(() => setEnding(false))
        },
      },
    ])
  }, [gameCode, hostToken, router])

  const [removingId, setRemovingId] = useState<string | null>(null)
  const confirmRemove = useCallback(
    (player: Player) => {
      Alert.alert('Remove player', `Remove ${player.name} from the game?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setRemovingId(player.id)
            setError(null)
            void removePlayerAsHost(gameCode, player.id, hostToken)
              .then(() => load())
              .catch((e) => setError(e instanceof Error ? e.message : 'Could not remove player'))
              .finally(() => setRemovingId(null))
          },
        },
      ])
    },
    [gameCode, hostToken, load]
  )

  const doStart = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      await startGame(gameCode, hostToken, firstTeam === 'random' ? undefined : firstTeam)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game')
    } finally {
      setStarting(false)
    }
  }, [gameCode, hostToken, load, firstTeam])

  const onStart = useCallback(async () => {
    if (game?.question_source !== 'platform') {
      await doStart()
      return
    }
    setStarting(true)
    try {
      const result = await checkFreshness(gameCode, hostToken)
      if (result.fresh) {
        setStarting(false)
        await doStart()
        return
      }
      setStarting(false)
      Alert.alert(
        result.seenPercent >= 95 ? 'Content exhausted' : 'Most content already played',
        result.seenPercent >= 95
          ? 'All available content has been seen by most players. Consider uploading your own or picking from the library.'
          : `${result.seenPercent}% of available content has been seen by most players. You can still start, or switch to fresh content.`,
        [
          { text: 'Start anyway', onPress: () => void doStart() },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    } catch {
      setStarting(false)
      await doStart()
    }
  }, [game?.question_source, gameCode, hostToken, doStart])

  const onPlayAgain = useCallback(async () => {
    setReplaying(true)
    setError(null)
    // Solo replay: a 1-seat game reopened with the same settings should skip the
    // lobby just like the initial create — arm the auto-start flag before the
    // reset lands (the effect below consumes it once the game re-enters
    // 'waiting'). Clear it on failure so a later manual retry doesn't
    // unexpectedly auto-start from a stale flag.
    const soloReplay = game?.max_players === 1
    try {
      if (soloReplay) await setSoloAutoStart(gameCode)
      await postPlayAgain(gameCode, hostToken, true, hostPlayerId)
      await load()
    } catch (e) {
      if (soloReplay) await clearSoloAutoStart(gameCode)
      setError(e instanceof Error ? e.message : 'Could not set up play again')
    } finally {
      setReplaying(false)
    }
  }, [gameCode, hostToken, load, hostPlayerId, game?.max_players])

  // Solo auto-start: honor the "Play solo" flag set on create (or a solo replay)
  // by first auto-seating the host as a player (a 1-seat game has no other
  // players) and then POSTing /start, so the host lands in gameplay without
  // touching the lobby. The ref resets whenever the game leaves 'waiting' so
  // the next lobby cycle (play-again) can fire again; the localStorage flag is
  // cleared on fire so a Return-to-lobby (which doesn't re-arm) never triggers
  // an unwanted start.
  const soloStartFiredRef = useRef(false)
  useEffect(() => {
    if (loading || !game) return
    if (game.status !== 'waiting') {
      soloStartFiredRef.current = false
      return
    }
    if (soloStartFiredRef.current) return
    if (game.max_players !== 1) return
    let cancelled = false
    void (async () => {
      const armed = await hasSoloAutoStart(gameCode)
      if (cancelled || !armed) return
      // Guard the effect's one-shot BEFORE the async gap widens — otherwise a
      // fast re-render (e.g. from the realtime subscribe below) could enter
      // this branch again while the seat/start requests are still in flight.
      soloStartFiredRef.current = true
      await clearSoloAutoStart(gameCode)
      try {
        // Seat first if we don't already have a session. The 1-seat cap is
        // the only reason auto-picking a name is safe — no one else can join.
        if (!hostPlayerId) {
          const data = await joinGame({ gameCode, playerName: 'You' })
          if (cancelled) return
          await setPlayerSession(
            gameCode,
            data.playerId,
            data.playerName,
            data.playerGender ?? 'both',
            data.resumeToken ?? null
          )
          setHostSession({
            playerId: data.playerId,
            playerName: data.playerName,
            playerGender: data.playerGender ?? 'both',
            resumeToken: data.resumeToken ?? null,
          })
        }
        await startGame(gameCode, hostToken)
        if (cancelled) return
        await load()
      } catch (e) {
        // Un-arm so the host can retry manually from the lobby.
        soloStartFiredRef.current = false
        setError(e instanceof Error ? e.message : 'Could not start solo game')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameCode, hostToken, loading, game, hostPlayerId, load])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    )
  }

  const activePlayers = players.filter((p) => !p.spectator)
  const finished = game?.status === 'finished'
  const replayLobby = game?.status === 'waiting' && game.replay_pending === true
  // Games where the host arranges teams/roles in the lobby (their own row is in it too).
  const hasTeamManagement =
    !!game &&
    !finished &&
    !replayLobby &&
    (game.game_type === 'codewords' ||
      (game.game_type === 'describe_it' && game.describe_it_mode !== 'individual') ||
      (game.game_type === 'word_rush' && game.word_rush_mode !== 'individual') ||
      (game.game_type === 'quick_draw' &&
        game.quick_draw_variant === 'guess' &&
        game.quick_draw_play_mode !== 'individual'))
  const hasWordPool = !!game && !finished && !replayLobby && supportsLobbyWordPool(game.game_type)
  const manageTitle =
    hasTeamManagement && hasWordPool ? 'Teams & pool' : hasTeamManagement ? 'Manage teams' : 'Question pool'
  const readyCount = activePlayers.length
  const gameType = game?.game_type
  // Seat cap + watcher split so the roster reads "Watching" (not "Not ready") once full,
  // and the count shows seated/max plus a separate watcher tally instead of a raw total.
  const maxPlayers = resolveLobbyMaxPlayers(gameType, game ?? { max_players: null })
  const watcherCount = players.length - activePlayers.length
  const seatsFull = maxPlayers != null && activePlayers.length >= maxPlayers
  const lobbyMin = gameType && isLobbyLimitGameType(gameType) ? limits[gameType].min : 1
  // Word Rush individual mode is solo-friendly (play by yourself); team mode keeps
  // the higher lobby minimum since it needs enough players to fill the teams.
  const minPlayers =
    gameType === 'word_rush' && game?.word_rush_mode === 'individual' ? WORD_RUSH_MIN_PLAYERS_INDIVIDUAL : lobbyMin
  const meetsMinimum = activePlayers.length >= minPlayers

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>Hosting</Text>
              {game ? (
                <View style={styles.typePill}>
                  <Text style={styles.typePillText}>{gameLabel(game.game_type)}</Text>
                </View>
              ) : null}
            </View>
            {game && !finished ? (
              <Pressable style={styles.gearBtn} onPress={() => setSettingsOpen(true)} hitSlop={8}>
                <Text style={styles.gearIcon}>⚙</Text>
              </Pressable>
            ) : null}
          </View>
          <GameInfoChips game={game} />
          <Text style={styles.title}>{game?.title || 'Game'}</Text>

          <Pressable style={styles.codeCard} onPress={onShare}>
            <Text style={styles.codeLabel}>Game code — tap for link & QR</Text>
            <Text style={styles.code}>{gameCode}</Text>
          </Pressable>

          {/* Not gated on hostPlayerId: a host-only viewer (not seated / "stopped
            playing") must still see the ring to watch players ready up and start.
            The ring is null-safe on myPlayerId, and isHost hides the ready toggle. */}
          {replayLobby ? (
            <ReplayReadyRing
              gameCode={gameCode}
              players={players}
              myPlayerId={hostPlayerId}
              myResumeToken={resumeToken}
              maxPlayers={maxPlayers}
              onReload={() => void load()}
              onRemovePlayer={confirmRemove}
              isHost
            />
          ) : null}

          {!finished ? (
            <HostLobbyPlayCard
              gameCode={gameCode}
              gameType={game?.game_type ?? 'trivia'}
              players={players}
              session={hostSession}
              onSessionChange={setHostSession}
              onReload={() => void load()}
              onTransfer={() => setTransferOpen(true)}
            />
          ) : null}

          {(hasTeamManagement || hasWordPool) && game ? (
            <View style={styles.manageCard}>
              <Pressable style={styles.manageHeader} onPress={() => setManageOpen((v) => !v)}>
                <Text style={styles.manageTitle}>{manageTitle}</Text>
                <Text style={styles.manageChevron}>{manageOpen ? '▾' : '▸'}</Text>
              </Pressable>
              {manageOpen ? (
                <View style={styles.manageBody}>
                  {hasTeamManagement ? (
                    game.game_type === 'codewords' ? (
                      <CodewordsHostLobby gameCode={gameCode} hostToken={hostToken} game={game} players={players} />
                    ) : (
                      <TeamRosterHostLobby gameCode={gameCode} hostToken={hostToken} game={game} players={players} />
                    )
                  ) : null}
                  {hasWordPool ? (
                    <WordPoolLobbyEditor
                      gameCode={gameCode}
                      hostToken={hostToken}
                      game={game}
                      onSaved={() => void load()}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {game && !finished && !replayLobby ? (
            <IdleWarningBanner game={game} gameCode={gameCode} hostToken={hostToken} onSaved={() => void load()} />
          ) : null}

          {game && !finished && !replayLobby ? (
            <MissingPlayersPrompt
              game={game}
              gameCode={gameCode}
              hostToken={hostToken}
              activePlayers={activePlayers.length}
              maxPlayers={maxPlayers}
              onSaved={() => void load()}
            />
          ) : null}

          {/* The ring already lists players (with Remove) during the replay lobby. */}
          {!replayLobby ? (
            <>
              <View style={styles.rosterHeader}>
                <Text style={styles.sectionTitle}>Players</Text>
                <View style={styles.countRow}>
                  <Text style={styles.count}>
                    {maxPlayers != null ? `${activePlayers.length} / ${maxPlayers}` : players.length}
                  </Text>
                  {watcherCount > 0 ? <Text style={styles.watchingCount}>{watcherCount} watching</Text> : null}
                </View>
              </View>

              {players.length === 0 ? (
                <Text style={styles.empty}>Waiting for players to join…</Text>
              ) : (
                players.map((p) => {
                  const isHost = p.id === hostPlayerId
                  const notReady = p.spectator === true
                  const isBot = p.is_bot === true
                  return (
                    <View key={p.id} style={styles.playerRow}>
                      <View style={styles.playerNameRow}>
                        <View style={[styles.readyDot, notReady && styles.readyDotOff]} />
                        <Text style={[styles.playerName, notReady && styles.playerNameDim]} numberOfLines={1}>
                          {isBot ? '🤖 ' : ''}
                          {p.name}
                          {isHost ? <Text style={styles.youTag}> · you</Text> : null}
                          {isBot ? <Text style={styles.notReadyTag}> · bot</Text> : null}
                          {notReady && !isBot ? (
                            <Text style={styles.notReadyTag}> · {seatsFull ? 'watching' : 'not ready'}</Text>
                          ) : null}
                        </Text>
                      </View>
                      {!isHost ? (
                        <Pressable onPress={() => confirmRemove(p)} disabled={removingId === p.id} hitSlop={8}>
                          {removingId === p.id ? (
                            <ActivityIndicator color={theme.error} />
                          ) : (
                            <Text style={styles.removeText}>Remove</Text>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  )
                })
              )}

              {/*
              Bots-in-room "+ Add bot" — mobile parity with the web
              AddBotButton. Only Whot + Monopoly admit bots today, and only
              during the fresh (waiting, non-replay) lobby. The button hides
              itself when seats are full or the (max-1) bot cap is hit.
            */}
              {(gameType === 'whot' || gameType === 'monopoly') && game?.status === 'waiting' && maxPlayers != null ? (
                <AddBotButton
                  gameCode={gameCode}
                  hostToken={hostToken}
                  seatedCount={activePlayers.length}
                  botCount={activePlayers.filter((p) => p.is_bot === true).length}
                  maxPlayers={maxPlayers}
                  onAdded={() => void load()}
                />
              ) : null}
            </>
          ) : null}

          {finished ? (
            <Text style={styles.finishedHint}>
              Game finished. Tap play again to reopen the lobby — players will ready up, then you start the next round.
            </Text>
          ) : replayLobby ? (
            <Text style={styles.replayHint}>
              Play again lobby open — {readyCount} player{readyCount === 1 ? '' : 's'} ready. Start when everyone is in.
            </Text>
          ) : null}
        </ScrollView>

        {/* Footer lives INSIDE the KeyboardAvoidingView so Start / End lobby lift
            with the ScrollView when a HostLobbyPlayCard TextInput is focused. Modal
            sheets below stay siblings (they render into their own window anyway). */}
        <View style={styles.footer} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
          {/* Error lives in the pinned footer, next to the Start button, so a failed
            Start is visible immediately (it used to render at the bottom of the
            scroll, out of view). */}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {finished ? (
            <Pressable
              style={[styles.startButton, replaying && styles.startButtonDisabled]}
              onPress={onPlayAgain}
              disabled={replaying}
            >
              {replaying ? (
                // White spinner on the solid rose Start button — correct in both schemes.
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.startButtonText}>Play again · same settings</Text>
              )}
            </Pressable>
          ) : replayLobby ? (
            <>
              {!meetsMinimum ? (
                <Text style={styles.minHint}>
                  Need at least {minPlayers} player{minPlayers === 1 ? '' : 's'} to start ({activePlayers.length}/
                  {minPlayers})
                </Text>
              ) : null}
              <Pressable
                style={[styles.startButton, (starting || !meetsMinimum) && styles.startButtonDisabled]}
                onPress={onStart}
                disabled={starting || !meetsMinimum}
              >
                {starting ? (
                  // White spinner on the solid rose Start button — correct in both schemes.
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.startButtonText}>Start next round</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {!meetsMinimum ? (
                <Text style={styles.minHint}>
                  Need at least {minPlayers} player{minPlayers === 1 ? '' : 's'} to start ({activePlayers.length}/
                  {minPlayers})
                </Text>
              ) : null}
              <Pressable
                style={[styles.startButton, (starting || !meetsMinimum) && styles.startButtonDisabled]}
                onPress={onStart}
                disabled={starting || !meetsMinimum}
              >
                {starting ? (
                  // White spinner on the solid rose Start button — correct in both schemes.
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.startButtonText}>Start game</Text>
                )}
              </Pressable>
            </>
          )}

          {!finished ? (
            <Pressable style={styles.endButton} onPress={onEndLobby} disabled={ending}>
              {ending ? <ActivityIndicator color={theme.error} /> : <Text style={styles.endButtonText}>End lobby</Text>}
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      <ShareGameSheet
        visible={shareOpen}
        gameCode={gameCode}
        hostToken={hostToken}
        resumeToken={resumeToken}
        onClose={() => setShareOpen(false)}
      />
      {game ? (
        <HostLobbySettingsSheet
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => void load()}
          firstTeam={firstTeam}
          onFirstTeamChange={setFirstTeam}
          onTransfer={() => {
            setSettingsOpen(false)
            setTransferOpen(true)
          }}
        />
      ) : null}
      <TransferHostSheet
        gameCode={gameCode}
        hostToken={hostToken}
        visible={transferOpen}
        onClose={() => setTransferOpen(false)}
      />
      {/* Floats over the screen, above the pinned Start/End footer. Mounted at
          the shell root — inside the ScrollView it would scroll away. The footer
          height is measured, not hardcoded: it grows when Start errors. */}
      {game ? <VoiceRail gameCode={gameCode} mode="host" hostToken={hostToken} bottomOffset={footerHeight} /> : null}
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    kav: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    gearBtn: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gearIcon: { color: theme.primaryMuted, fontSize: 20 },
    manageCard: { marginBottom: 8 },
    manageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    manageTitle: {
      color: theme.primary,
      fontSize: theme.type.caption.size,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    manageChevron: { color: theme.textMuted, fontSize: 16, fontWeight: '800' },
    manageBody: { gap: 12 },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { padding: 24, gap: 8, paddingBottom: 32, ...centeredContent },
    // Cancel the content's 24px horizontal padding so the voice bar spans edge to
    // edge like the pinned rails on the other chromes.
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flexWrap: 'wrap' },
    eyebrow: { color: theme.primary, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    typePill: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    typePillText: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    title: { color: theme.text, fontSize: 28, fontWeight: '800', marginBottom: 8 },
    codeCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      marginBottom: 16,
    },
    codeLabel: { color: theme.textMuted, fontSize: 13, marginBottom: 6 },
    code: { color: theme.text, fontSize: 40, fontWeight: '800', letterSpacing: 8 },
    rosterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sectionTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
    count: { color: theme.textMuted, fontSize: 16, fontWeight: '600' },
    countRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    watchingCount: {
      color: theme.textFaint,
      fontSize: theme.type.caption.size,
      fontWeight: '600',
      backgroundColor: theme.surface,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
    },
    empty: { color: theme.textFaint, fontSize: theme.type.body.size, paddingVertical: 12 },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    readyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success },
    // Muted "off" status dot — not a theme role; left as a neutral grey.
    readyDotOff: { backgroundColor: '#4b5563' },
    playerName: { color: theme.text, fontSize: 16, fontWeight: '500', flex: 1 },
    playerNameDim: { color: theme.textMuted },
    youTag: { color: theme.textFaint, fontSize: 13, fontWeight: '700' },
    notReadyTag: { color: theme.textFaint, fontSize: 13, fontWeight: '600' },
    removeText: { color: theme.error, fontSize: theme.type.label.size, fontWeight: '700' },
    finishedHint: {
      color: theme.textSecondary,
      fontSize: theme.type.label.size,
      lineHeight: 20,
      marginTop: 8,
      textAlign: 'center',
    },
    replayHint: {
      color: theme.primaryMuted,
      fontSize: theme.type.label.size,
      lineHeight: 20,
      marginTop: 8,
      textAlign: 'center',
    },
    error: { color: theme.error, fontSize: theme.type.label.size, textAlign: 'center' },
    footer: { padding: 24, borderTopColor: theme.surfaceHover, borderTopWidth: 1, gap: 10 },
    endButton: { paddingVertical: 12, alignItems: 'center' },
    endButtonText: { color: theme.error, fontSize: theme.type.body.size, fontWeight: '700' },
    minHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 12 },
    startButton: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    startButtonDisabled: { opacity: 0.5 },
    // White on the solid rose Start button — correct in both schemes.
    startButtonText: { color: '#fff', fontSize: theme.type.section.size, fontWeight: '600' },
  })
