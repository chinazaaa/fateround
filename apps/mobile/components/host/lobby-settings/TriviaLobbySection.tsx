import { StyleSheet, Text, View } from 'react-native'
import type { GameType, TriviaCategory } from '@fateround/shared'
import { TRIVIA_MAX_ROUNDS, TRIVIA_MIN_ROUNDS } from '@fateround/shared/create-party-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { CustomContentPanel } from '@/components/create/CustomContentPanel'
import { customContentCount, type CustomContentState } from '@/lib/create-settings/custom-content'
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

  // When the host supplies their own questions (custom/library), the loaded pool
  // caps how many rounds can play. Web shrinks the Rounds picker to the pool size;
  // mobile keeps the generic picker + server clamp, so we surface the cap here so
  // the host sees it before saving. `poolCount === 0` means nothing loaded yet.
  const usesPool = value.custom.source !== 'platform'
  const poolCount = usesPool ? customContentCount('trivia', value.custom) : 0
  const maxRounds = poolCount > 0 ? Math.max(TRIVIA_MIN_ROUNDS, Math.min(poolCount, TRIVIA_MAX_ROUNDS)) : 0
  const overCap = poolCount > 0 && roundsCount > poolCount

  return (
    <View style={styles.wrap}>
      <CustomContentPanel
        gameType="trivia"
        custom={value.custom}
        roundsCount={roundsCount}
        onChange={(patch) => onChange({ custom: { ...value.custom, ...patch } })}
      />

      {usesPool && poolCount > 0 ? (
        <Text style={overCap ? styles.capWarn : styles.capHint}>
          {overCap
            ? `Only ${poolCount} question${poolCount === 1 ? '' : 's'} loaded — set Rounds to ${maxRounds} or fewer, or add more questions.`
            : `Your pool supports up to ${maxRounds} round${maxRounds === 1 ? '' : 's'}.`}
        </Text>
      ) : null}

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
    capHint: { color: theme.textFaint, fontSize: 13, lineHeight: 18 },
    capWarn: { color: theme.error, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  })
