import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Colour key for the bingo card states: not called (grey), called/tap to mark
 * (blue), and marked (green). Mirrors web BingoCardLegend. The swatch colours
 * are fixed so they match the card cells in both light and dark schemes.
 */
export function BingoCardLegend() {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.row}>
      <View style={styles.item}>
        <View style={[styles.swatch, styles.notCalled]} />
        <Text style={styles.label}>Not called</Text>
      </View>
      <View style={styles.item}>
        <View style={[styles.swatch, styles.called]} />
        <Text style={styles.label}>Called · tap to mark</Text>
      </View>
      <View style={styles.item}>
        <View style={[styles.swatch, styles.marked]} />
        <Text style={styles.label}>Marked</Text>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: theme.space.md,
      paddingVertical: 4,
    },
    item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
    notCalled: { backgroundColor: theme.surface, borderColor: theme.border },
    called: { backgroundColor: '#172554', borderColor: '#3b82f6' },
    marked: { backgroundColor: '#14532d', borderColor: '#22c55e' },
    label: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  })
