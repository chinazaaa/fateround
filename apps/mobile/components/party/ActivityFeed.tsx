import { ScrollView, StyleSheet, Text, View } from 'react-native'

export function ActivityFeed({
  title,
  items,
  emptyText = 'Nothing yet',
}: {
  title: string
  items: { id: string; primary: string; secondary?: string }[]
  emptyText?: string
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {items.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.primary}>{item.primary}</Text>
              {item.secondary ? <Text style={styles.secondary}>{item.secondary}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    maxHeight: 160,
  },
  title: {
    color: '#fda4af',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  empty: { color: '#6b7280', fontSize: 14, fontStyle: 'italic' },
  list: { flexGrow: 0 },
  row: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
    gap: 2,
  },
  primary: { color: '#fff', fontSize: 14 },
  secondary: { color: '#9ca3af', fontSize: 12 },
})
