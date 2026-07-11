import { StyleSheet, Text, View } from 'react-native'
import type {
  CodewordsBoard,
  CodewordsGuess,
  CodewordsPlayerRole,
  CodewordsTeam,
} from '@fateround/shared'
import {
  cellBackground,
  countRevealedTeamCells,
  countTeamCells,
  roleLabel,
} from '@fateround/shared/codewords'
import {
  pickBestCodewordsSpymaster,
  tallyCodewordsOperativeStats,
  tallyCodewordsSpymasterStats,
} from '@/components/games/codewords-stats'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const TEAM_COLOR: Record<CodewordsTeam, string> = { red: '#ef4444', blue: '#3b82f6' }
const TEAM_TEXT: Record<CodewordsTeam, string> = { red: '#fca5a5', blue: '#93c5fd' }

export function CodewordsTeamBadge({ team }: { team: CodewordsTeam }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.badge, { backgroundColor: `${TEAM_COLOR[team]}33` }]}>
      <Text style={[styles.badgeText, { color: TEAM_TEXT[team] }]}>
        {team === 'red' ? '🔴 Red' : '🔵 Blue'}
      </Text>
    </View>
  )
}

/** Per-team panel: progress bar, cards-left, found/total, roster with your-turn marker. */
export function CodewordsScoreboard({
  board,
  roles,
  playerNameById,
  highlightPlayerId,
}: {
  board: CodewordsBoard
  roles: CodewordsPlayerRole[]
  playerNameById: Map<string, string>
  highlightPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)

  const panel = (team: CodewordsTeam) => {
    const total = countTeamCells(board.key, team)
    const found = countRevealedTeamCells(board.key, board.revealed_indices, team)
    const left = total - found
    const pct = total > 0 ? Math.round((found / total) * 100) : 0
    const members = roles.filter((r) => r.team === team)
    return (
      <View style={[styles.teamPanel, { borderColor: `${TEAM_COLOR[team]}66`, backgroundColor: `${TEAM_COLOR[team]}14` }]}>
        <View style={styles.teamHeader}>
          <CodewordsTeamBadge team={team} />
          <Text style={[styles.teamLeft, { color: TEAM_TEXT[team] }]}>{left} left</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: TEAM_COLOR[team] }]} />
        </View>
        <Text style={styles.foundText}>{found}/{total} found</Text>
        <View style={styles.roster}>
          {members.map((r) => {
            const isYou = r.player_id === highlightPlayerId
            const yourTurn = board.current_turn === team && isYou
            return (
              <Text
                key={r.player_id}
                style={[styles.rosterItem, isYou && { color: TEAM_TEXT[team], fontWeight: '700' }]}
              >
                {playerNameById.get(r.player_id) ?? 'Player'} · {roleLabel(r.role)}
                {yourTurn ? ' · your turn' : ''}
              </Text>
            )
          })}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.scoreboardCard}>
      <Text style={styles.cardLabel}>Scoreboard</Text>
      {panel('red')}
      {panel('blue')}
    </View>
  )
}

/** MVP cards + spymaster leaderboard for the finished screen. */
export function CodewordsEndGameStats({
  guesses,
  roles,
  players,
  highlightPlayerId,
  winner,
}: {
  guesses: CodewordsGuess[]
  roles: CodewordsPlayerRole[]
  players: Array<{ id: string; name: string }>
  highlightPlayerId?: string | null
  winner?: CodewordsTeam | null
}) {
  const styles = useThemedStyles(makeStyles)
  const operativeStats = tallyCodewordsOperativeStats(guesses, roles, players)
  const spymasterStats = tallyCodewordsSpymasterStats(guesses, roles, players)
  const bestOperative = operativeStats[0] ?? null
  const bestSpymaster = pickBestCodewordsSpymaster(spymasterStats, winner)

  if (!bestOperative && !bestSpymaster && spymasterStats.length === 0) return null

  const sortedSpies = [...spymasterStats].sort((a, b) => {
    if (!winner) return 0
    if (a.team === winner) return -1
    if (b.team === winner) return 1
    return 0
  })

  return (
    <View style={styles.statsWrap}>
      {bestOperative || bestSpymaster ? (
        <View style={styles.mvpRow}>
          {bestOperative ? (
            <View style={styles.mvpCard}>
              <Text style={styles.mvpEmoji}>🎯</Text>
              <Text style={styles.mvpTitle}>Best operative</Text>
              <Text style={styles.mvpName}>{bestOperative.name}</Text>
              <Text style={styles.mvpDetail}>{bestOperative.correct} correct · {bestOperative.score} pts</Text>
            </View>
          ) : null}
          {bestSpymaster ? (
            <View style={styles.mvpCard}>
              <Text style={styles.mvpEmoji}>🕵️</Text>
              <Text style={styles.mvpTitle}>Best spymaster</Text>
              <Text style={styles.mvpName}>{bestSpymaster.name}</Text>
              <Text style={styles.mvpDetail}>{bestSpymaster.wordsFound} found · {bestSpymaster.cluesGiven} clues</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {sortedSpies.length > 0 ? (
        <View style={styles.spyList}>
          <Text style={styles.cardLabel}>Spymasters</Text>
          {sortedSpies.map((spy) => (
            <View
              key={spy.playerId}
              style={[styles.spyRow, spy.playerId === highlightPlayerId && styles.spyRowYou]}
            >
              <View style={styles.spyInfo}>
                <Text style={styles.spyName}>
                  {spy.name}
                  {spy.playerId === highlightPlayerId ? ' (you)' : ''}
                </Text>
                <View style={styles.spyMeta}>
                  <CodewordsTeamBadge team={spy.team} />
                  <Text style={styles.spyMetaText}>Spymaster</Text>
                </View>
              </View>
              <View style={styles.spyScoreCol}>
                <Text style={styles.spyScore}>{spy.score} pts</Text>
                <Text style={styles.spyScoreSub}>{spy.wordsFound} found · {spy.cluesGiven} clues</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Full 5x5 board with the key revealed and per-cell guess attribution. */
export function CodewordsBoardReveal({
  board,
  cellAttribution,
}: {
  board: CodewordsBoard
  cellAttribution: Record<number, string>
}) {
  const styles = useThemedStyles(makeStyles)
  const revealed = new Set(board.revealed_indices)
  return (
    <View style={styles.revealWrap}>
      <Text style={styles.cardLabel}>Final board</Text>
      <View style={styles.grid}>
        {board.words.map((word, index) => {
          const isRevealed = revealed.has(index)
          const cellType = board.key[index]
          const bg = cellBackground(cellType, isRevealed, true)
          return (
            <View key={index} style={[styles.cell, { backgroundColor: bg }]}>
              <Text style={styles.cellWord} numberOfLines={2}>{word}</Text>
              {cellAttribution[index] ? (
                <Text style={styles.cellAttr} numberOfLines={1}>{cellAttribution[index]}</Text>
              ) : null}
              <Text style={styles.cellKey}>{cellType[0].toUpperCase()}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const CELL = 62

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    badge: { alignSelf: 'flex-start', borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    scoreboardCard: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    cardLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    teamPanel: { borderWidth: 2, borderRadius: theme.radius.md, padding: theme.space.sm, gap: 6 },
    teamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    teamLeft: { fontSize: 13, fontWeight: '900' },
    barTrack: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.border, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: theme.radius.pill },
    foundText: { color: theme.textFaint, fontSize: 11 },
    roster: { gap: 2, marginTop: 2 },
    rosterItem: { color: theme.textMuted, fontSize: 12, fontWeight: '500' },
    statsWrap: { gap: theme.space.md },
    mvpRow: { flexDirection: 'row', gap: theme.space.sm },
    mvpCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      alignItems: 'center',
      gap: 2,
    },
    mvpEmoji: { fontSize: 26 },
    mvpTitle: { color: theme.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    mvpName: { color: theme.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
    mvpDetail: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
    spyList: { gap: theme.space.xs },
    spyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      padding: theme.space.sm,
      gap: theme.space.sm,
    },
    spyRowYou: { borderWidth: 1, borderColor: theme.primary },
    spyInfo: { flex: 1, minWidth: 0, gap: 3 },
    spyName: { color: theme.text, fontWeight: '700' },
    spyMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    spyMetaText: { color: theme.textFaint, fontSize: 11 },
    spyScoreCol: { alignItems: 'flex-end' },
    spyScore: { color: theme.text, fontWeight: '800' },
    spyScoreSub: { color: theme.textFaint, fontSize: 11 },
    revealWrap: { gap: theme.space.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
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
    cellWord: { color: '#171717', fontWeight: '800', fontSize: 10, textAlign: 'center' },
    cellAttr: { color: '#52525b', fontSize: 8, marginTop: 2 },
    cellKey: { position: 'absolute', top: 2, right: 4, fontSize: 8, color: '#52525b', fontWeight: '800' },
  })
