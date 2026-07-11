import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import {
  emptyParticipant,
  participantModeOptions,
  type ParticipantMode,
  type PeopleSettings,
} from '@/lib/create-settings/people'

type Props = {
  gameType: GameType
  people: PeopleSettings
  onChange: (patch: Partial<PeopleSettings>) => void
}

export function PlayerModePanel({ gameType, people, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const options = participantModeOptions(gameType)
  if (!options) return null

  const setMode = (mode: ParticipantMode) => {
    if (mode === people.participantMode) return
    const usesList = mode !== 'joiners'
    const seedList = usesList && people.participants.length === 0
    onChange({
      participantMode: mode,
      participants: seedList ? [emptyParticipant(), emptyParticipant()] : people.participants,
    })
  }

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Who’s in</Text>
        <SegmentedControl
          value={people.participantMode}
          options={options.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
          onChange={(value) => setMode(value as ParticipantMode)}
        />
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.sm },
  heading: { color: theme.text, fontSize: 18, fontWeight: '800' },
})
