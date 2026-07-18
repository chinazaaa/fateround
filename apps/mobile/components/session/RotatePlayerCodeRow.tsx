import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { normalizeGameCode } from '@fateround/shared'
import { rotatePlayerResumeToken } from '@/lib/game-api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'

/**
 * "Rotate player code" action — issues a fresh resume token for the caller's own
 * seat and invalidates the old continue link. Reads the seat from the local
 * session, so it only needs the game code. Style is supplied by the host so it can
 * sit as a menu row (player menu) or a secondary button (host controls sheet).
 */
export function RotatePlayerCodeRow({
  gameCode,
  style,
  textStyle,
  spinnerColor,
  label = 'Rotate player code',
  onRotated,
}: {
  gameCode: string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  spinnerColor?: string
  label?: string
  onRotated?: () => void
}) {
  const [busy, setBusy] = useState(false)

  const doRotate = async () => {
    setBusy(true)
    try {
      const code = normalizeGameCode(gameCode)
      const session = await getPlayerSession(code)
      if (!session?.resumeToken) throw new Error('No player code on this device.')
      const { newToken } = await rotatePlayerResumeToken(code, session.resumeToken)
      await setPlayerSession(code, session.playerId, session.playerName, session.playerGender, newToken)
      Alert.alert('New code active', 'Your new player code is active. The old continue link no longer works.')
      onRotated?.()
    } catch (err) {
      Alert.alert('Could not rotate code', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    if (busy) return
    Alert.alert(
      'Rotate player code?',
      'If you accidentally shared your player code, generate a new one to protect your seat. Your old continue link stops working immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rotate code', style: 'destructive', onPress: () => void doRotate() },
      ]
    )
  }

  return (
    <Pressable style={style} disabled={busy} onPress={confirm}>
      {busy ? <ActivityIndicator color={spinnerColor} /> : <Text style={textStyle}>{label}</Text>}
    </Pressable>
  )
}
