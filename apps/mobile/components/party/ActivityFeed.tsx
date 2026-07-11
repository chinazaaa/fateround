import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function ActivityFeed({
  title,
  items,
  emptyText = 'Nothing yet',
  embedded = false,
}: {
  title: string
  items: { id: string; primary: string; secondary?: string }[]
  emptyText?: string
  /**
   * Set when this feed sits inside an outer ScrollView — it then renders items
   * in a plain View (no inner scroll, no height cap) so the page scroll owns
   * scrolling and the feed doesn't swallow the page's drag gesture.
   */
  embedded?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const rows = items.map((item) => (
    <View key={item.id} style={styles.row}>
      <Text style={styles.primary}>{item.primary}</Text>
      {item.secondary ? <Text style={styles.secondary}>{item.secondary}</Text> : null}
    </View>
  ))
  return (
    <View style={[styles.panel, embedded && styles.panelEmbedded]}>
      <Text style={styles.title}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : embedded ? (
        <View>{rows}</View>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {rows}
        </ScrollView>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      gap: 8,
      maxHeight: 160,
    },
    // No height cap when embedded in an outer scroll — items flow inline.
    panelEmbedded: {
      maxHeight: undefined,
    },
    title: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    empty: { color: theme.textFaint, fontSize: 14, fontStyle: 'italic' },
    list: { flexGrow: 0 },
    row: {
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 2,
    },
    primary: { color: theme.text, fontSize: 14 },
    secondary: { color: theme.textMuted, fontSize: 12 },
  })
