import { Image, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  name: string
  photoUrl?: string | null
  size?: number
  highlight?: boolean
}

export function ParticipantAvatar({ name, photoUrl, size = 40, highlight }: Props) {
  const styles = useThemedStyles(makeStyles)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const dimension = { width: size, height: size, borderRadius: size / 2 }

  return (
    <View style={[styles.wrap, dimension, highlight && styles.highlight]}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={[styles.image, dimension]} />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
    },
    highlight: {
      borderColor: theme.primary,
    },
    image: {
      resizeMode: 'cover',
    },
    initial: {
      color: theme.text,
      fontWeight: '800',
    },
  })
