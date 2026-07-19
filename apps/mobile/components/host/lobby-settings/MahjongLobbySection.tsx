import { StyleSheet, Text, View } from 'react-native'
import type { GameType, MahjongRuleOptions } from '@fateround/shared'
import { formatBoardGameTurnTimer, turnTimerOptionsFor } from '@fateround/shared/create-board-games'
import {
  DEFAULT_MAHJONG_RULE_OPTIONS,
  MAHJONG_RULESETS,
  MAHJONG_RULESET_LABELS,
  parseMahjongRuleOptions,
} from '@fateround/shared/mahjong-rulesets'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SelectField } from '@/components/create/SelectField'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type MahjongLobbyState = {
  timerSeconds: number
  ruleset: string
  ruleOptions: MahjongRuleOptions
}

export function isMahjongLobbyGame(gameType: GameType): boolean {
  return gameType === 'mahjong'
}

type Props = {
  value: MahjongLobbyState
  onChange: (patch: Partial<MahjongLobbyState>) => void
}

type UmaPresetKey = 'standard' | 'small' | 'flat'

const UMA_PRESETS: Record<UmaPresetKey, { label: string; value: [number, number, number, number] }> = {
  standard: { label: '+15/+5', value: [15000, 5000, -5000, -15000] },
  small: { label: '+10/+5', value: [10000, 5000, -5000, -10000] },
  flat: { label: 'Off', value: [0, 0, 0, 0] },
}

/** Extra ruleset metadata for the lobby detail panel (mirrors web MAHJONG_RULESET_CONFIG). */
const MAHJONG_RULESET_DETAIL: Record<
  string,
  { tileSet: '136' | '144'; flowers: boolean; dora: boolean; riichi: boolean }
> = {
  fate_round: { tileSet: '136', flowers: false, dora: false, riichi: false },
  hong_kong: { tileSet: '144', flowers: true, dora: false, riichi: false },
  riichi: { tileSet: '136', flowers: false, dora: true, riichi: true },
  mcr: { tileSet: '144', flowers: true, dora: false, riichi: false },
}

function rulesetTags(rulesetId: string): string {
  const detail = MAHJONG_RULESET_DETAIL[rulesetId]
  if (!detail) return ''
  return [
    `${detail.tileSet} tiles`,
    detail.flowers ? 'Flowers' : null,
    detail.dora ? 'Dora' : null,
    detail.riichi ? 'Riichi' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function umaPresetKey(uma: number[] | undefined): UmaPresetKey {
  const found = (Object.entries(UMA_PRESETS) as [UmaPresetKey, (typeof UMA_PRESETS)[UmaPresetKey]][]).find(
    ([, preset]) => preset.value.every((value, index) => value === uma?.[index])
  )
  return found?.[0] ?? 'standard'
}

export function MahjongLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const options = parseMahjongRuleOptions(value.ruleOptions ?? DEFAULT_MAHJONG_RULE_OPTIONS)

  const patchOptions = (patch: Partial<MahjongRuleOptions>) =>
    onChange({ ruleOptions: parseMahjongRuleOptions({ ...options, ...patch }) })

  const num = (v: string) => Number(v)

  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Turn timer"
        value={value.timerSeconds}
        options={turnTimerOptionsFor('mahjong')}
        format={formatBoardGameTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Ruleset</Text>
        <SelectField
          title="Ruleset"
          value={value.ruleset}
          options={MAHJONG_RULESETS.map((id) => ({
            value: id,
            label: MAHJONG_RULESET_LABELS[id].label,
            hint: MAHJONG_RULESET_LABELS[id].description,
          }))}
          onChange={(ruleset) => onChange({ ruleset })}
        />
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>
            {MAHJONG_RULESET_LABELS[value.ruleset as keyof typeof MAHJONG_RULESET_LABELS]?.label ?? value.ruleset}
          </Text>
          <Text style={styles.detailDesc}>
            {MAHJONG_RULESET_LABELS[value.ruleset as keyof typeof MAHJONG_RULESET_LABELS]?.description ?? ''}
          </Text>
          {rulesetTags(value.ruleset) ? <Text style={styles.detailTags}>{rulesetTags(value.ruleset)}</Text> : null}
        </View>
      </View>

      {value.ruleset === 'riichi' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Riichi house rules</Text>

          <View style={styles.field}>
            <Text style={styles.subLabel}>Match length</Text>
            <SegmentedControl
              value={options.matchLength === 'east' ? 'east' : 'hanchan'}
              options={[
                { value: 'hanchan', label: 'Hanchan' },
                { value: 'east', label: 'East' },
              ]}
              onChange={(matchLength) => patchOptions({ matchLength: matchLength as 'hanchan' | 'east' })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.subLabel}>Uma</Text>
            <SegmentedControl
              value={umaPresetKey(options.uma)}
              options={(Object.keys(UMA_PRESETS) as UmaPresetKey[]).map((key) => ({
                value: key,
                label: UMA_PRESETS[key].label,
              }))}
              onChange={(key) => patchOptions({ uma: UMA_PRESETS[key as UmaPresetKey].value })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.subLabel}>Starting score</Text>
            <SegmentedControl
              value={String(options.startingScore ?? 25000)}
              options={[
                { value: '25000', label: '25k' },
                { value: '30000', label: '30k' },
              ]}
              onChange={(v) => patchOptions({ startingScore: num(v) })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.subLabel}>Return score</Text>
            <SegmentedControl
              value={String(options.returnScore ?? 30000)}
              options={[
                { value: '25000', label: '25k' },
                { value: '30000', label: '30k' },
              ]}
              onChange={(v) => patchOptions({ returnScore: num(v) })}
            />
          </View>

          <View style={styles.toggles}>
            <SettingToggle
              label="Open tanyao"
              description="Allow all-simples with an open hand"
              value={!!options.openTanyao}
              onChange={(openTanyao) => patchOptions({ openTanyao })}
            />
            <SettingToggle
              label="Red fives"
              description="Use red dora 5 tiles"
              value={!!options.redFives}
              onChange={(redFives) => patchOptions({ redFives })}
            />
            <SettingToggle
              label="Double yakuman"
              description="Count double-yakuman variants separately"
              value={!!options.doubleYakuman}
              onChange={(doubleYakuman) => patchOptions({ doubleYakuman })}
            />
            <SettingToggle
              label="Kazoe yakuman"
              description="Treat 13+ han counted hands as yakuman"
              value={!!options.kazoeYakuman}
              onChange={(kazoeYakuman) => patchOptions({ kazoeYakuman })}
            />
            <SettingToggle
              label="Kiriage mangan"
              description="Round 4 han 30 fu and 3 han 60 fu up to mangan"
              value={!!options.kiriageMangan}
              onChange={(kiriageMangan) => patchOptions({ kiriageMangan })}
            />
            <SettingToggle
              label="Abortive draws"
              description="Nine terminals, four winds, four riichi and four kans"
              value={!!options.abortiveDraws}
              onChange={(abortiveDraws) => patchOptions({ abortiveDraws })}
            />
            <SettingToggle
              label="Nagashi mangan"
              description="Award nagashi mangan on eligible exhaustive draws"
              value={!!options.nagashiMangan}
              onChange={(nagashiMangan) => patchOptions({ nagashiMangan })}
            />
            <SettingToggle
              label="Agari-yame"
              description="Dealer may end the match after winning in all-last"
              value={!!options.agariYame}
              onChange={(agariYame) => patchOptions({ agariYame })}
            />
            <SettingToggle
              label="Oka"
              description="Award return-score bonus during final settlement"
              value={!!options.okaEnabled}
              onChange={(okaEnabled) => patchOptions({ okaEnabled })}
            />
            <SettingToggle
              label="Bankruptcy ends"
              description="Finish the match when a player drops below zero"
              value={!!options.bankruptcyEndsMatch}
              onChange={(bankruptcyEndsMatch) => patchOptions({ bankruptcyEndsMatch })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.subLabel}>Renhou</Text>
            <SegmentedControl
              value={options.renhou ?? 'off'}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'mangan', label: 'Mangan' },
                { value: 'yakuman', label: 'Yakuman' },
              ]}
              onChange={(renhou) => patchOptions({ renhou: renhou as 'off' | 'mangan' | 'yakuman' })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.subLabel}>Chombo penalty</Text>
            <SegmentedControl
              value={options.chomboPenalty ?? 'mangan'}
              options={[
                { value: 'mangan', label: 'Mangan' },
                { value: 'none', label: 'Off' },
              ]}
              onChange={(chomboPenalty) => patchOptions({ chomboPenalty: chomboPenalty as 'mangan' | 'none' })}
            />
          </View>
        </View>
      ) : null}

      {value.ruleset === 'hong_kong' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Hong Kong scoring</Text>
          <View style={styles.field}>
            <Text style={styles.subLabel}>Minimum faan</Text>
            <SegmentedControl
              value={String(options.hongKongMinimumFan ?? 3)}
              options={['0', '1', '3', '5'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => patchOptions({ hongKongMinimumFan: num(v) })}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.subLabel}>Limit faan</Text>
            <SegmentedControl
              value={String(options.hongKongLimitFan ?? 10)}
              options={['8', '10', '13'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => patchOptions({ hongKongLimitFan: num(v) })}
            />
          </View>
        </View>
      ) : null}

      {value.ruleset === 'mcr' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>MCR scoring</Text>
          <View style={styles.field}>
            <Text style={styles.subLabel}>Minimum points</Text>
            <SegmentedControl
              value={String(options.mcrMinimumPoints ?? 8)}
              options={['0', '8'].map((v) => ({ value: v, label: v }))}
              onChange={(v) => patchOptions({ mcrMinimumPoints: num(v) })}
            />
          </View>
        </View>
      ) : null}

      {value.ruleset !== 'riichi' && value.ruleset !== 'hong_kong' && value.ruleset !== 'mcr' ? (
        <Text style={styles.note}>Simple Mahjong uses beginner-friendly scoring — no extra options.</Text>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.sm },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
    block: {
      gap: theme.space.md,
      padding: theme.space.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    blockTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
    detailPanel: {
      marginTop: theme.space.xs,
      padding: theme.space.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      gap: 2,
    },
    detailTitle: { color: theme.text, fontSize: 14, fontWeight: '800' },
    detailDesc: { color: theme.textSecondary, fontSize: 12, lineHeight: 16 },
    detailTags: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 2,
    },
    subLabel: { color: theme.textSecondary, fontSize: 13, fontWeight: '700' },
    toggles: { gap: theme.space.xs },
    note: { color: theme.textFaint, fontSize: 12, lineHeight: 17 },
  })
