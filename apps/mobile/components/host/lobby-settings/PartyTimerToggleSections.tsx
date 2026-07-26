import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  MAFIA_PHASE_TIMER_OPTIONS,
  formatPollRoundTimer,
  formatQuickDrawTurnTimer,
} from '@fateround/shared/create-party-games'
import { QUIPLASH_SUBMIT_TIMER_OPTIONS, QUIPLASH_VOTE_TIMER_OPTIONS } from '@fateround/shared/quiplash'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

// --- Mafia ---------------------------------------------------------------

// Role selection is fully automatic (see resolveMafiaRoundToggles in src/lib/mafia.ts on web):
// a fixed core is always in, the investigator trio (Aura Seer/Seer/Detective) and Mafia
// specialist pool rotate every game, and this single switch swaps three Classic roles for
// their Advanced counterpart — no more picking each role on/off individually.
const MAFIA_DAY_TIMER_OPTIONS = [45, 60, 90, 120, 180, 300] as const
const MAFIA_VOTING_TIMER_OPTIONS = [20, 30, 45, 60, 90] as const

export type MafiaLobbyState = {
  nightTimerSeconds: number
  dayTimerSeconds: number
  votingTimerSeconds: number
  advancedMode: boolean
  anonymousVotes: boolean
}

export function MafiaLobbySection({
  value,
  onChange,
}: {
  value: MafiaLobbyState
  onChange: (patch: Partial<MafiaLobbyState>) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Night timer"
        value={value.nightTimerSeconds}
        options={MAFIA_PHASE_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(nightTimerSeconds) => onChange({ nightTimerSeconds })}
      />
      <TimerPicker
        label="Day discussion timer"
        value={value.dayTimerSeconds}
        options={MAFIA_DAY_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(dayTimerSeconds) => onChange({ dayTimerSeconds })}
      />
      <TimerPicker
        label="Voting timer"
        value={value.votingTimerSeconds}
        options={MAFIA_VOTING_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(votingTimerSeconds) => onChange({ votingTimerSeconds })}
      />
      <View style={styles.roleSetField}>
        <Text style={styles.roleSetLabel}>Role set</Text>
        <View style={styles.roleSetRow}>
          <Pressable
            style={[styles.roleSetChip, !value.advancedMode && styles.roleSetChipActive]}
            onPress={() => onChange({ advancedMode: false })}
          >
            <Text style={[styles.roleSetChipText, !value.advancedMode && styles.roleSetChipTextActive]}>Classic</Text>
          </Pressable>
          <Pressable
            style={[styles.roleSetChip, value.advancedMode && styles.roleSetChipActive]}
            onPress={() => onChange({ advancedMode: true })}
          >
            <Text style={[styles.roleSetChipText, value.advancedMode && styles.roleSetChipTextActive]}>Advanced</Text>
          </Pressable>
        </View>
        <Text style={styles.roleSetHint}>
          {value.advancedMode
            ? 'Trapper, Arsonist, and Vigilante replace Bodyguard, Serial Killer, and Priest — Witch and Little Girl join the mix too.'
            : 'The classic power roles: Bodyguard, Serial Killer, and Priest.'}
        </Text>
      </View>
      <View style={styles.toggles}>
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
  const styles = useThemedStyles(makeStyles)
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    toggles: { gap: theme.space.sm },
    roleSetField: { gap: theme.space.sm },
    roleSetLabel: { color: theme.text, fontSize: 16, fontWeight: '800' },
    roleSetRow: { flexDirection: 'row', gap: 8 },
    roleSetChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
    },
    roleSetChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    roleSetChipText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
    roleSetChipTextActive: { color: '#fff' },
    roleSetHint: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  })
