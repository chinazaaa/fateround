import { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { playerIsViewer } from '@fateround/shared/viewers'
import type { BootstrapLike } from '@/lib/bootstrap-props'
import { shellPropsFromBootstrap } from '@/lib/bootstrap-props'
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

function rankBadge(index: number): string {
  if (index === 0) return '👑'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}`
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

  // Suppress subtitles that only repeat the game code (e.g. "Code 8HDLLU" or
  // the bare code) — the session header already shows the code as its hero
  // text. Subtitles carrying real context ("Pick your team", phase labels) stay.
  const codeUpper = code?.trim().toUpperCase()
  const subUpper = subtitle?.trim().toUpperCase()
  const subtitleIsJustCode =
    !!subUpper && !!codeUpper && (subUpper === codeUpper || subUpper === `CODE ${codeUpper}`)
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
  centered = true,
}: {
  title: string
  detail?: string | null
  subtitle?: string
  leaderboard?: FinishedLeaderboardRow[]
  primaryAction?: { label: string; onPress: () => void }
  emoji?: string
  centered?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.panel, centered && styles.panelCentered]}>
      {emoji ? <Text style={styles.finishedEmoji}>{emoji}</Text> : null}
      <Text style={[styles.finishedTitle, centered && styles.finishedTitleCentered]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.finishedSubtitle, centered && styles.finishedSubtitleCentered]}>{subtitle}</Text>
      ) : null}
      {detail ? (
        <Text style={[styles.finishedDetail, centered && styles.finishedDetailCentered]}>{detail}</Text>
      ) : null}
      {leaderboard && leaderboard.length > 0 ? (
        <View style={styles.leaderboard}>
          {leaderboard.map((row, index) => (
            <View key={`${row.name}-${index}`} style={[styles.leaderboardRow, row.highlight && styles.leaderboardHighlight]}>
              <Text style={styles.leaderboardRank}>{rankBadge(index)}</Text>
              <Text style={styles.leaderboardName} numberOfLines={1}>
                {row.name?.trim() ? row.name : 'Player'}
                {row.you ? <Text style={styles.leaderboardYou}> (you)</Text> : null}
              </Text>
              <Text style={styles.leaderboardScore} numberOfLines={2}>
                {row.score}
                {row.scoreSuffix ? ` ${row.scoreSuffix}` : ''}
                {row.detail ? <Text style={styles.leaderboardDetail}>{`  ·  ${row.detail}`}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
  panelCentered: {
    alignItems: 'center',
  },
  panelText: {
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  finishedEmoji: {
    fontSize: 44,
    lineHeight: 52,
  },
  finishedTitle: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  finishedTitleCentered: {
    textAlign: 'center',
  },
  finishedSubtitle: {
    color: theme.primaryMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  finishedSubtitleCentered: {
    textAlign: 'center',
  },
  finishedDetail: {
    color: theme.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  finishedDetailCentered: {
    textAlign: 'center',
  },
  leaderboard: {
    gap: 6,
    marginTop: 4,
    // Fill the (centered) panel width so each row's flex name column has room
    // to expand — otherwise the name collapses to zero width and disappears.
    alignSelf: 'stretch',
    width: '100%',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leaderboardHighlight: {
    borderWidth: 1,
    borderColor: theme.primary,
  },
  leaderboardRank: {
    color: theme.textFaint,
    fontSize: 15,
    fontWeight: '700',
    width: 26,
    textAlign: 'center',
  },
  leaderboardName: {
    flex: 1,
    minWidth: 52,
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  leaderboardYou: {
    color: theme.textMuted,
    fontWeight: '600',
  },
  leaderboardScore: {
    flexShrink: 1,
    textAlign: 'right',
    color: theme.primaryMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  leaderboardDetail: {
    color: theme.textFaint,
    fontSize: 13,
    fontWeight: '600',
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
