import { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { playerIsViewer } from '@fateround/shared/viewers'
import type { BootstrapLike } from '@/lib/bootstrap-props'
import { shellPropsFromBootstrap } from '@/lib/bootstrap-props'

export type FinishedLeaderboardRow = {
  name: string
  score: number | string
  highlight?: boolean
}

export function GameLoading() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color="#f43f5e" size="large" />
    </View>
  )
}

export function GameNotFound({ gameCode }: { gameCode: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Game not found</Text>
      <Text style={styles.body}>No game with code {gameCode.toUpperCase()}.</Text>
    </View>
  )
}

export function GameShell({
  title,
  subtitle,
  bootstrap,
  gameCode,
  game,
  players,
  myPlayerId,
  onPromoted,
  children,
}: {
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
  const shell = bootstrap ? shellPropsFromBootstrap(bootstrap) : { gameCode, game, players, myPlayerId, onPromoted }
  const code = shell.gameCode
  const g = shell.game
  const roster = shell.players
  const pid = shell.myPlayerId
  const me = pid && roster ? roster.find((p) => p.id === pid) : undefined
  const showViewerBanner = !!(g && me && code && playerIsViewer(me, g))

  return (
    <View style={styles.shell}>
      <Text style={styles.shellTitle}>{title}</Text>
      {subtitle ? <Text style={styles.shellSubtitle}>{subtitle}</Text> : null}
      {g?.game_type ? (
        <View style={styles.rulesWrap}>
          <GameRulesLink gameType={g.game_type} variant="subtle" />
        </View>
      ) : null}
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
              <Text style={styles.leaderboardRank}>{index + 1}</Text>
              <Text style={styles.leaderboardName}>{row.name}</Text>
              <Text style={styles.leaderboardScore}>{row.score}</Text>
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
  return (
    <View style={[styles.turnBanner, isMyTurn && styles.turnBannerActive]}>
      <Text style={styles.turnText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
  },
  shell: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    padding: 16,
    gap: 14,
  },
  shellTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  shellSubtitle: {
    color: '#9ca3af',
    fontSize: 15,
    lineHeight: 21,
  },
  rulesWrap: { marginTop: 2, marginBottom: 4 },
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 24,
    gap: 12,
  },
  panelCentered: {
    alignItems: 'center',
  },
  panelText: {
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 22,
  },
  finishedEmoji: {
    fontSize: 44,
    lineHeight: 52,
  },
  finishedTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  finishedTitleCentered: {
    textAlign: 'center',
  },
  finishedSubtitle: {
    color: '#fda4af',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  finishedSubtitleCentered: {
    textAlign: 'center',
  },
  finishedDetail: {
    color: '#d1d5db',
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
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0b0b0f',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leaderboardHighlight: {
    borderWidth: 1,
    borderColor: '#f43f5e',
  },
  leaderboardRank: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
    width: 20,
  },
  leaderboardName: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  leaderboardScore: {
    color: '#fda4af',
    fontSize: 15,
    fontWeight: '700',
  },
  finishedButton: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  finishedButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  turnBanner: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  turnBannerActive: {
    backgroundColor: '#2a1220',
    borderColor: '#f43f5e',
  },
  turnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
})
