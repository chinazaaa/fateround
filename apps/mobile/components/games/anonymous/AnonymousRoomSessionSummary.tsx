import { StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

function statusLabel(status: Game['status']): string {
  if (status === 'waiting') return 'Waiting to start'
  if (status === 'active') return 'In progress'
  return 'Finished'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function peopleLabel(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'} attended`
}

type SummaryGame = {
  status: Game['status']
  session_started_at?: string | null
  created_at?: string | null
}

/** Mirrors the web AnonymousRoomSessionSummary shown on the finished screen. */
export function AnonymousRoomSessionSummary({
  game,
  playerCount,
}: {
  game: SummaryGame
  playerCount: number
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.emoji}>🎭</Text>
        <Text style={styles.subtitle}>Anonymous Room</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Status</Text>
          <Text style={styles.cellValue}>{statusLabel(game.status)}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Attended</Text>
          <Text style={styles.cellValue}>{peopleLabel(playerCount)}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Created</Text>
          <Text style={styles.cellValueMuted}>{formatDate(game.created_at)}</Text>
        </View>
        {game.session_started_at ? (
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>Started</Text>
            <Text style={styles.cellValueMuted}>{formatDate(game.session_started_at)}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.note}>Messages from this session are not stored in game history.</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.lg,
      padding: theme.space.lg,
      gap: theme.space.md,
    },
    head: { alignItems: 'center', gap: 4 },
    emoji: { fontSize: 40 },
    subtitle: { color: theme.textMuted, fontSize: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '50%', paddingVertical: 8, paddingRight: 8, gap: 2 },
    cellLabel: { color: theme.textFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    cellValue: { color: theme.text, fontSize: 14, fontWeight: '600' },
    cellValueMuted: { color: theme.textSecondary, fontSize: 14 },
    note: { color: theme.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  })
