import { Linking, Pressable, StyleSheet, Text } from 'react-native'
import type { GameType } from '@fateround/shared'
import { gameRulesUrl } from '@/lib/game-rules'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameType: GameType | string | null | undefined
  variant?: 'inline' | 'subtle'
}

export function GameRulesLink({ gameType, variant = 'inline' }: Props) {
  const styles = useThemedStyles(makeStyles)
  if (!gameType) return null
  const url = gameRulesUrl(gameType)
  if (!url) return null

  const open = () => {
    void Linking.openURL(url)
  }

  return (
    <Pressable onPress={open} hitSlop={8}>
      <Text style={variant === 'subtle' ? styles.subtle : styles.inline}>How to play</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    inline: { color: theme.primaryMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
    subtle: { color: theme.textMuted, fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
  })
