'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_MAHJONG_RULESET,
  MAHJONG_RULESET_CONFIG,
  MAHJONG_RULESETS,
  parseMahjongRuleOptions,
  parseMahjongRuleset,
} from '@/lib/mahjong-rulesets'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { Toggle } from '@/components/ui/PageShell'
import type { Game, MahjongRuleOptions, MahjongRuleset } from '@/types'

type Props = {
  game: Game
  onPatchSettings: (patch: Record<string, unknown>) => Promise<void> | void
}

type RiichiUmaPresetKey = 'standard' | 'flat' | 'small'

const RIICHI_UMA_PRESETS: Record<RiichiUmaPresetKey, { label: string; value: [number, number, number, number] }> = {
  standard: { label: '+15/+5', value: [15000, 5000, -5000, -15000] },
  small: { label: '+10/+5', value: [10000, 5000, -5000, -10000] },
  flat: { label: 'Off', value: [0, 0, 0, 0] },
}

function riichiUmaPresetKey(uma: [number, number, number, number]): RiichiUmaPresetKey {
  const found = (
    Object.entries(RIICHI_UMA_PRESETS) as [RiichiUmaPresetKey, (typeof RIICHI_UMA_PRESETS)[RiichiUmaPresetKey]][]
  ).find(([, preset]) => preset.value.every((value, index) => value === uma[index]))
  return found?.[0] ?? 'standard'
}

export function HostMahjongLobbySettings({ game, onPatchSettings }: Props) {
  const [mahjongRuleset, setMahjongRuleset] = useState<MahjongRuleset>(DEFAULT_MAHJONG_RULESET)
  const [mahjongRuleOptions, setMahjongRuleOptions] = useState<Required<MahjongRuleOptions>>(() =>
    parseMahjongRuleOptions(null)
  )

  useEffect(() => {
    setMahjongRuleset(parseMahjongRuleset(game.mahjong_ruleset))
    setMahjongRuleOptions(parseMahjongRuleOptions(game.mahjong_rule_options))
  }, [game])

  const mahjongRulesetOptions = useMemo(
    () =>
      MAHJONG_RULESETS.map((ruleset) => ({
        value: ruleset,
        label: MAHJONG_RULESET_CONFIG[ruleset].shortLabel,
      })),
    []
  )

  const onMahjongRulesetChange = (next: MahjongRuleset) => {
    if (next === mahjongRuleset) return
    setMahjongRuleset(next)
    void onPatchSettings({ mahjong_ruleset: next })
  }

  const onMahjongRuleOptionChange = (patch: Partial<MahjongRuleOptions>) => {
    const next = parseMahjongRuleOptions({ ...mahjongRuleOptions, ...patch })
    setMahjongRuleOptions(next)
    void onPatchSettings({ mahjong_rule_options: next })
  }

  const mahjongRulesetConfig = MAHJONG_RULESET_CONFIG[mahjongRuleset]
  const riichiUmaPreset = riichiUmaPresetKey(mahjongRuleOptions.uma)

  return (
    <>
      <HostLobbySettingBlock title="Ruleset" className="sm:col-span-2">
        <HostLobbyOptionChips
          value={mahjongRuleset}
          options={mahjongRulesetOptions}
          onChange={onMahjongRulesetChange}
        />
        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-sm font-bold">{mahjongRulesetConfig.label}</p>
          <p className="mt-0.5 text-xs text-white/60">{mahjongRulesetConfig.description}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {mahjongRulesetConfig.tileSet} tiles
            {mahjongRulesetConfig.flowers ? ' · Flowers' : ''}
            {mahjongRulesetConfig.dora ? ' · Dora' : ''}
            {mahjongRulesetConfig.riichi ? ' · Riichi' : ''}
          </p>
        </div>
      </HostLobbySettingBlock>

      {mahjongRuleset === 'riichi' && (
        <HostLobbySettingBlock title="Riichi house rules" className="sm:col-span-2">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-white/60">Match length</p>
                <HostLobbyOptionChips
                  value={mahjongRuleOptions.matchLength}
                  options={[
                    { value: 'hanchan', label: 'Hanchan' },
                    { value: 'east', label: 'East' },
                  ]}
                  onChange={(matchLength) => onMahjongRuleOptionChange({ matchLength })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-white/60">Uma</p>
                <HostLobbyOptionChips
                  value={riichiUmaPreset}
                  options={[
                    { value: 'standard', label: RIICHI_UMA_PRESETS.standard.label },
                    { value: 'small', label: RIICHI_UMA_PRESETS.small.label },
                    { value: 'flat', label: RIICHI_UMA_PRESETS.flat.label },
                  ]}
                  onChange={(key) => onMahjongRuleOptionChange({ uma: RIICHI_UMA_PRESETS[key].value })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-white/60">Starting score</p>
                <HostLobbyOptionChips
                  value={mahjongRuleOptions.startingScore}
                  options={[
                    { value: 25000, label: '25k' },
                    { value: 30000, label: '30k' },
                  ]}
                  onChange={(startingScore) => onMahjongRuleOptionChange({ startingScore })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-white/60">Return score</p>
                <HostLobbyOptionChips
                  value={mahjongRuleOptions.returnScore}
                  options={[
                    { value: 25000, label: '25k' },
                    { value: 30000, label: '30k' },
                  ]}
                  onChange={(returnScore) => onMahjongRuleOptionChange({ returnScore })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Toggle
                label="Open tanyao"
                description="Allow all-simples with an open hand"
                value={mahjongRuleOptions.openTanyao}
                onChange={(openTanyao) => onMahjongRuleOptionChange({ openTanyao })}
              />
              <Toggle
                label="Red fives"
                description="Use red dora 5 tiles"
                value={mahjongRuleOptions.redFives}
                onChange={(redFives) => onMahjongRuleOptionChange({ redFives })}
              />
              <Toggle
                label="Double yakuman"
                description="Count double-yakuman variants separately"
                value={mahjongRuleOptions.doubleYakuman}
                onChange={(doubleYakuman) => onMahjongRuleOptionChange({ doubleYakuman })}
              />
              <Toggle
                label="Kazoe yakuman"
                description="Treat 13+ han counted hands as yakuman"
                value={mahjongRuleOptions.kazoeYakuman}
                onChange={(kazoeYakuman) => onMahjongRuleOptionChange({ kazoeYakuman })}
              />
              <Toggle
                label="Kiriage mangan"
                description="Round 4 han 30 fu and 3 han 60 fu up to mangan"
                value={mahjongRuleOptions.kiriageMangan}
                onChange={(kiriageMangan) => onMahjongRuleOptionChange({ kiriageMangan })}
              />
              <Toggle
                label="Abortive draws"
                description="Enable nine terminals, four winds, four riichi and four kans"
                value={mahjongRuleOptions.abortiveDraws}
                onChange={(abortiveDraws) => onMahjongRuleOptionChange({ abortiveDraws })}
              />
              <Toggle
                label="Nagashi mangan"
                description="Award nagashi mangan on eligible exhaustive draws"
                value={mahjongRuleOptions.nagashiMangan}
                onChange={(nagashiMangan) => onMahjongRuleOptionChange({ nagashiMangan })}
              />
              <Toggle
                label="Agari-yame"
                description="Dealer may end the match after winning in all-last"
                value={mahjongRuleOptions.agariYame}
                onChange={(agariYame) => onMahjongRuleOptionChange({ agariYame })}
              />
              <Toggle
                label="Oka"
                description="Award return-score bonus during final settlement"
                value={mahjongRuleOptions.okaEnabled}
                onChange={(okaEnabled) => onMahjongRuleOptionChange({ okaEnabled })}
              />
              <Toggle
                label="Bankruptcy ends"
                description="Finish the match when a player drops below zero"
                value={mahjongRuleOptions.bankruptcyEndsMatch}
                onChange={(bankruptcyEndsMatch) => onMahjongRuleOptionChange({ bankruptcyEndsMatch })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-white/60">Renhou</p>
                <HostLobbyOptionChips
                  value={mahjongRuleOptions.renhou}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'mangan', label: 'Mangan' },
                    { value: 'yakuman', label: 'Yakuman' },
                  ]}
                  onChange={(renhou) => onMahjongRuleOptionChange({ renhou })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-white/60">Chombo</p>
                <HostLobbyOptionChips
                  value={mahjongRuleOptions.chomboPenalty}
                  options={[
                    { value: 'mangan', label: 'Mangan' },
                    { value: 'none', label: 'Off' },
                  ]}
                  onChange={(chomboPenalty) => onMahjongRuleOptionChange({ chomboPenalty })}
                />
              </div>
            </div>
          </div>
        </HostLobbySettingBlock>
      )}

      {mahjongRuleset === 'hong_kong' && (
        <HostLobbySettingBlock title="Hong Kong scoring" className="sm:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-white/60">Minimum faan</p>
              <HostLobbyOptionChips
                value={mahjongRuleOptions.hongKongMinimumFan}
                options={[
                  { value: 0, label: '0' },
                  { value: 1, label: '1' },
                  { value: 3, label: '3' },
                  { value: 5, label: '5' },
                ]}
                onChange={(hongKongMinimumFan) => onMahjongRuleOptionChange({ hongKongMinimumFan })}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-white/60">Limit faan</p>
              <HostLobbyOptionChips
                value={mahjongRuleOptions.hongKongLimitFan}
                options={[
                  { value: 8, label: '8' },
                  { value: 10, label: '10' },
                  { value: 13, label: '13' },
                ]}
                onChange={(hongKongLimitFan) => onMahjongRuleOptionChange({ hongKongLimitFan })}
              />
            </div>
          </div>
        </HostLobbySettingBlock>
      )}

      {mahjongRuleset === 'mcr' && (
        <HostLobbySettingBlock title="MCR scoring" className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-semibold text-white/60">Minimum points</p>
          <HostLobbyOptionChips
            value={mahjongRuleOptions.mcrMinimumPoints}
            options={[
              { value: 0, label: '0' },
              { value: 8, label: '8' },
            ]}
            onChange={(mcrMinimumPoints) => onMahjongRuleOptionChange({ mcrMinimumPoints })}
          />
        </HostLobbySettingBlock>
      )}
    </>
  )
}
