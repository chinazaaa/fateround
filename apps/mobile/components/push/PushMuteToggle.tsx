import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { isPushMutedForGame, setPushMutedForGame } from '@/lib/push-preferences'
import { notifyPlayerSessionChanged } from '@/lib/session-events'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
}

export function PushMuteToggle({ gameCode }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)

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
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>Game notifications</Text>
        <Text style={styles.hint}>{muted ? 'Muted for this room' : 'Turn and round alerts on'}</Text>
      </View>
      <Switch
        value={!muted}
        disabled={loading}
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
  copy: { flex: 1, gap: 2 },
  label: { color: theme.text, fontSize: 16, fontWeight: '600' },
  hint: { color: theme.textMuted, fontSize: 13 },
})
