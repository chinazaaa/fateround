import { ReactNode, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game, Player } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { gameHasMobileVoice } from '@/lib/voice-games'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { TransferHostSheet } from '@/components/host/TransferHostSheet'
import { HostControlsSheet } from '@/components/host/HostControlsSheet'
import { HostViewProvider } from '@/components/host/HostViewContext'
import { GameRouter, hasMobilePlayerView } from '@/components/games/GameRouter'
import { HeaderAction } from '@/components/ui/HeaderAction'
import { SettingsButton } from '@/components/ui/SettingsSheet'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { getPlayerSession, type PlayerSession } from '@/lib/secure-session'

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
  players?: Player[]
  onReload?: () => void
}

type HostTab = 'manage' | 'play'

export function HostChrome({ gameCode, hostToken, game, children, playFirst, players, onReload }: Props) {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const code = gameCode.toUpperCase()
  const typeLabel = gameLabel(game.game_type)
  const [shareOpen, setShareOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [session, setSession] = useState<PlayerSession | null>(null)
  // Legacy tabs (host-run games like bingo/trivia): default to their Manage
  // control surface. Play-along games use playFirst and never see these tabs.
  const [tab, setTab] = useState<HostTab>('manage')
  const resumeToken = session?.resumeToken ?? null
  const hostPlayerId = session?.playerId ?? null

  useEffect(() => {
    void getPlayerSession(gameCode).then(setSession)
  }, [gameCode])

  // Play tab embeds the host's own player experience (join screen if not seated yet).
  const canPlay = hasMobilePlayerView(game.game_type)
  // When the game is over, show the shared finished screen (winner + standings +
  // inline host actions) rather than the in-game Manage controls (e.g. bingo's
  // number caller) or the Play/Manage tabs. Requires the host to be seated as a
  // player; a host-only host falls back to the game's own finished controls.
  const finished = game.status === 'finished'
  const seated = !!hostPlayerId
  const showPlayView = canPlay && (playFirst || tab === 'play' || (finished && seated))
  // The ⚙ Host controls sheet (players + remove, settings, end game, play again)
  // is available to any host screen that hands us the roster — both play-first
  // games and host-run games (bingo/trivia/…), which keep their Manage tab too.
  const showHostControls = !!players && !!onReload

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.toolbar}>
          <Pressable
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={8}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.toolbarActions}>
            <SettingsButton />
            {showHostControls ? (
              <HeaderAction label="⚙ Host settings" onPress={() => setControlsOpen(true)} />
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
          </View>
          {game.title ? (
            <Text style={styles.title} numberOfLines={2}>
              {game.title}
            </Text>
          ) : null}
        </View>

        {!playFirst && canPlay && !finished ? (
          <View style={styles.tabs}>
            {(['play', 'manage'] as HostTab[]).map((t) => {
              const active = tab === t
              return (
                <Pressable
                  key={t}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {t === 'manage' ? 'Manage' : 'Play'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </View>

      {/* Voice rail sits UNDER the header (matches PlayerSessionShell) so the
          "Join voice" bar never renders above/into the header chrome. */}
      {gameHasMobileVoice(game.game_type) ? (
        <VoiceRail gameCode={gameCode} mode="host" hostToken={hostToken} />
      ) : null}

      {showPlayView ? (
        <HostViewProvider value={{ hostToken, hostPlayerId, onReload: () => onReload?.() }}>
          <View style={styles.playBody}>
            <GameRouter gameCode={gameCode} gameType={game.game_type} />
          </View>
        </HostViewProvider>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      )}
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
          onReload={() => onReload?.()}
          onTransfer={() => {
            setControlsOpen(false)
            setTransferOpen(true)
          }}
        />
      ) : null}
    </SafeAreaView>
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
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: theme.space.lg,
    marginTop: theme.space.xs,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 3,
    gap: 3,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: theme.primary },
  tabText: { color: theme.textMuted, fontSize: 14, fontWeight: '800' },
  tabTextActive: { color: '#fff' },
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
  title: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  content: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40, ...centeredContent },
})
