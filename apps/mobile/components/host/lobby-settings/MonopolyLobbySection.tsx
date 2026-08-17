import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const AUCTION_TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const

function formatAuctionTimer(seconds: number): string {
  return `${seconds}s`
}

/** Editable Monopoly house-rules — routed via lobby-settings. */
export type MonopolyLobbyState = {
  doubleGoSalary: boolean
  forcedAuctions: boolean
  auctionTimerSeconds: number
  noRentInJail: boolean
  /**
   * 40 (classic) or 48 (expanded). The 48-space board requires a room cap of at
   * least 6 players; the selector hides the 48 option below that threshold.
   */
  boardSize: 40 | 48
}

export function isMonopolyLobbyGame(gameType: GameType): boolean {
  return gameType === 'monopoly'
}

export function MonopolyLobbySection({
  value,
  maxPlayers,
  onChange,
}: {
  value: MonopolyLobbyState
  /** Current lobby max-players; the 48-space board is only offered when >= 6. */
  maxPlayers: number | null
  onChange: (patch: Partial<MonopolyLobbyState>) => void
}) {
  const styles = useThemedStyles(makeStyles)
  const allowsExpanded = (maxPlayers ?? 0) >= 6
  const boardSizeOptions = allowsExpanded
    ? [
        { value: '40', label: '40 spaces' },
        { value: '48', label: '48 spaces' },
      ]
    : [{ value: '40', label: '40 spaces' }]
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Board size</Text>
        <SegmentedControl
          value={String(value.boardSize)}
          options={boardSizeOptions}
          onChange={(v) => onChange({ boardSize: v === '48' ? 48 : 40 })}
        />
        {!allowsExpanded ? (
          <Text style={styles.hint}>Increase the room cap to at least 6 players to unlock the 48-space board.</Text>
        ) : null}
      </View>
      <TimerPicker
        label="Auction timer"
        value={value.auctionTimerSeconds}
        options={AUCTION_TIMER_OPTIONS}
        format={formatAuctionTimer}
        onChange={(auctionTimerSeconds) => onChange({ auctionTimerSeconds })}
      />
      <Text style={styles.label}>House rules</Text>
      <View style={styles.toggles}>
        <SettingToggle
          label="Double GO Salary"
          description="Collect $400 (instead of $200) when landing exactly on GO."
          value={value.doubleGoSalary}
          onChange={(doubleGoSalary) => onChange({ doubleGoSalary })}
        />
        <SettingToggle
          label="Forced Auctions"
          description="If a player declines to buy an unowned property, it must go to auction."
          value={value.forcedAuctions}
          onChange={(forcedAuctions) => onChange({ forcedAuctions })}
        />
        <SettingToggle
          label="No Rent in Jail"
          description="Prevent players in NICKED from collecting rent on their properties."
          value={value.noRentInJail}
          onChange={(noRentInJail) => onChange({ noRentInJail })}
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
    hint: { color: theme.textMuted, fontSize: 12 },
    toggles: { gap: theme.space.sm },
  })
