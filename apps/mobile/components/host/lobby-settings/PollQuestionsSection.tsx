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
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type PairVoteMode = 'one_each' | 'any'
export type PlayerQuestionsOrder = 'players_first' | 'uploaded_first' | 'mixed'
export type ParticipantFilter = 'all' | 'joined'

export type PollQuestionsState = {
  pairVoteMode: PairVoteMode
  participantFilter: ParticipantFilter
  playerQuestionsEnabled: boolean
  playerQuestionsOrder: PlayerQuestionsOrder
}

/** Lobby-question poll games that accept player-submitted questions. */
export function supportsPlayerQuestions(gameType: GameType): boolean {
  return (
    isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType) || isNeverHaveIEver(gameType) || isPickANumber(gameType)
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
  /**
   * Whether to show the "Rounds include" filter — only for import-roster people-poll games
   * (a pre-set list where not everyone may join). Computed by the caller from participant_mode.
   */
  showParticipantFilter?: boolean
}

export function PollQuestionsSection({ gameType, value, onChange, showParticipantFilter = false }: Props) {
  const styles = useThemedStyles(makeStyles)
  const showPair = isPairGame(gameType)
  const showPlayer = supportsPlayerQuestions(gameType)

  return (
    <View style={styles.wrap}>
      {showParticipantFilter ? (
        <View style={styles.field}>
          <Text style={styles.label}>Rounds include</Text>
          <SegmentedControl
            value={value.participantFilter}
            options={[
              { value: 'all', label: 'Everyone', hint: 'Everyone on the list appears in rounds' },
              { value: 'joined', label: 'Joined only', hint: 'Only people who joined appear in rounds' },
            ]}
            onChange={(v) => onChange({ participantFilter: v as ParticipantFilter })}
          />
        </View>
      ) : null}

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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.sm },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  })
