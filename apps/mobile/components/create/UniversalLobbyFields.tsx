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
import { showsMaxOnePublicHint, showsPartyPublicHint } from '@fateround/shared/public-hints'

type Props = {
  state: CreateWizardState
  limits: GamePlayerLimitsMap
  onChange: (patch: Partial<CreateWizardState>) => void
}

export function UniversalLobbyFields({ state, limits, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  // Two mutually-exclusive nudges live directly beneath the Public toggle:
  //   - max_players = 1 → "bump above 1" (a Public solo game has no seat to fill)
  //   - party/board with max_players >= 3 → soft "turn Public on so others can find and join"
  // Never shown for 1v1 game types (chess/checkers/…) — see @fateround/shared/public-hints.
  const showMaxOneHint = showsMaxOnePublicHint(state.maxPlayers) && state.isPublic
  const showPartyHint = !state.isPublic && showsPartyPublicHint(state.gameType, state.maxPlayers)
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
          {showPartyHint ? (
            <Text style={styles.hintNudge}>Party game? Turn this on so others can find and join.</Text>
          ) : null}
          {showMaxOneHint ? (
            <Text style={styles.hintWarn}>Bump the max players above 1 so other people can join.</Text>
          ) : null}
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
        state.gameType === 'uno' && state.room.unoTeamMode ? (
          <SurfaceCard>
            <View style={styles.field}>
              <Text style={styles.label}>Max players</Text>
              <Text style={styles.hint}>4 players (2 teams of 2) — set by Team-Up mode.</Text>
            </View>
          </SurfaceCard>
        ) : (
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
        )
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
    hint: {
      color: theme.textMuted,
      fontSize: 13,
    },
    hintNudge: {
      color: theme.primaryMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    hintWarn: {
      color: theme.textMuted,
      fontSize: 13,
      fontStyle: 'italic',
    },
  })
