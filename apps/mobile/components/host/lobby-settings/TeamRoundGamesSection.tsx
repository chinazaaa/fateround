import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  DESCRIBE_IT_TURN_OPTIONS,
  formatPollRoundTimer,
  partyRoundOptions,
} from '@fateround/shared/create-party-games'
import {
  WORD_RUSH_ROUND_OPTIONS,
  WORD_RUSH_TURN_OPTIONS,
  formatWordRushTurnTimer,
} from '@fateround/shared/word-rush'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import { theme } from '@/constants/theme'

export type TeamRoundState = {
  mode: 'team' | 'individual'
  numTeams: number
  turnSeconds: number
  rounds: number
  promptMode: 'automatic' | 'manual'
  difficulty: 'standard' | 'hard'
}

export function isTeamRoundGame(gameType: GameType): boolean {
  return gameType === 'describe_it' || gameType === 'word_rush'
}

const TEAM_OPTIONS = [2, 3, 4]

type Props = {
  gameType: GameType
  value: TeamRoundState
  onChange: (patch: Partial<TeamRoundState>) => void
}

export function TeamRoundGamesSection({ gameType, value, onChange }: Props) {
  const isWordRush = gameType === 'word_rush'

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Mode</Text>
        <SegmentedControl
          value={value.mode}
          options={[
            { value: 'team', label: 'Teams', hint: isWordRush ? 'Teams take timed turns' : 'Teams race to guess' },
            { value: 'individual', label: 'Individual', hint: isWordRush ? 'Everyone races each round' : 'Solo — fastest guess wins' },
          ]}
          onChange={(v) => onChange({ mode: v as TeamRoundState['mode'] })}
        />
      </View>

      {value.mode !== 'individual' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Teams</Text>
          <SegmentedControl
            value={String(value.numTeams)}
            options={TEAM_OPTIONS.map((n) => ({ value: String(n), label: `${n} teams` }))}
            onChange={(v) => onChange({ numTeams: Number(v) })}
          />
        </View>
      ) : null}

      {isWordRush ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Prompt mode</Text>
            <SegmentedControl
              value={value.promptMode}
              options={[
                { value: 'automatic', label: 'Automatic', hint: 'Platform prompts each turn' },
                { value: 'manual', label: 'Manual', hint: 'Host picks prompts (web only today)' },
              ]}
              onChange={(v) => onChange({ promptMode: v as TeamRoundState['promptMode'] })}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Difficulty</Text>
            <SegmentedControl
              value={value.difficulty}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'hard', label: 'Hard', hint: 'Minimum word length rises each round' },
              ]}
              onChange={(v) => onChange({ difficulty: v as TeamRoundState['difficulty'] })}
            />
          </View>
        </>
      ) : null}

      <RoundCountPicker
        label="Rounds"
        value={value.rounds}
        options={isWordRush ? WORD_RUSH_ROUND_OPTIONS : partyRoundOptions(gameType)}
        onChange={(rounds) => onChange({ rounds })}
      />

      <TimerPicker
        label={isWordRush && value.mode === 'individual' ? 'Round length' : isWordRush ? 'Team turn length' : 'Turn timer'}
        value={value.turnSeconds}
        options={isWordRush ? WORD_RUSH_TURN_OPTIONS : DESCRIBE_IT_TURN_OPTIONS}
        format={isWordRush ? formatWordRushTurnTimer : formatPollRoundTimer}
        onChange={(turnSeconds) => onChange({ turnSeconds })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
})
