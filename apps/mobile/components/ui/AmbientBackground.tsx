import { StyleSheet, View } from 'react-native'
import { theme } from '@/constants/theme'

/** Soft rose/violet glow behind marketing screens. */
export function AmbientBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.spotTop} />
      <View style={styles.spotBottom} />
    </View>
  )
}

const styles = StyleSheet.create({
  spotTop: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.primary,
    opacity: 0.12,
  },
  spotBottom: {
    position: 'absolute',
    bottom: 120,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#6366f1',
    opacity: 0.08,
  },
})
