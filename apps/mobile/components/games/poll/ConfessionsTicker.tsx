import { StyleSheet, Text, View } from 'react-native'
import type { Confession } from '@/components/games/poll/poll-types'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Anonymous hot takes for a round (or the whole game). Mirrors web ConfessionsTicker. */
export function ConfessionsTicker({ confessions, title = 'Anonymous hot takes' }: { confessions: Confession[]; title?: string }) {
  const styles = useThemedStyles(makeStyles)
  if (confessions.length === 0) return null
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{title}</Text>
        <Text style={styles.count}>{confessions.length}</Text>
      </View>
      <View style={styles.list}>
        {confessions.map((c) => (
          <View key={c.id} style={styles.item}>
            <Text style={styles.itemText}>&ldquo;{c.text}&rdquo;</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    count: { color: theme.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
    list: { gap: 8 },
    item: {
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    itemText: { color: theme.textMuted, fontSize: 14, fontStyle: 'italic' },
  })
