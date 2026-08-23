import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles, useThemeMode, type ThemeMode } from '@/constants/theme-context'
import { DevicePreferencesSection } from '@/components/settings/DevicePreferencesSection'

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
 * Device preferences as a bottom sheet, for use IN GAME.
 *
 * Kept as a sheet rather than folded into the `/settings` screen because navigating away from a
 * live round to change the volume is the wrong trade. Everywhere else — Home included — the ⚙
 * goes to `/settings`, which carries these same controls plus the account ones.
 */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles)

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

            {/* Same controls as the /settings screen — see DevicePreferencesSection. */}
            <DevicePreferencesSection />
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/**
 * The ⚙ gear button (40x40 pill, styled like `HeaderAction`).
 *
 * `variant='screen'` navigates to `/settings`, which holds device preferences AND account
 * settings — that is what the gear should mean everywhere a player isn't mid-round.
 * `variant='sheet'` (the default, used in-game) opens the bottom sheet instead, because
 * navigating out of a live round to change the volume is the wrong trade.
 */
export function SettingsButton({ variant = 'sheet' }: { variant?: 'sheet' | 'screen' } = {}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => (variant === 'screen' ? router.push('/settings' as never) : setOpen(true))}
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
