import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  QUICK_DRAW_DRAW_TIMER_OPTIONS,
  QUICK_DRAW_TITLE_TIMER_OPTIONS,
  QUICK_DRAW_VOTE_TIMER_OPTIONS,
  formatPollRoundTimer,
  formatQuickDrawTurnTimer,
  partyRoundOptions,
} from '@fateround/shared/create-party-games'
import { QUICK_DRAW_GUESS_TEAM_OPTIONS } from '@fateround/shared/quick-draw-guess'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type QuickDrawLobbyState = {
  variant: 'lie' | 'guess'
  playMode: 'team' | 'individual'
  numTeams: number
  rounds: number
  drawTimer: number
  titleTimer: number
  voteTimer: number
}

export function isQuickDrawLobbyGame(gameType: GameType): boolean {
  return gameType === 'quick_draw'
}

type Props = {
  value: QuickDrawLobbyState
  onChange: (patch: Partial<QuickDrawLobbyState>) => void
}

export function QuickDrawLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const isGuess = value.variant === 'guess'

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Game style</Text>
        <SegmentedControl
          value={value.variant}
          options={[
            { value: 'lie', label: 'Lie', hint: 'Drawful-style — fool everyone with fake titles' },
            { value: 'guess', label: 'Guess', hint: 'Draw a word — teammates guess' },
          ]}
          onChange={(v) => onChange({ variant: v as QuickDrawLobbyState['variant'] })}
        />
      </View>

      {isGuess ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Mode</Text>
            <SegmentedControl
              value={value.playMode}
              options={[
                { value: 'team', label: 'Teams', hint: 'Teams race to guess drawings' },
                { value: 'individual', label: 'Individual', hint: 'Everyone draws — fastest guess wins' },
              ]}
              onChange={(v) => onChange({ playMode: v as QuickDrawLobbyState['playMode'] })}
            />
          </View>
          {value.playMode !== 'individual' ? (
            <View style={styles.field}>
              <Text style={styles.label}>Teams</Text>
              <SegmentedControl
                value={String(value.numTeams)}
                options={QUICK_DRAW_GUESS_TEAM_OPTIONS.map((n) => ({ value: String(n), label: `${n} teams` }))}
                onChange={(v) => onChange({ numTeams: Number(v) })}
              />
            </View>
          ) : null}
        </>
      ) : null}

      <RoundCountPicker
        label="Rounds"
        value={value.rounds}
        options={partyRoundOptions('quick_draw')}
        onChange={(rounds) => onChange({ rounds })}
      />

      <TimerPicker
        label={isGuess ? 'Turn timer' : 'Draw timer'}
        value={value.drawTimer}
        options={QUICK_DRAW_DRAW_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(drawTimer) => onChange({ drawTimer })}
      />

      {!isGuess ? (
        <>
          <TimerPicker
            label="Title timer"
            value={value.titleTimer}
            options={QUICK_DRAW_TITLE_TIMER_OPTIONS}
            format={formatPollRoundTimer}
            onChange={(titleTimer) => onChange({ titleTimer })}
          />
          <TimerPicker
            label="Vote timer"
            value={value.voteTimer}
            options={QUICK_DRAW_VOTE_TIMER_OPTIONS}
            format={formatPollRoundTimer}
            onChange={(voteTimer) => onChange({ voteTimer })}
          />
        </>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
})
