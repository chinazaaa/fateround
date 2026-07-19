import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import type { CreateWizardState } from '@/lib/create-settings'
import { supportsMaxPlayersSetting } from '@/lib/create-settings'
import { LateJoinPolicyPicker } from '@/components/create/LateJoinPolicyPicker'
import { MaxPlayersPicker } from '@/components/create/MaxPlayersPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { ThemePicker } from '@/components/create/ThemePicker'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { gameAllowsLatePlayerJoin, gameSupportsViewerSetting } from '@fateround/shared/viewers'

type Props = {
  state: CreateWizardState
  limits: GamePlayerLimitsMap
  onChange: (patch: Partial<CreateWizardState>) => void
}

export function UniversalLobbyFields({ state, limits, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.stack}>
      <SurfaceCard>
        <View style={styles.field}>
          <Text style={styles.label}>Visibility</Text>
          <SegmentedControl
            value={state.isPublic ? 'public' : 'private'}
            options={[
              { value: 'private', label: '🔒 Private', hint: 'Only people with the code can join.' },
              { value: 'public', label: '🌐 Public', hint: 'Anyone can find this game in Browse.' },
            ]}
            onChange={(next) => onChange({ isPublic: next === 'public' })}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <ThemePicker
          gameType={state.gameType}
          value={state.theme}
          onChange={(themeId) => onChange({ theme: themeId })}
        />
      </SurfaceCard>

      {supportsMaxPlayersSetting(state.gameType) ? (
        <SurfaceCard>
          <View style={styles.field}>
            <Text style={styles.label}>Max players</Text>
            <MaxPlayersPicker
              gameType={state.gameType}
              value={state.maxPlayers}
              limits={limits}
              onChange={(maxPlayers) => onChange({ maxPlayers })}
            />
          </View>
        </SurfaceCard>
      ) : null}

      {gameSupportsViewerSetting(state.gameType) && gameAllowsLatePlayerJoin(state.gameType) ? (
        <SurfaceCard>
          <View style={styles.field}>
            <Text style={styles.label}>Late join</Text>
            <LateJoinPolicyPicker
              gameType={state.gameType}
              value={state.lateJoinPolicy}
              onChange={(lateJoinPolicy) => onChange({ lateJoinPolicy })}
            />
          </View>
        </SurfaceCard>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    stack: { gap: theme.space.md },
    field: { gap: theme.space.sm },
    label: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
  })
