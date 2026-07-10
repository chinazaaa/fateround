import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { isPushMutedForGame, setPushMutedForGame } from '@/lib/push-preferences'
import { notifyPlayerSessionChanged } from '@/lib/session-events'

type Props = {
  gameCode: string
}

export function PushMuteToggle({ gameCode }: Props) {
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
        trackColor={{ false: '#3f3f46', true: '#f43f5e' }}
        thumbColor="#fff"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
  },
  copy: { flex: 1, gap: 2 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#9ca3af', fontSize: 13 },
})
