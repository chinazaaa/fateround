import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { isPushMutedForGame, setPushMutedForGame } from '@/lib/push-preferences'
import { notifyPlayerSessionChanged } from '@/lib/session-events'
import { usePreferences } from '@/constants/preferences-context'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
}

export function PushMuteToggle({ gameCode }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const { notificationsEnabled } = usePreferences()
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)
  // When the global master (Settings › Notifications) is off, no game sends
  // pushes — so this per-room toggle is inert and would otherwise mislead.
  const globallyOff = !notificationsEnabled

  useEffect(() => {
    let active = true
    void isPushMutedForGame(gameCode).then((value) => {
      if (active) {
        setMuted(value)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [gameCode])

  const onToggle = useCallback(
    async (next: boolean) => {
      setMuted(next)
      await setPushMutedForGame(gameCode, next)
      notifyPlayerSessionChanged(gameCode)
    },
    [gameCode]
  )

  return (
    <View style={[styles.row, globallyOff && styles.rowDisabled]}>
      <View style={styles.copy}>
        <Text style={styles.label}>Game notifications</Text>
        <Text style={styles.hint}>
          {globallyOff
            ? 'Notifications are off in Settings'
            : muted
              ? 'Muted for this room'
              : 'Turn and round alerts on'}
        </Text>
      </View>
      <Switch
        value={!muted && !globallyOff}
        disabled={loading || globallyOff}
        onValueChange={(enabled) => void onToggle(!enabled)}
        trackColor={{ false: '#3f3f46', true: theme.primary }}
        thumbColor="#fff"
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowDisabled: { opacity: 0.5 },
  copy: { flex: 1, gap: 2 },
  label: { color: theme.text, fontSize: 16, fontWeight: '600' },
  hint: { color: theme.textMuted, fontSize: 13 },
})
