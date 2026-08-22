import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game, Player } from '@fateround/shared'
import { playerIsViewer } from '@fateround/shared/viewers'
import { gameLabel } from '@/lib/mobile-registry'
import { removePlayerAsHost } from '@/lib/game-api'
import { publishHostPlayerId } from '@/lib/api'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { RosterDrawerProvider, type RosterRow } from '@/components/session/RosterDrawerContext'
import { RosterDrawer } from '@/components/session/RosterDrawer'
import { RosterButton } from '@/components/session/RosterButton'
import { TransferHostSheet } from '@/components/host/TransferHostSheet'
import { HostControlsSheet } from '@/components/host/HostControlsSheet'
import { PostJoinSubscribeNudge } from '@/components/notifications/PostJoinSubscribeNudge'
import { HostViewProvider } from '@/components/host/HostViewContext'
import { GameRouter, hasMobilePlayerView } from '@/components/games/GameRouter'
import { HeaderAction } from '@/components/ui/HeaderAction'
import { GearIcon } from '@/components/ui/SettingsSheet'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { getPlayerSession, type PlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  /** Legacy "Manage" tab content — used by host-run games (bingo, trivia, …). */
  children?: ReactNode
  /**
   * Play-first mode (games where the host plays like a player, e.g. Ayo/Whot):
   * no tab toggle, the game is always shown, and host controls live behind a
   * ⚙ Host button. Requires `players` + `onReload`.
   */
  playFirst?: boolean
  /**
   * Play-first ONLY once the host has taken a seat. For a host-run game that drives itself, so
   * a host who joined as a player gets the game rather than a read-only console. See below.
   */
  playFirstWhenSeated?: boolean
  players?: Player[]
  onReload?: () => void
}

export function HostChrome({
  gameCode,
  hostToken,
  game,
  children,
  playFirst,
  playFirstWhenSeated,
  players,
  onReload,
}: Props) {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const code = gameCode.toUpperCase()
  const typeLabel = gameLabel(game.game_type)
  const [shareOpen, setShareOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [session, setSession] = useState<PlayerSession | null>(null)
  const resumeToken = session?.resumeToken ?? null
  const hostPlayerId = session?.playerId ?? null

  // Re-read on change, not just on mount: rotating the player code from the share
  // sheet mints a new resume token, and ours authenticates host claim/ready calls.
  useEffect(() => {
    const read = () => void getPlayerSession(gameCode).then(setSession)
    read()
    return subscribePlayerSession(gameCode, read)
  }, [gameCode])

  // Publish the host's own player id so every client can badge the host in the roster
  // drawer (games.host_player_id) — parity with web's useHostSeat. Idempotent server-side.
  useEffect(() => {
    if (!hostPlayerId || !hostToken) return
    void publishHostPlayerId(gameCode, hostToken, hostPlayerId)
  }, [gameCode, hostToken, hostPlayerId])

  const canPlay = hasMobilePlayerView(game.game_type)
  const finished = game.status === 'finished'
  const seated = !!hostPlayerId
  /**
   * Seated AND still playing — not merely holding a row.
   *
   * The ⚙ sheet offers "Leave game (keep hosting)", which drops the host out of play but keeps
   * them in the roster as a VIEWER so they can watch and still run the game. Keying play-first
   * on `seated` alone would leave them on a read-only player view afterwards, with the console
   * — and Force advance, which the ⚙ sheet does not carry — unreachable. Someone who just chose
   * to stop playing is running the game, so give them the console back.
   */
  const hostRow = hostPlayerId ? (players ?? []).find((p) => p.id === hostPlayerId) : null
  const hostIsPlaying = !!hostRow && !playerIsViewer(hostRow, game)

  /**
   * Two host shapes, and no tab between them.
   *
   * `playFirst` games (Ayo, Whot, chess, …) render the board and put host controls behind the
   * ⚙ button. Host-run games (bingo, mafia, quick draw, …) render their control console as the
   * main screen, because the drive controls — call a number, advance the phase — ARE the
   * hosting job and must stay one tap away.
   *
   * `playFirstWhenSeated` is for the game that is neither: one whose host can take a seat and
   * then genuinely just play, because the game drives itself. Trivia is the case — rounds
   * auto-advance when everyone answers or the clock runs out, and the server ticker backs that
   * up, so a seated trivia host has nothing to drive. They tapped "Play along" and typed a
   * name; they should get the game, with the console behind ⚙ like every other game they play.
   *
   * NOT A TAB. An earlier version of this fix added a Play/Manage toggle here, which is exactly
   * what the comment this replaces ruled out — "no Play/Manage tab, so the drive controls are
   * always in reach". Reintroducing it made every host-run game carry a control the app doesn't
   * use anywhere else, to solve a problem only trivia had. One prop, one game, no new UI.
   */
  const playFirstNow = playFirst || (playFirstWhenSeated && hostIsPlaying)
  // A seated host still sees the shared finished screen at the end (winner + standings +
  // inline host actions); a host-only host falls back to the console's own finished controls.
  const showPlayView = canPlay && (playFirstNow || (finished && seated))
  // Keyed off showPlayView, NOT playFirstNow — these were an if/else before the play-first
  // change split them into two conditionals, and independent conditions let both be true at
  // once: a FINISHED game with a seated host on a console screen (bingo in manual mode, or
  // trivia after "Leave game (keep hosting)") rendered the player finish panel AND the console
  // stacked, with two Play again buttons.
  const showConsole = !showPlayView && !!children

  // The ⚙ Host controls sheet (settings, end game, play again) and the roster
  // drawer's Remove are available to any host screen that hands us the roster.
  const showHostControls = !!players && !!onReload

  // Guards against a second remove for the same row while one is in flight.
  const removingRef = useRef<Set<string>>(new Set())
  const removeRow = useCallback(
    (row: RosterRow) => {
      Alert.alert('Remove player', `Remove ${row.name} from the game?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (removingRef.current.has(row.id)) return
            removingRef.current.add(row.id)
            removePlayerAsHost(gameCode, row.id, hostToken)
              .then(() => onReload?.())
              .catch((err) => {
                Alert.alert('Could not remove player', err instanceof Error ? err.message : 'Please try again.')
              })
              .finally(() => removingRef.current.delete(row.id))
          },
        },
      ])
    },
    [gameCode, hostToken, onReload]
  )
  const manage = useMemo(
    () => (showHostControls ? { hostPlayerId, onRemove: removeRow } : null),
    [showHostControls, hostPlayerId, removeRow]
  )

  return (
    <RosterDrawerProvider fallbackPlayers={players} fallbackGame={game} myPlayerId={hostPlayerId} manage={manage}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeading}>
              <Pressable
                style={styles.backBtn}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                hitSlop={8}
              >
                <Text style={styles.backIcon}>←</Text>
              </Pressable>
              <RosterButton />
            </View>
            <View style={styles.toolbarActions}>
              {showHostControls ? (
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                  onPress={() => setControlsOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Host settings"
                >
                  <GearIcon color={theme.textSecondary} />
                </Pressable>
              ) : (
                <HeaderAction label="Transfer" onPress={() => setTransferOpen(true)} />
              )}
              <HeaderAction label="Share code" accent onPress={() => setShareOpen(true)} />
            </View>
          </View>

          <View style={styles.meta}>
            <Text style={styles.kicker}>Hosting</Text>
            <View style={styles.codeRow}>
              <Text style={styles.code}>{code}</Text>
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{typeLabel}</Text>
              </View>
              {game.content_label?.trim() ? (
                <View style={styles.labelPill}>
                  <Text style={styles.labelPillText} numberOfLines={1}>
                    🏷️ {game.content_label.trim()}
                  </Text>
                </View>
              ) : null}
            </View>
            {game.title ? (
              <Text style={styles.title} numberOfLines={2}>
                {game.title}
              </Text>
            ) : null}
          </View>
        </View>

        {showPlayView ? (
          <HostViewProvider value={{ hostToken, hostPlayerId, onReload: () => onReload?.() }}>
            <View style={styles.playBody}>
              <GameRouter gameCode={gameCode} gameType={game.game_type} />
            </View>
          </HostViewProvider>
        ) : null}
        {showConsole ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
            {/* The "want a ping when new <game> games open?" nudge web shows on every finished
              game. Mobile only had it inside `GameFinishPanel`, which is the PLAYER finish
              screen — a host watching their own game end never got the prompt. Gated on
              !showPlayView because the play view renders GameFinishPanel, which brings its own. */}
            {finished && !showPlayView ? <PostJoinSubscribeNudge gameType={game.game_type} /> : null}
          </ScrollView>
        ) : null}

        {/* Floats over the screen — mounted at the shell root (not in the scroll
          body, where it would scroll away). */}
        <VoiceRail gameCode={gameCode} mode="host" hostToken={hostToken} />
        <ShareGameSheet
          visible={shareOpen}
          gameCode={gameCode}
          hostToken={hostToken}
          resumeToken={resumeToken}
          onClose={() => setShareOpen(false)}
        />
        <TransferHostSheet
          gameCode={gameCode}
          hostToken={hostToken}
          visible={transferOpen}
          onClose={() => setTransferOpen(false)}
        />
        {showHostControls ? (
          <HostControlsSheet
            visible={controlsOpen}
            onClose={() => setControlsOpen(false)}
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            players={players ?? []}
            hostPlayerId={hostPlayerId}
            hostResumeToken={resumeToken}
            onReload={() => onReload?.()}
            onTransfer={() => {
              setControlsOpen(false)
              setTransferOpen(true)
            }}
          />
        ) : null}
        <RosterDrawer />
      </SafeAreaView>
    </RosterDrawerProvider>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    header: {
      borderBottomWidth: 1,
      borderBottomColor: theme.surfaceHover,
      paddingBottom: theme.space.md,
      gap: theme.space.md,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.md,
      paddingTop: theme.space.xs,
      gap: theme.space.sm,
    },
    toolbarLeading: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
    toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnPressed: { opacity: 0.7 },
    playBody: { flex: 1, ...centeredContent },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backIcon: { color: theme.text, fontSize: 20, fontWeight: '600' },
    meta: {
      paddingHorizontal: theme.space.lg,
      gap: 6,
    },
    kicker: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      flexWrap: 'wrap',
    },
    code: {
      color: theme.text,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: 3,
    },
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
    // Content-label pill ("Maths", "Bible trivia") — what the pack is about.
    labelPill: {
      flexShrink: 1,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    labelPillText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    title: {
      color: theme.textMuted,
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 22,
    },
    content: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40, ...centeredContent },
  })
