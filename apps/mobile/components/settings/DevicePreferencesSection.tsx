import { StyleSheet, Pressable, Switch, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles, useThemeMode, type ThemeMode } from '@/constants/theme-context'
import { usePreferences } from '@/constants/preferences-context'

const APPEARANCE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * Per-DEVICE preferences: appearance, sound, notifications.
 *
 * Extracted from `SettingsSheet` so the in-game ⚙ sheet and the `/settings` screen render the
 * SAME controls rather than two copies that drift. The sheet still exists because navigating
 * away from a live game to change the volume would be the wrong trade; `/settings` is where a
 * player goes when they are not mid-round.
 *
 * These are device state (SecureStore), not account state — they do NOT follow the player to
 * another phone. Account settings live in `AccountSettingsSection` and are rendered beside
 * this on the settings screen, each under its own heading, so the split is visible rather than
 * something a player has to infer from which sheet they happened to open.
 */
export function DevicePreferencesSection() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const { mode, setMode } = useThemeMode()
  const { soundEnabled, setSoundEnabled, notificationsEnabled, setNotificationsEnabled } = usePreferences()

  return (
    <View style={styles.body}>
      <View style={styles.section}>
        <Text style={styles.rowLabel}>Appearance</Text>
        <View style={styles.segment}>
          {APPEARANCE_OPTIONS.map((opt) => {
            const active = mode === opt.value
            return (
              <Pressable
                key={opt.value}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setMode(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.rowLabel}>Sound effects</Text>
          <Text style={styles.rowHint}>Plays taps, dice and turn cues in games.</Text>
        </View>
        <Switch
          value={soundEnabled}
          onValueChange={setSoundEnabled}
          trackColor={{ false: theme.border, true: theme.primarySoft }}
          thumbColor={soundEnabled ? theme.primary : theme.textMuted}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.rowLabel}>Notifications</Text>
          <Text style={styles.rowHint}>Get a nudge when it&apos;s your turn.</Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          trackColor={{ false: theme.border, true: theme.primarySoft }}
          thumbColor={notificationsEnabled ? theme.primary : theme.textMuted}
        />
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.space.lg },
    section: { gap: theme.space.sm },
    rowLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    rowHint: { color: theme.textMuted, fontSize: theme.type.caption.size, marginTop: 2 },
    segment: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceHover,
      borderRadius: theme.radius.pill,
      padding: 3,
      gap: 3,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.pill, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: theme.primary },
    segmentText: { color: theme.textSecondary, fontSize: theme.type.body.size, fontWeight: '600' },
    // White on the solid rose segment — intentional, correct in both schemes.
    segmentTextActive: { color: '#fff', fontWeight: '800' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    switchCopy: { flex: 1 },
  })
