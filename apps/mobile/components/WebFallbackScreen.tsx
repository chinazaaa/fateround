import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { gameWebUrl } from '@/lib/config'
import { gameLabel } from '@/lib/mobile-registry'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  gameType: GameType
  debugReason?: string
}

export function WebFallbackScreen({ gameCode, gameType, debugReason }: Props) {
  const styles = useThemedStyles(makeStyles)
  const url = gameWebUrl(gameCode)
  const label = gameType ? gameLabel(gameType) : 'This game'

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.body}>
        This game type is temporarily unavailable in the mobile app. Open the same room on another device — players can still play together.
      </Text>
      {__DEV__ && debugReason ? (
        <Text style={styles.debug}>Dev: {debugReason}</Text>
      ) : null}
      <Pressable style={styles.button} onPress={() => void Linking.openURL(url)}>
        <Text style={styles.buttonText}>Open {gameCode.toUpperCase()}</Text>
      </Pressable>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
      padding: 24,
      justifyContent: 'center',
      gap: 16,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '700',
    },
    body: {
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
    debug: {
      // Dev-only debug readout — amber isn't a theme role; left as-is.
      color: '#fbbf24',
      fontSize: 12,
      fontFamily: 'Menlo',
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    buttonText: {
      // White on the solid rose button — correct in both schemes.
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  })
