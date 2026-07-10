import { Image, StyleSheet, Text, View } from 'react-native'

type Props = {
  name: string
  photoUrl?: string | null
  size?: number
  highlight?: boolean
}

export function ParticipantAvatar({ name, photoUrl, size = 40, highlight }: Props) {
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

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#17171d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  highlight: {
    borderColor: '#f43f5e',
  },
  image: {
    resizeMode: 'cover',
  },
  initial: {
    color: '#fff',
    fontWeight: '800',
  },
})
