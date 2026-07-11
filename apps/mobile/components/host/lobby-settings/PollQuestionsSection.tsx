import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { pairVoteModeOptions } from '@fateround/shared/create-party-games'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPairGame,
  isPickANumber,
} from '@fateround/shared/poll-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { theme } from '@/constants/theme'

export type PairVoteMode = 'one_each' | 'any'
export type PlayerQuestionsOrder = 'players_first' | 'uploaded_first' | 'mixed'

export type PollQuestionsState = {
  pairVoteMode: PairVoteMode
  playerQuestionsEnabled: boolean
  playerQuestionsOrder: PlayerQuestionsOrder
}

/** Lobby-question poll games that accept player-submitted questions. */
export function supportsPlayerQuestions(gameType: GameType): boolean {
  return (
    isBinaryChoiceGame(gameType) ||
    isMostLikelyTo(gameType) ||
    isNeverHaveIEver(gameType) ||
    isPickANumber(gameType)
  )
}

export function hasPollQuestionSettings(gameType: GameType): boolean {
  return isPairGame(gameType) || supportsPlayerQuestions(gameType)
}

const ORDER_OPTIONS: { value: PlayerQuestionsOrder; label: string; hint: string }[] = [
  { value: 'players_first', label: 'Players first', hint: 'Player submissions first, then the platform pool' },
  { value: 'uploaded_first', label: 'Platform first', hint: 'Platform questions first, then player submissions' },
  { value: 'mixed', label: 'Mix evenly', hint: 'Alternate between player and platform questions' },
]

type Props = {
  gameType: GameType
  value: PollQuestionsState
  onChange: (patch: Partial<PollQuestionsState>) => void
}

export function PollQuestionsSection({ gameType, value, onChange }: Props) {
  const showPair = isPairGame(gameType)
  const showPlayer = supportsPlayerQuestions(gameType)

  return (
    <View style={styles.wrap}>
      {showPair ? (
        <View style={styles.field}>
          <Text style={styles.label}>Pair voting</Text>
          <SegmentedControl
            value={value.pairVoteMode}
            options={pairVoteModeOptions(gameType).map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
            onChange={(v) => onChange({ pairVoteMode: v as PairVoteMode })}
          />
        </View>
      ) : null}

      {showPlayer ? (
        <>
          <SettingToggle
            label="Player questions"
            description="Let players submit their own questions before the game"
            value={value.playerQuestionsEnabled}
            onChange={(playerQuestionsEnabled) => onChange({ playerQuestionsEnabled })}
          />
          {value.playerQuestionsEnabled ? (
            <View style={styles.field}>
              <Text style={styles.label}>Question order</Text>
              <SegmentedControl
                value={value.playerQuestionsOrder}
                options={ORDER_OPTIONS}
                onChange={(v) => onChange({ playerQuestionsOrder: v as PlayerQuestionsOrder })}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
})
