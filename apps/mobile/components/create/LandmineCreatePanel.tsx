import { StyleSheet, Text, View } from 'react-native'
import {
  LANDMINE_CATEGORY_TIMER_OPTIONS,
  LANDMINE_ELIM_SECONDS_OPTIONS,
  LANDMINE_MANUAL_CYCLE_OPTIONS,
  LANDMINE_MARKING_TIMER_OPTIONS,
  LANDMINE_MINE_COUNT_OPTIONS,
  LANDMINE_REVIEW_TIMER_OPTIONS,
  LANDMINE_ROUND_COUNT_OPTIONS,
  LANDMINE_WRITING_TIMER_OPTIONS,
} from '@fateround/shared/landmine'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import {
  landmineMineSourceDefaults,
  type LandmineCreateState,
  type LandmineMineSourceOpt,
  type LandmineModeOpt,
} from '@/lib/create-settings/landmine'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const secondsLabel = (s: number) => `${s}s`
const minutesLabel = (s: number) => `${s / 60} min`

type Props = {
  value: LandmineCreateState
  onChange: (patch: Partial<LandmineCreateState>) => void
}

export function LandmineCreatePanel({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const manual = value.mineSource === 'manual'
  const elimination = value.mode === 'elimination'

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Landmine settings</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Who plants the mine</Text>
          <SegmentedControl<LandmineMineSourceOpt>
            value={value.mineSource}
            options={[
              { value: 'system', label: 'Auto', hint: 'The app plants the mine; everyone plays every round.' },
              {
                value: 'manual',
                label: 'Manual',
                hint: 'Players take turns setting the category + mine, sit out their round, and score the room.',
              },
            ]}
            onChange={(source) => onChange(landmineMineSourceDefaults(source))}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mode</Text>
          <SegmentedControl<LandmineModeOpt>
            value={value.mode}
            options={[
              { value: 'zero_points', label: 'Zero points', hint: 'Mine scores 0 — everyone plays all rounds.' },
              { value: 'elimination', label: 'Elimination', hint: 'Mine knocks you out — last standing wins.' },
            ]}
            onChange={(mode) => onChange({ mode })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Hidden mines each round</Text>
          <SegmentedControl<string>
            value={String(value.mineCount)}
            options={LANDMINE_MINE_COUNT_OPTIONS.map((n) => ({
              value: String(n),
              label: `${n} mine${n > 1 ? 's' : ''}`,
            }))}
            onChange={(n) => onChange({ mineCount: Number(n) })}
          />
        </View>

        {elimination ? (
          <TimerPicker
            label="Time limit"
            hint="Elimination plays to last-standing, but ends when the clock runs out so it can't run forever."
            value={value.elimSeconds}
            options={LANDMINE_ELIM_SECONDS_OPTIONS}
            format={minutesLabel}
            onChange={(elimSeconds) => onChange({ elimSeconds })}
          />
        ) : (
          <RoundCountPicker
            label="Number of rounds"
            hint={manual ? 'One round = every player takes a turn setting the mine.' : undefined}
            value={value.roundsCount}
            options={manual ? LANDMINE_MANUAL_CYCLE_OPTIONS : LANDMINE_ROUND_COUNT_OPTIONS}
            onChange={(roundsCount) => onChange({ roundsCount })}
          />
        )}

        <TimerPicker
          label={manual ? 'Time to set the category & mine' : 'Time to pick a category'}
          value={value.categoryTimer}
          options={LANDMINE_CATEGORY_TIMER_OPTIONS}
          format={secondsLabel}
          onChange={(categoryTimer) => onChange({ categoryTimer })}
        />

        <TimerPicker
          label="Time to answer"
          value={value.writingTimer}
          options={LANDMINE_WRITING_TIMER_OPTIONS}
          format={secondsLabel}
          onChange={(writingTimer) => onChange({ writingTimer })}
        />

        <TimerPicker
          label="Time to vote on answers"
          value={value.markingTimer}
          options={LANDMINE_MARKING_TIMER_OPTIONS}
          format={secondsLabel}
          onChange={(markingTimer) => onChange({ markingTimer })}
        />

        <SettingToggle
          label="Originality bonus"
          description="+5 when nobody else gave your answer"
          value={value.originalityBonus}
          onChange={(originalityBonus) => onChange({ originalityBonus })}
        />

        <SettingToggle
          label="Review answers before reveal"
          description={
            manual
              ? 'The setter checks each answer before scores show.'
              : 'The round’s caller checks each answer before scores show. Off = instant reveal.'
          }
          value={value.review}
          onChange={(review) => onChange({ review })}
        />

        {value.review && (
          <TimerPicker
            label="Review time"
            value={value.reviewSeconds}
            options={LANDMINE_REVIEW_TIMER_OPTIONS}
            format={secondsLabel}
            onChange={(reviewSeconds) => onChange({ reviewSeconds })}
          />
        )}
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    heading: { color: theme.text, fontSize: 18, fontWeight: '800' },
    field: { gap: theme.space.sm },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  })
