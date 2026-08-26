import { StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

/**
 * UNO series running-total scoreboard — mobile mirror of `UnoSeriesScoreboard` in
 * `src/components/uno/UnoFinalResultsShareBlock.tsx`.
 *
 * Series scoring plays a room as a best-of: each hand's loser-hand points are banked and the
 * first player to the target takes the series. Mobile already FETCHED all four columns
 * (`uno_series_scoring`, `_target`, `_scores`, `_winner_id` are in `lib/supabase-selects.ts`
 * and typed on `Game`) but nothing rendered them, so a mobile player finishing a hand saw
 * only that hand's result — no running total, no target, and no indication the series had
 * been won. That is the whole point of the mode, invisible.
 *
 * Renders nothing unless the host enabled series scoring, so it costs a boolean check in a
 * normal room.
 */
export function UnoSeriesScoreboard({
  game,
  players,
  highlightPlayerId,
}: {
  game: Game
  players: Player[]
  highlightPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  if (!game.uno_series_scoring) return null

  const scores = (game.uno_series_scores ?? {}) as Record<string, number>
  const target = Number(game.uno_series_target ?? 1000)
  const winnerId = game.uno_series_winner_id ?? null

  const rows = players
    .filter((p) => !p.spectator)
    .map((p) => ({ id: p.id, name: p.name, points: Number(scores[p.id] ?? 0) }))
    .sort((a, b) => b.points - a.points)
  if (rows.length === 0) return null

  return (
    <SurfaceCard>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Series scoreboard</Text>
        <Text style={styles.target}>{winnerId ? 'Series won!' : `First to ${target}`}</Text>
      </View>

      <View style={styles.rows}>
        {rows.map((row) => {
          const isWinner = winnerId === row.id
          const isMe = highlightPlayerId === row.id
          // Guard the divide: a host could in principle set the target to 0.
          const pct = target > 0 ? Math.min(100, Math.round((row.points / target) * 100)) : 0
          return (
            <View key={row.id} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={[styles.name, isWinner ? styles.nameWinner : null]} numberOfLines={1}>
                  {row.name}
                  {isMe ? <Text style={styles.you}> (you)</Text> : null}
                </Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${pct}%`, backgroundColor: isWinner ? theme.primary : theme.primaryMuted },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.points}>{row.points}</Text>
            </View>
          )
        })}
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    heading: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    target: { color: theme.textFaint, fontSize: 11 },
    rows: { gap: 10, marginTop: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    name: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    nameWinner: { color: theme.primary, fontWeight: '800' },
    you: { color: theme.primaryMuted, fontWeight: '700' },
    track: { height: 6, borderRadius: 999, backgroundColor: theme.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999 },
    points: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '900', fontVariant: ['tabular-nums'] },
  })
