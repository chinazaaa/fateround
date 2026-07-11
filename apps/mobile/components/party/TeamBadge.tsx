import { StyleSheet, Text, View } from 'react-native'
import { teamLabel } from '@fateround/shared/describe-it'
import { teamChipStyle } from './team-colors'

export function TeamBadge({ team, compact }: { team: number; compact?: boolean }) {
  const colors = teamChipStyle(team)
  return (
    <View style={[styles.badge, { backgroundColor: colors.badge }, compact && styles.badgeCompact]}>
      <Text style={[styles.text, compact && styles.textCompact]}>{teamLabel(team)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeCompact: { paddingHorizontal: 6, paddingVertical: 2 },
  // white on the solid team-colored badge — intentional
  text: { color: '#fff', fontSize: 12, fontWeight: '800' },
  textCompact: { fontSize: 10 },
})
