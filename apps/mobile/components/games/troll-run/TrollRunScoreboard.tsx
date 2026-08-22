/**
 * Between-rounds and end-of-match standings.
 *
 * The intermediate screen shows the round just played; the final one aggregates every round into
 * championship totals. Both orderings come from the shared builders, so a phone and a laptop
 * looking at the same race rank it identically.
 */

import { StyleSheet, Text, View } from 'react-native'
import type { TrollRunPlayerState, TrollRunSession } from '@fateround/shared'
import {
  buildTrollRunChampionshipStandings,
  buildTrollRunStandings,
  selectTrollRunRoundStates,
} from '@fateround/shared/troll-run-standings'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function TrollRunScoreboard({
  session,
  playerStates,
  playerNames,
  myPlayerId,
}: {
  session: TrollRunSession
  playerStates: TrollRunPlayerState[]
  playerNames: Map<string, string>
  myPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const isFinalRound = session.current_round >= session.total_rounds || session.phase === 'finished'

  const rows = isFinalRound
    ? buildTrollRunChampionshipStandings(playerStates, playerNames).map((standing) => ({
        rank: standing.rank,
        playerId: standing.playerId,
        name: standing.name,
        score: standing.totalScore,
        detail: `${standing.totalLevelsCleared} levels · ${standing.totalDeaths} deaths`,
      }))
    : buildTrollRunStandings(selectTrollRunRoundStates(playerStates, session.current_round), playerNames).map(
        (standing) => ({
          rank: standing.rank,
          playerId: standing.playerId,
          name: standing.name,
          score: standing.totalScore,
          detail: `+${standing.roundScore} this round · ${standing.deaths} deaths`,
        })
      )

  const winner = rows[0]

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {isFinalRound ? 'Final championship standings' : `Round ${session.current_round} results`}
      </Text>
      {isFinalRound && winner ? <Text style={styles.winner}>{winner.name} wins the championship!</Text> : null}
      <Text style={styles.meta}>
        {session.current_world} · Round {session.current_round} of {session.total_rounds}
      </Text>

      <View style={styles.rows}>
        {rows.map((row) => {
          const isMe = !!myPlayerId && row.playerId === myPlayerId
          return (
            <View key={row.playerId} style={[styles.row, row.rank === 1 && styles.rowLeader, isMe && styles.rowMe]}>
              <Text style={styles.rank}>{row.rank}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.name}
                  {isMe ? ' (you)' : ''}
                </Text>
                <Text style={styles.detail}>{row.detail}</Text>
              </View>
              <Text style={styles.score}>{row.score}</Text>
            </View>
          )
        })}
        {rows.length === 0 ? <Text style={styles.detail}>No runners scored this round.</Text> : null}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.lg,
      gap: theme.space.xs,
    },
    title: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800', textAlign: 'center' },
    winner: { color: theme.primary, fontSize: theme.type.label.size, fontWeight: '700', textAlign: 'center' },
    meta: {
      color: theme.textMuted,
      fontSize: theme.type.caption.size,
      textAlign: 'center',
      textTransform: 'capitalize',
      marginBottom: theme.space.sm,
    },
    rows: { gap: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      padding: theme.space.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    rowLeader: { borderColor: theme.primary },
    rowMe: { backgroundColor: theme.primarySoft },
    rank: { color: theme.textMuted, fontSize: theme.type.label.size, fontWeight: '800', width: 20 },
    rowBody: { flex: 1, minWidth: 0 },
    name: { color: theme.text, fontSize: theme.type.label.size, fontWeight: '700' },
    detail: { color: theme.textMuted, fontSize: theme.type.caption.size },
    score: { color: theme.primary, fontSize: theme.type.section.size, fontWeight: '800' },
  })
