import { StyleSheet, Text, View } from 'react-native'
import type { GameType, TriviaCategory } from '@fateround/shared'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { CustomContentPanel } from '@/components/create/CustomContentPanel'
import type { CustomContentState } from '@/lib/create-settings/custom-content'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Lobby-editable trivia settings: question source (Platform / Library / Your
 * own), platform category (Tech / General), and the custom-question or
 * library-pack editor. Mirrors web's `TriviaPlayAgainSetup` (variant='lobby').
 * Timer + rounds stay on the sheet's shared pickers.
 */
export type TriviaLobbyState = {
  category: TriviaCategory
  custom: CustomContentState
}

export function isTriviaLobbyGame(gameType: GameType): boolean {
  return gameType === 'trivia'
}

type Props = {
  value: TriviaLobbyState
  roundsCount: number
  onChange: (patch: Partial<TriviaLobbyState>) => void
}

export function TriviaLobbySection({ value, roundsCount, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      <CustomContentPanel
        gameType="trivia"
        custom={value.custom}
        roundsCount={roundsCount}
        onChange={(patch) => onChange({ custom: { ...value.custom, ...patch } })}
      />

      {value.custom.source === 'platform' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <SegmentedControl
            value={value.category}
            options={[
              { value: 'tech', label: 'Tech', hint: 'Programming, gadgets, internet culture' },
              { value: 'general', label: 'General', hint: 'Geography, history, pop culture & more' },
            ]}
            onChange={(category) => onChange({ category: category as TriviaCategory })}
          />
        </View>
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
