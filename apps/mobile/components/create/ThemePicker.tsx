import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import type { ThemeId } from '@fateround/shared/create-themes'
import { themesForGameType } from '@fateround/shared/create-themes'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameType: GameType
  value: ThemeId
  onChange: (themeId: ThemeId) => void
}

export function ThemePicker({ gameType, value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const options = themesForGameType(gameType)

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{gameType === 'monopoly' ? 'Edition' : 'Theme'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const selected = option.id === value
          return (
            <Pressable
              key={option.id}
              style={[styles.tile, selected && styles.tileSelected]}
              onPress={() => onChange(option.id)}
            >
              <Text style={styles.emoji}>{option.emoji}</Text>
              <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.sm },
  heading: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  row: { gap: theme.space.sm, paddingVertical: 2 },
  tile: {
    width: 92,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    alignItems: 'center',
    gap: 4,
  },
  tileSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  emoji: { fontSize: 24 },
  label: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  labelSelected: { color: theme.primaryMuted },
})
