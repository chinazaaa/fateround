import { StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'

export function CardTableArea({
  topCard,
  pileCount,
  hint,
}: {
  topCard: ReactNode
  pileCount?: number
  hint?: string | null
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.table}>
        <View style={styles.pile}>
          <View style={styles.pileBack} />
          {pileCount != null ? <Text style={styles.pileCount}>{pileCount}</Text> : null}
        </View>
        <View style={styles.discard}>{topCard}</View>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  table: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
    minHeight: 100,
  },
  pile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pileBack: {
    width: 48,
    height: 68,
    borderRadius: 8,
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  pileCount: {
    position: 'absolute',
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  discard: {
    marginTop: 4,
  },
  hint: {
    color: '#fcd34d',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
})
