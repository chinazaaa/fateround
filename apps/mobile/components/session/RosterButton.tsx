import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PeopleIcon } from '@/components/ui/PeopleIcon'
import { useRosterDrawer } from '@/components/session/RosterDrawerContext'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

/**
 * Header affordance that opens the roster drawer. Geometry matches the back
 * button (40x40) rather than HeaderAction, since it's a persistent view control
 * next to back, not an action pill. Hides itself when the roster is empty.
 */
export function RosterButton() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const ctx = useRosterDrawer()
  if (!ctx || ctx.rows.length === 0) return null

  const count = ctx.participantCount
  return (
    <Pressable
      onPress={() => ctx.setOpen(true)}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Players${count ? ` (${count})` : ''}`}
    >
      <PeopleIcon color={theme.textSecondary} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    btn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.primary,
      borderWidth: 2,
      borderColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  })
