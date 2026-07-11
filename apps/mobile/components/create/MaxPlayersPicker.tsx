import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import { playerCountOptions } from '@fateround/shared/lobby-limits'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { supportsMaxPlayersSetting } from '@/lib/create-settings'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameType: GameType
  value: number | null
  limits: GamePlayerLimitsMap
  onChange: (value: number) => void
}

function MaxPlayersStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
      <Text style={styles.stepHint}>
        {min}–{max} players
      </Text>
    </View>
  )
}

export function MaxPlayersPicker({ gameType, value, limits, onChange }: Props) {
  if (!supportsMaxPlayersSetting(gameType)) return null

  const cfg = limits[gameType as keyof GamePlayerLimitsMap]
  const selected = value ?? cfg.default
  const span = cfg.max - cfg.min + 1

  if (span > 12) {
    return <MaxPlayersStepper value={selected} min={cfg.min} max={cfg.max} onChange={onChange} />
  }

  const options = playerCountOptions(cfg.min, cfg.max).map((count) => ({
    value: String(count),
    label: String(count),
  }))

  return (
    <SegmentedControl
      value={String(selected)}
      options={options}
      onChange={(next) => onChange(Number(next))}
    />
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  stepValue: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'center',
  },
  stepHint: {
    color: theme.textFaint,
    fontSize: 13,
    marginLeft: theme.space.xs,
  },
})
