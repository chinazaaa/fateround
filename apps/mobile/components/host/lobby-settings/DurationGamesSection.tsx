import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  MATCHING_PAIRS_GAME_DURATION_OPTIONS,
  SUDOKU_GAME_DURATION_OPTIONS,
  formatMatchingPairsGameDuration,
  formatQuickDrawTurnTimer,
  formatSudokuGameDuration,
} from '@fateround/shared/create-party-games'
import { WORD_HUNT_TIMER_OPTIONS } from '@fateround/shared/word-hunt'
import {
  CROSSWORD_GAME_DURATION_OPTIONS,
  CROSSWORD_THEME_OPTIONS,
  formatCrosswordGameDuration,
} from '@fateround/shared/crossword'
import {
  WORD_SEARCH_GAME_DURATION_OPTIONS,
  WORD_SEARCH_THEME_OPTIONS,
  formatWordSearchGameDuration,
} from '@fateround/shared/word-search'
import {
  WORD_SCRAMBLE_GAME_DURATION_OPTIONS,
  WORD_SCRAMBLE_THEME_OPTIONS,
  formatWordScrambleGameDuration,
} from '@fateround/shared/word-scramble'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SelectField } from '@/components/create/SelectField'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type PuzzleDifficulty = 'easy' | 'medium' | 'hard'

export type DurationGameState = {
  /** word_hunt / matching_pairs time limit */
  timerSeconds: number
  /** sudoku max time */
  gameDurationSeconds: number
  /** matching_pairs 8×4 grid */
  largeGrid: boolean
  /** crossword / word_search puzzle theme (word bank) */
  theme: string
  /** crossword / word_search difficulty */
  difficulty: PuzzleDifficulty
}

const DIFFICULTY_OPTIONS: { value: PuzzleDifficulty; label: string; hint?: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Smaller grid, fewer words' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard', hint: 'Bigger grid, more words' },
]

export function isDurationGame(gameType: GameType): boolean {
  return (
    gameType === 'sudoku' ||
    gameType === 'word_hunt' ||
    gameType === 'matching_pairs' ||
    gameType === 'crossword' ||
    gameType === 'word_search' ||
    gameType === 'word_scramble'
  )
}

type Props = {
  gameType: GameType
  value: DurationGameState
  onChange: (patch: Partial<DurationGameState>) => void
}

export function DurationGamesSection({ gameType, value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  if (gameType === 'sudoku') {
    return (
      <TimerPicker
        label="Max time limit"
        value={value.gameDurationSeconds}
        options={SUDOKU_GAME_DURATION_OPTIONS}
        format={formatSudokuGameDuration}
        onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
      />
    )
  }

  if (gameType === 'crossword') {
    return (
      <View style={styles.wrap}>
        <View style={styles.field}>
          <Text style={styles.label}>Theme</Text>
          <SelectField
            title="Crossword theme"
            value={value.theme}
            options={CROSSWORD_THEME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(theme) => onChange({ theme })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Difficulty</Text>
          <SegmentedControl
            value={value.difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={(v) => onChange({ difficulty: v as PuzzleDifficulty })}
          />
        </View>
        <TimerPicker
          label="Max time limit"
          value={value.gameDurationSeconds}
          options={CROSSWORD_GAME_DURATION_OPTIONS}
          format={formatCrosswordGameDuration}
          onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
        />
      </View>
    )
  }

  if (gameType === 'word_search') {
    return (
      <View style={styles.wrap}>
        <View style={styles.field}>
          <Text style={styles.label}>Theme</Text>
          <SelectField
            title="Word Search theme"
            value={value.theme}
            options={WORD_SEARCH_THEME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(theme) => onChange({ theme })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Difficulty</Text>
          <SegmentedControl
            value={value.difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={(v) => onChange({ difficulty: v as PuzzleDifficulty })}
          />
        </View>
        <TimerPicker
          label="Max time limit"
          value={value.gameDurationSeconds}
          options={WORD_SEARCH_GAME_DURATION_OPTIONS}
          format={formatWordSearchGameDuration}
          onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
        />
      </View>
    )
  }

  if (gameType === 'word_scramble') {
    return (
      <View style={styles.wrap}>
        <View style={styles.field}>
          <Text style={styles.label}>Theme</Text>
          <SelectField
            title="Word Scramble theme"
            value={value.theme}
            options={WORD_SCRAMBLE_THEME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(theme) => onChange({ theme })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Difficulty</Text>
          <SegmentedControl
            value={value.difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={(v) => onChange({ difficulty: v as PuzzleDifficulty })}
          />
        </View>
        <TimerPicker
          label="Max time limit"
          value={value.gameDurationSeconds}
          options={WORD_SCRAMBLE_GAME_DURATION_OPTIONS}
          format={formatWordScrambleGameDuration}
          onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
        />
      </View>
    )
  }

  if (gameType === 'word_hunt') {
    return (
      <TimerPicker
        label="Time limit"
        value={value.timerSeconds}
        options={WORD_HUNT_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
    )
  }

  // matching_pairs
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Time limit"
        value={value.timerSeconds}
        options={MATCHING_PAIRS_GAME_DURATION_OPTIONS}
        format={formatMatchingPairsGameDuration}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Grid size</Text>
        <SegmentedControl
          value={value.largeGrid ? 'large' : 'standard'}
          options={[
            { value: 'standard', label: 'Standard', hint: '4×4 grid (8 pairs)' },
            { value: 'large', label: 'Large', hint: '8×4 grid (16 pairs)' },
          ]}
          onChange={(v) => onChange({ largeGrid: v === 'large' })}
        />
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.sm },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  })
