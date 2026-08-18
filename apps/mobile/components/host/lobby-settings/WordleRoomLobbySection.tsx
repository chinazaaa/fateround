import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  WORDLE_ROOM_TIMER_OPTIONS,
  WORDLE_ROOM_WORD_COUNT_OPTIONS,
  WORDLE_ROOM_CATEGORY_LABELS,
  type WordleCategoryId,
  type WordleRoomWordCount,
} from '@fateround/shared/wordle-room'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Mobile-lobby settings section for multiplayer Wordle. Mirrors the web
 * HostWordleRoomLobbyPanel — Platform-only for now (category chips + word count + timer).
 * Library/Custom-CSV sources are create-time only on mobile; adding them here would
 * duplicate the create page's LibraryPackPicker + CSV upload UI and is a separate slice.
 */

export type WordleRoomLobbyState = {
  category: WordleCategoryId
  wordCount: WordleRoomWordCount
  timerSeconds: number
}

export function isWordleRoomLobbyGame(gameType: GameType): boolean {
  return gameType === 'wordle_room'
}

const CATEGORY_OPTIONS: { value: WordleCategoryId; label: string }[] = (
  Object.keys(WORDLE_ROOM_CATEGORY_LABELS) as WordleCategoryId[]
).map((id) => ({ value: id, label: WORDLE_ROOM_CATEGORY_LABELS[id] }))

function timerLabel(seconds: number): string {
  if (seconds === 0) return 'Untimed'
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)} min`
}

type Props = {
  value: WordleRoomLobbyState
  onChange: (patch: Partial<WordleRoomLobbyState>) => void
}

export function WordleRoomLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Category</Text>
        <SegmentedControl
          value={value.category}
          onChange={(category) => onChange({ category: category as WordleCategoryId })}
          options={CATEGORY_OPTIONS}
        />
      </View>
      <TimerPicker
        label="Words in the race"
        value={value.wordCount}
        options={WORDLE_ROOM_WORD_COUNT_OPTIONS as readonly number[]}
        format={(n) => `${n} words`}
        onChange={(n) => onChange({ wordCount: n as WordleRoomWordCount })}
      />
      <TimerPicker
        label="Whole-game timer"
        value={value.timerSeconds}
        options={WORDLE_ROOM_TIMER_OPTIONS as readonly number[]}
        format={timerLabel}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.xs },
    label: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
  })
