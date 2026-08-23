import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { TROLL_RUN_ROUND_OPTIONS, TROLL_RUN_TIME_LIMIT_OPTIONS } from '@fateround/shared/create-party-games'
import type { TrollRunWorldId } from '@fateround/shared/troll-run-types'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import { TROLL_RUN_WORLD_OPTIONS } from '@/lib/troll-run-worlds'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type TrollRunLobbyState = {
  world: TrollRunWorldId
  rounds: number
  timeLimit: number
}

export function isTrollRunLobbyGame(gameType: GameType): boolean {
  return gameType === 'troll_run'
}

function timeLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`
}

/**
 * Troll Run's three room settings, editable while the lobby is open.
 *
 * The world is the one that has to be settled before the first round: it decides which level
 * catalogue the server draws `level_order` from, and changing it mid-match would score runners
 * against levels from another world.
 */
export function TrollRunLobbySection({
  value,
  onChange,
}: {
  value: TrollRunLobbyState
  onChange: (patch: Partial<TrollRunLobbyState>) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>World</Text>
        <SegmentedControl
          value={value.world}
          options={TROLL_RUN_WORLD_OPTIONS}
          onChange={(world) => onChange({ world: world as TrollRunWorldId })}
        />
      </View>
      <RoundCountPicker
        label="Rounds"
        value={value.rounds}
        options={[...TROLL_RUN_ROUND_OPTIONS]}
        onChange={(rounds) => onChange({ rounds })}
      />
      <TimerPicker
        label="Time per round"
        value={value.timeLimit}
        options={[...TROLL_RUN_TIME_LIMIT_OPTIONS]}
        format={timeLabel}
        onChange={(timeLimit) => onChange({ timeLimit })}
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.xs },
    label: { color: theme.text, fontSize: 14, fontWeight: '600' },
  })
