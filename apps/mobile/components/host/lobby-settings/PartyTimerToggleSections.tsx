import { StyleSheet, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  MAFIA_PHASE_TIMER_OPTIONS,
  formatPollRoundTimer,
  formatQuickDrawTurnTimer,
} from '@fateround/shared/create-party-games'
import { QUIPLASH_SUBMIT_TIMER_OPTIONS, QUIPLASH_VOTE_TIMER_OPTIONS } from '@fateround/shared/quiplash'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import { theme } from '@/constants/theme'

// --- Mafia ---------------------------------------------------------------

export type MafiaLobbyState = {
  timerSeconds: number
  doctorEnabled: boolean
  detectiveEnabled: boolean
  anonymousVotes: boolean
}

export function MafiaLobbySection({
  value,
  onChange,
}: {
  value: MafiaLobbyState
  onChange: (patch: Partial<MafiaLobbyState>) => void
}) {
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Phase time limit"
        value={value.timerSeconds}
        options={MAFIA_PHASE_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      <View style={styles.toggles}>
        <SettingToggle
          label="Doctor"
          description="Protects one player each night"
          value={value.doctorEnabled}
          onChange={(doctorEnabled) => onChange({ doctorEnabled })}
        />
        <SettingToggle
          label="Detective"
          description="Investigates one player each night"
          value={value.detectiveEnabled}
          onChange={(detectiveEnabled) => onChange({ detectiveEnabled })}
        />
        <SettingToggle
          label="Anonymous votes"
          description="Hide who voted for whom during the day phase"
          value={value.anonymousVotes}
          onChange={(anonymousVotes) => onChange({ anonymousVotes })}
        />
      </View>
    </View>
  )
}

// --- Quiplash ------------------------------------------------------------

export type QuiplashLobbyState = {
  timerSeconds: number
  voteTimer: number
}

export function QuiplashLobbySection({
  value,
  onChange,
}: {
  value: QuiplashLobbyState
  onChange: (patch: Partial<QuiplashLobbyState>) => void
}) {
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Answer timer"
        value={value.timerSeconds}
        options={QUIPLASH_SUBMIT_TIMER_OPTIONS}
        format={formatPollRoundTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      <TimerPicker
        label="Vote timer"
        value={value.voteTimer}
        options={QUIPLASH_VOTE_TIMER_OPTIONS}
        format={formatPollRoundTimer}
        onChange={(voteTimer) => onChange({ voteTimer })}
      />
    </View>
  )
}

export function isMafiaLobbyGame(gameType: GameType): boolean {
  return gameType === 'mafia'
}

export function isQuiplashLobbyGame(gameType: GameType): boolean {
  return gameType === 'quiplash'
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  toggles: { gap: theme.space.sm },
})
