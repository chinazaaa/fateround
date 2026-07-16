import { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType, Player } from '@fateround/shared'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { useRosterBase } from '@/components/session/RosterDrawerContext'
import { playerIsViewer } from '@fateround/shared/viewers'
import type { BootstrapLike } from '@/lib/bootstrap-props'
import { shellPropsFromBootstrap } from '@/lib/bootstrap-props'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { ResultsCard, type ResultsPalette } from '@/components/lifecycle/ResultsCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

export type FinishedLeaderboardRow = {
  name: string
  score: number | string
  highlight?: boolean
  /** Appends "(you)" to the name. */
  you?: boolean
  /** Unit shown after the score, e.g. "pts". */
  scoreSuffix?: string
  /** Secondary stat shown after the score, e.g. "2/2" correct. */
  detail?: string
}

/** Theme-aware colors for the on-screen results card (mirrors the shared PNG). */
function themedResultsPalette(theme: Theme): ResultsPalette {
  return {
    cardBg: theme.surface,
    gameTitle: theme.primary,
    label: theme.textMuted,
    divider: theme.border,
    result: theme.text,
    subtitle: theme.primaryMuted,
    detail: theme.textSecondary,
    rowBg: theme.bg,
    rowBorder: theme.border,
    rowWinnerBg: theme.primarySoft,
    rowWinnerBorder: theme.primary,
    rank: theme.textFaint,
    rowName: theme.text,
    rowNameWinner: theme.text,
    you: theme.textMuted,
    rowDetail: theme.textFaint,
    rowValue: theme.primaryMuted,
    rowValueWinner: theme.primary,
    brand: theme.textFaint,
  }
}

export function GameLoading() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  )
}

export function GameNotFound({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Game not found</Text>
      <Text style={styles.body}>No game with code {gameCode.toUpperCase()}.</Text>
    </View>
  )
}

export function GameShell({
  subtitle,
  bootstrap,
  gameCode,
  game,
  players,
  myPlayerId,
  onPromoted,
  children,
}: {
  // `title` is still accepted from callers but is now rendered by
  // PlayerSessionShell's header (the game-type pill), so GameShell no longer
  // draws it — that avoids stacking a second "Bingo / Code XXXX" header.
  title: string
  subtitle?: string
  bootstrap?: BootstrapLike
  gameCode?: string
  game?: Game | null
  players?: Player[]
  myPlayerId?: string | null
  onPromoted?: () => void | Promise<unknown>
  children: ReactNode
}) {
  const styles = useThemedStyles(makeStyles)
  const shell = bootstrap ? shellPropsFromBootstrap(bootstrap) : { gameCode, game, players, myPlayerId, onPromoted }
  const code = shell.gameCode
  const g = shell.game
  const roster = shell.players
  const pid = shell.myPlayerId
  const me = pid && roster ? roster.find((p) => p.id === pid) : undefined
  const showViewerBanner = !!(g && me && code && playerIsViewer(me, g))

  // Feed the roster drawer that lives in the session/host shell. This alone
  // gives every game a plain roster; game views layer scores via useGameScores.
  useRosterBase(roster, g, pid)

  // Suppress subtitles that only repeat the game code (e.g. "Code 8HDLLU" or
  // the bare code) — the session header already shows the code as its hero
  // text. Subtitles carrying real context ("Pick your team", phase labels) stay.
  const codeUpper = code?.trim().toUpperCase()
  const subUpper = subtitle?.trim().toUpperCase()
  const subtitleIsJustCode = !!subUpper && !!codeUpper && (subUpper === codeUpper || subUpper === `CODE ${codeUpper}`)
  const showSubtitle = !!subtitle && !subtitleIsJustCode

  return (
    <View style={styles.shell}>
      {showSubtitle ? <Text style={styles.shellSubtitle}>{subtitle}</Text> : null}
      {showViewerBanner ? (
        <ViewerModeBanner
          gameCode={code!}
          playerId={pid!}
          game={g!}
          player={me!}
          players={roster}
          onPromoted={shell.onPromoted}
        />
      ) : null}
      {children}
    </View>
  )
}

export function WaitingPanel({ message }: { message: string }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.panel}>
      <Text style={styles.panelText}>{message}</Text>
    </View>
  )
}

export function GameFinishedScreen({
  title,
  detail,
  subtitle,
  leaderboard,
  primaryAction,
  emoji = '🏁',
  gameType,
  gameTitle,
}: {
  title: string
  detail?: string | null
  subtitle?: string
  leaderboard?: FinishedLeaderboardRow[]
  primaryAction?: { label: string; onPress: () => void }
  emoji?: string
  /** When set, the card shows the branded game header (emoji + title + label). */
  gameType?: GameType | string | null
  gameTitle?: string | null
  /** @deprecated the card is always centered now; kept for prop compatibility. */
  centered?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const gameEmoji = gameType ? gameTypeMeta(gameType as GameType).emoji : undefined
  const label = gameType ? gameLabel(gameType as GameType) : undefined
  return (
    <View style={styles.finishedWrap}>
      <ResultsCard
        palette={themedResultsPalette(theme)}
        gameEmoji={gameEmoji}
        gameTitle={gameTitle}
        label={label}
        emoji={emoji}
        resultTitle={title}
        subtitle={subtitle}
        detail={detail}
        leaderboard={leaderboard}
      />
      {primaryAction ? (
        <Pressable style={styles.finishedButton} onPress={primaryAction.onPress}>
          <Text style={styles.finishedButtonText}>{primaryAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function FinishedPanel({
  title,
  detail,
  subtitle,
  leaderboard,
  primaryAction,
}: {
  title: string
  detail?: string | null
  subtitle?: string
  leaderboard?: FinishedLeaderboardRow[]
  primaryAction?: { label: string; onPress: () => void }
}) {
  return (
    <GameFinishedScreen
      title={title}
      detail={detail}
      subtitle={subtitle}
      leaderboard={leaderboard}
      primaryAction={primaryAction}
    />
  )
}

export function TurnBanner({ text, isMyTurn }: { text: string; isMyTurn: boolean }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.turnBanner, isMyTurn && styles.turnBannerActive]}>
      <Text style={styles.turnText}>{text}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
    },
    title: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '700',
    },
    body: {
      color: theme.textMuted,
      fontSize: 16,
      textAlign: 'center',
    },
    shell: {
      flex: 1,
      backgroundColor: theme.bg,
      padding: 16,
      gap: 14,
    },
    shellSubtitle: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 21,
    },
    panel: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      gap: 12,
    },
    panelText: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    finishedWrap: {
      gap: 12,
    },
    finishedButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    finishedButtonText: {
      // White on the solid rose button — correct in both schemes.
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
    turnBanner: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    turnBannerActive: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary,
    },
    turnText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
    },
  })
