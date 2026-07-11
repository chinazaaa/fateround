import type { GameType } from '@fateround/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { theme } from '@/constants/theme'

type Props = {
  options: GameType[]
  value: GameType
  onChange: (type: GameType) => void
}

export function GameTypePicker({ options, value, onChange }: Props) {
  return (
    <View style={styles.grid}>
      {options.map((type) => {
        const selected = type === value
        const meta = gameTypeMeta(type)
        return (
          <Pressable
            key={type}
            style={[styles.tile, selected && styles.tileSelected]}
            onPress={() => onChange(type)}
          >
            <Text style={styles.emoji}>{meta.emoji}</Text>
            <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={2}>
              {gameLabel(type)}
            </Text>
            <Text style={styles.blurb} numberOfLines={2}>
              {meta.blurb}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.md,
    gap: 4,
    minHeight: 108,
  },
  tileSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  emoji: { fontSize: 26, marginBottom: 2 },
  name: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  nameSelected: { color: '#fff' },
  blurb: {
    color: theme.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
})
