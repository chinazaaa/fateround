import { StyleSheet, Text, View } from 'react-native'

export function ScrabbleTile({
  letter,
  points,
  size = 36,
  selected,
  pending,
  onBoard,
}: {
  letter: string
  points?: number
  size?: number
  selected?: boolean
  pending?: boolean
  onBoard?: boolean
}) {
  const pointSize = Math.max(8, Math.round(size * 0.22))
  const letterSize = Math.max(14, Math.round(size * 0.42))

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(4, size * 0.14),
        },
        onBoard && styles.tileBoard,
        selected && styles.tileSelected,
        pending && styles.tilePending,
      ]}
    >
      <Text style={[styles.letter, { fontSize: letterSize }]}>{letter}</Text>
      {points != null ? (
        <Text style={[styles.points, { fontSize: pointSize, bottom: size * 0.06, right: size * 0.08 }]}>
          {points}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#f5e6c8',
    borderWidth: 2,
    borderColor: '#8b7355',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tileBoard: { backgroundColor: '#fef3c7' },
  tileSelected: { borderColor: '#f43f5e' },
  tilePending: { borderColor: '#22c55e' },
  letter: { fontWeight: '900', color: '#171717' },
  points: { position: 'absolute', fontWeight: '800', color: '#525252' },
})
