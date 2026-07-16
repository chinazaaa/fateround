import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles, useThemeMode, type ThemeMode } from '@/constants/theme-context'
import { usePreferences } from '@/constants/preferences-context'

const APPEARANCE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function GearIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/**
 * Consolidated settings bottom sheet: Appearance (System/Light/Dark),
 * Sound effects, and Notifications. Appearance is driven by the existing theme
 * context; the two switches are driven by the preferences context.
 */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const { mode, setMode } = useThemeMode()
  const { soundEnabled, setSoundEnabled, notificationsEnabled, setNotificationsEnabled } = usePreferences()

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop taps inside the sheet from dismissing it. */}
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title}>Settings</Text>
              <Pressable hitSlop={12} onPress={onClose}>
                <Text style={styles.close}>Done</Text>
              </Pressable>
            </View>

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
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/**
 * The ⚙ gear button. Styled like `HeaderAction`/`ThemeModeButton` (40x40 pill)
 * and opens the consolidated {@link SettingsSheet}. Drop-in replacement for the
 * standalone theme toggle; usable on the home screen and in-game headers.
 */
export function SettingsButton() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <GearIcon color={theme.textSecondary} />
      </Pressable>
      <SettingsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    btn: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheetWrap: {
      width: '100%',
    },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderTopWidth: 1,
      borderColor: theme.border,
      paddingBottom: theme.space.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginTop: theme.space.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
      paddingVertical: theme.space.md,
    },
    title: { color: theme.text, fontSize: 20, fontWeight: '800' },
    close: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    body: {
      paddingHorizontal: theme.space.lg,
      paddingBottom: theme.space.md,
      gap: theme.space.lg,
    },
    section: { gap: theme.space.sm },
    rowLabel: { color: theme.text, fontSize: 15, fontWeight: '700' },
    rowHint: { color: theme.textFaint, fontSize: 12, lineHeight: 17 },
    segment: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 3,
      gap: 3,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
    },
    segmentBtnActive: { backgroundColor: theme.primary },
    segmentText: { color: theme.textMuted, fontSize: 14, fontWeight: '800' },
    segmentTextActive: { color: '#fff' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.md,
    },
    switchCopy: { flex: 1, gap: 2 },
  })
