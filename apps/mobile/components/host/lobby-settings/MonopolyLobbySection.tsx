import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { SettingToggle } from '@/components/create/SettingToggle'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Editable Monopoly house-rules — routed via lobby-settings. */
export type MonopolyLobbyState = {
  doubleGoSalary: boolean
  forcedAuctions: boolean
  noRentInJail: boolean
}

export function isMonopolyLobbyGame(gameType: GameType): boolean {
  return gameType === 'monopoly'
}

export function MonopolyLobbySection({
  value,
  onChange,
}: {
  value: MonopolyLobbyState
  onChange: (patch: Partial<MonopolyLobbyState>) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
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
          description="Prevent players in jail from collecting rent on their properties."
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
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
    toggles: { gap: theme.space.sm },
  })
