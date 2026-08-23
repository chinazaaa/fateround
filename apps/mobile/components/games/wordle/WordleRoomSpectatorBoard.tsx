import { StyleSheet, Text, View } from 'react-native'
import type { WordleRoomProgressRow, WordleRoomStandingRow } from '@fateround/shared/wordle-room'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

/**
 * What a VIEWER watches in a live Wordle room — mobile mirror of
 * `src/components/wordle-room/WordleRoomSpectatorBoard.tsx`.
 *
 * WHY. A viewer used to get their own board: empty, and permanently disabled, because a viewer
 * never guesses. The only real content — the standings — sat below it. So the main thing on a
 * spectator's screen was a grid that would never fill in.
 *
 * NOT anyone's letters. Everyone in a room races the SAME words, so showing one player's
 * guesses would hand the answers to every viewer — and a viewer can be promoted to player
 * mid-game, carrying that straight into the race. Even a letterless colour grid leaks green
 * POSITIONS. The guesses table is server-only (RLS, no policies), so it isn't reachable anyway.
 *
 * What IS honest, and turns out to be the tense part: how far along everyone is, and how close
 * they are to burning a word. `wordle_room_progress` already reaches the client for the
 * standings and carries `current_word_guesses`.
 */
export function WordleRoomSpectatorBoard({
  standings,
  progressRows,
  wordCount,
  maxAttempts,
}: {
  standings: WordleRoomStandingRow[]
  progressRows: WordleRoomProgressRow[]
  wordCount: number
  maxAttempts: number
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const progressById = new Map(progressRows.map((row) => [row.player_id, row]))

  if (standings.length === 0) {
    return (
      <SurfaceCard>
        <Text style={styles.emptyTitle}>Waiting for the race to start…</Text>
        <Text style={styles.emptyBody}>You&apos;ll see everyone&apos;s progress here as they play.</Text>
      </SurfaceCard>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Live race</Text>
        <Text style={styles.headingMeta}>{wordCount} words</Text>
      </View>

      {standings.map((row, i) => {
        const attempts = progressById.get(row.player_id)?.current_word_guesses ?? 0
        const racing = !row.finished && row.word_index < wordCount
        // The last attempt is where a word is won or lost — worth making visible.
        const onLastChance = racing && attempts >= maxAttempts - 1

        return (
          <SurfaceCard key={row.player_id}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {i + 1}. {row.name}
              </Text>
              <Text style={styles.points}>{row.total_points} pts</Text>
            </View>

            {/* One pip per word: filled = solved, ringed = the word they're on now. */}
            <View style={styles.pips}>
              {Array.from({ length: wordCount }, (_, w) => {
                const solved = w < row.words_solved
                const current = racing && w === row.word_index
                return (
                  <View
                    key={w}
                    style={[
                      styles.pip,
                      {
                        backgroundColor: solved ? theme.success : current ? theme.primary : theme.border,
                        borderColor: current ? theme.primaryMuted : 'transparent',
                        borderWidth: current ? 2 : 0,
                      },
                    ]}
                  />
                )
              })}
            </View>

            <View style={styles.statusRow}>
              <Text style={[styles.status, onLastChance && styles.statusUrgent]} numberOfLines={1}>
                {row.finished
                  ? `Finished · ${row.words_solved}/${wordCount} solved`
                  : racing
                    ? `Word ${row.word_index + 1} · attempt ${Math.min(attempts + 1, maxAttempts)} of ${maxAttempts}`
                    : 'Waiting…'}
              </Text>
              {row.hints_used_count > 0 ? (
                <Text style={styles.hints}>
                  {row.hints_used_count} hint{row.hints_used_count > 1 ? 's' : ''}
                </Text>
              ) : null}
            </View>
          </SurfaceCard>
        )
      })}

      <Text style={styles.footnote}>Guesses stay hidden — everyone races the same words.</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    heading: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    headingMeta: { color: theme.textFaint, fontSize: 11 },
    nameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    name: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', flex: 1, minWidth: 0 },
    points: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '900', fontVariant: ['tabular-nums'] },
    pips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
    pip: { width: 10, height: 10, borderRadius: 999 },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
    status: { color: theme.textMuted, fontSize: 11, flex: 1, minWidth: 0 },
    statusUrgent: { color: theme.error, fontWeight: '800' },
    hints: { color: theme.textFaint, fontSize: 11 },
    emptyTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', textAlign: 'center' },
    emptyBody: { color: theme.textFaint, fontSize: 11, textAlign: 'center', marginTop: 4 },
    footnote: { color: theme.textFaint, fontSize: 11, textAlign: 'center', paddingTop: 2 },
  })
