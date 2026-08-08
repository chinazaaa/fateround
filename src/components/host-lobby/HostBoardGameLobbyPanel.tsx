'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  boardGameToLobbyLimitType,
  turnTimerOptionsFor,
  type BoardGameLobbyType,
} from '@/lib/board-game-lobby-settings'
import { formatMonopolyGameDuration, MONOPOLY_GAME_DURATION_OPTIONS } from '@/lib/monopoly'
import { formatWhotGameDuration, WHOT_GAME_DURATION_OPTIONS } from '@/lib/whot'
import { formatCrazyEightsGameDuration, CRAZY8_GAME_DURATION_OPTIONS } from '@/lib/crazy-eights'
import { formatUnoGameDuration, UNO_GAME_DURATION_OPTIONS } from '@/lib/uno'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostMahjongLobbySettings } from '@/components/host-lobby/HostMahjongLobbySettings'
import { Chip, Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game, LudoVariant } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  boardGameType: BoardGameLobbyType
  playerCount: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

function shortDurationLabel(seconds: number, formatter: (s: number) => string): string {
  if (!seconds) return 'Off'
  const full = formatter(seconds)
  if (full === 'No limit') return 'Off'
  return full.replace(' minutes', 'm').replace(' minute', 'm').replace(' hours', 'h').replace(' hour', 'h')
}

function shortTurnLabel(seconds: number): string {
  if (!seconds) return 'Off'
  if (seconds === 120) return '2m'
  return `${seconds}s`
}

export function HostBoardGameLobbyPanel({
  gameCode,
  hostToken,
  game,
  boardGameType,
  playerCount,
  onGameUpdate,
}: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [, setIsPublic] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [turnTimer, setTurnTimer] = useState(0)
  const [gameDuration, setGameDuration] = useState(0)
  const [monopolyDoubleGoSalary, setMonopolyDoubleGoSalary] = useState(false)
  const [monopolyForcedAuctions, setMonopolyForcedAuctions] = useState(false)
  const [monopolyAuctionTimerSeconds, setMonopolyAuctionTimerSeconds] = useState(10)
  const [monopolyNoRentInJail, setMonopolyNoRentInJail] = useState(false)
  const [monopolyEstateDividend, setMonopolyEstateDividend] = useState(false)
  const [whotPick3Enabled, setWhotPick3Enabled] = useState(true)
  const [whotPick2Stacking, setWhotPick2Stacking] = useState(true)
  const [whotCardsEnabled, setWhotCardsEnabled] = useState(true)
  const [whotNumberCallsEnabled, setWhotNumberCallsEnabled] = useState(true)
  const [crazy8ActionCards, setCrazy8ActionCards] = useState(true)
  const [crazy8Jokers, setCrazy8Jokers] = useState(false)
  const [crazy8Pick2Stacking, setCrazy8Pick2Stacking] = useState(true)
  const [unoWd4Challenge, setUnoWd4Challenge] = useState(true)
  const [unoUnoPenalty, setUnoUnoPenalty] = useState(2)
  const [unoZeroSeven, setUnoZeroSeven] = useState(false)
  const [unoStacking, setUnoStacking] = useState(false)
  const [unoJumpIn, setUnoJumpIn] = useState(false)
  const [unoMultiPlayMode, setUnoMultiPlayMode] = useState('off')
  const [unoTeamMode, setUnoTeamMode] = useState(false)
  const [unoMode, setUnoMode] = useState<'classic' | 'no_mercy'>('classic')
  const [unoNoMercyWin, setUnoNoMercyWin] = useState<'first_out' | 'last_standing'>('first_out')
  const [unoSeriesScoring, setUnoSeriesScoring] = useState(false)
  const [unoSeriesTarget, setUnoSeriesTarget] = useState(1000)
  const [ludoVariant, setLudoVariant] = useState<LudoVariant>('modern')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void fetch('/api/game-limits')
      .then((res) => res.json())
      .then((data: { limits?: GamePlayerLimitsMap }) => {
        if (data.limits) setLimits(data.limits)
      })
      .catch(() => {})
  }, [])

  // Keep visibility synced with the game row — independent of the limits fetch so
  // realtime updates (e.g. host changing it on another device) reflect immediately.
  useEffect(() => {
    setIsPublic(game.is_public === true)
  }, [game.is_public])

  useEffect(() => {
    if (!limits) return
    setMaxPlayers(lobbyMaxPlayersFromGame(boardGameToLobbyLimitType(boardGameType), game, limits))
    setTurnTimer(game.timer_seconds ?? 0)
    setGameDuration(game.game_duration_seconds ?? 0)
    if (boardGameType === 'monopoly') {
      setMonopolyDoubleGoSalary(game.monopoly_double_go_salary === true)
      setMonopolyForcedAuctions(game.monopoly_forced_auctions === true)
      setMonopolyAuctionTimerSeconds(game.monopoly_auction_timer_seconds ?? 10)
      setMonopolyNoRentInJail(game.monopoly_no_rent_in_jail === true)
      setMonopolyEstateDividend(game.monopoly_estate_dividend === true)
    }
    if (boardGameType === 'whot') {
      setWhotPick3Enabled(game.whot_pick3_enabled !== false)
      setWhotPick2Stacking(game.whot_pick2_stacking !== false)
      setWhotCardsEnabled(game.whot_cards_enabled !== false)
      setWhotNumberCallsEnabled(game.whot_number_calls_enabled !== false)
    }
    if (boardGameType === 'crazy_eights') {
      setCrazy8ActionCards(game.crazy8_action_cards !== false)
      setCrazy8Jokers(game.crazy8_jokers === true)
      setCrazy8Pick2Stacking(game.crazy8_pick2_stacking !== false)
    }
    if (boardGameType === 'uno') {
      setUnoWd4Challenge(game.uno_wd4_challenge !== false)
      setUnoUnoPenalty(Number(game.uno_uno_penalty) === 4 ? 4 : 2)
      setUnoZeroSeven(game.uno_zero_seven === true)
      setUnoStacking(game.uno_stacking === true)
      setUnoJumpIn(game.uno_jump_in === true)
      setUnoMultiPlayMode(game.uno_multi_play_mode ?? 'off')
      setUnoTeamMode(game.uno_team_mode === true)
      setUnoMode(game.uno_mode === 'no_mercy' ? 'no_mercy' : 'classic')
      setUnoNoMercyWin(game.uno_no_mercy_win === 'last_standing' ? 'last_standing' : 'first_out')
      setUnoSeriesScoring(game.uno_series_scoring === true)
      setUnoSeriesTarget(Number(game.uno_series_target ?? 1000))
    }
    if (boardGameType === 'ludo') {
      setLudoVariant(game.ludo_variant === 'traditional' ? 'traditional' : 'modern')
    }
  }, [boardGameType, game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.[boardGameToLobbyLimitType(boardGameType)]
  const minPlayers = limitCfg?.min ?? 2
  const maxCap = limitCfg?.max ?? 6

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
        if (data.game) onGameUpdate(data.game)
        markSaved()
      } catch (err) {
        setSaveState('idle')
        toastError(err instanceof Error ? err.message : 'Failed to save settings')
      }
    },
    [gameCode, hostToken, markSaved, onGameUpdate, toastError]
  )

  const onMaxPlayersChange = (next: number) => {
    if (next < playerCount) {
      toastError(`Already have ${playerCount} players — remove someone first`)
      return
    }
    setMaxPlayers(next)
    void patchSettings({ max_players: next })
  }

  const onTurnTimerChange = (next: number) => {
    if (next === turnTimer) return
    setTurnTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const onAuctionTimerChange = (next: number) => {
    if (next === monopolyAuctionTimerSeconds) return
    setMonopolyAuctionTimerSeconds(next)
    void patchSettings({ monopoly_auction_timer_seconds: next })
  }

  const onGameDurationChange = (next: number) => {
    setGameDuration(next)
    void patchSettings({ game_duration_seconds: next })
  }

  const onWhotRuleChange = (patch: Record<string, boolean>) => {
    if (patch.whot_pick3_enabled !== undefined) setWhotPick3Enabled(patch.whot_pick3_enabled)
    if (patch.whot_pick2_stacking !== undefined) setWhotPick2Stacking(patch.whot_pick2_stacking)
    if (patch.whot_cards_enabled !== undefined) setWhotCardsEnabled(patch.whot_cards_enabled)
    if (patch.whot_number_calls_enabled !== undefined) setWhotNumberCallsEnabled(patch.whot_number_calls_enabled)
    void patchSettings(patch)
  }

  const onCrazy8RuleChange = (patch: Record<string, boolean>) => {
    if (patch.crazy8_action_cards !== undefined) setCrazy8ActionCards(patch.crazy8_action_cards)
    if (patch.crazy8_jokers !== undefined) setCrazy8Jokers(patch.crazy8_jokers)
    if (patch.crazy8_pick2_stacking !== undefined) setCrazy8Pick2Stacking(patch.crazy8_pick2_stacking)
    void patchSettings(patch)
  }

  const onUnoRuleChange = (patch: Record<string, boolean | number | string>) => {
    if (patch.uno_wd4_challenge !== undefined) setUnoWd4Challenge(patch.uno_wd4_challenge as boolean)
    if (patch.uno_uno_penalty !== undefined) setUnoUnoPenalty(patch.uno_uno_penalty as number)
    if (patch.uno_zero_seven !== undefined) setUnoZeroSeven(patch.uno_zero_seven as boolean)
    if (patch.uno_stacking !== undefined) setUnoStacking(patch.uno_stacking as boolean)
    if (patch.uno_jump_in !== undefined) setUnoJumpIn(patch.uno_jump_in as boolean)
    if (patch.uno_multi_play_mode !== undefined) setUnoMultiPlayMode(patch.uno_multi_play_mode as string)
    if (patch.uno_team_mode !== undefined) setUnoTeamMode(patch.uno_team_mode as boolean)
    if (patch.uno_mode !== undefined) setUnoMode(patch.uno_mode as 'classic' | 'no_mercy')
    if (patch.uno_no_mercy_win !== undefined) setUnoNoMercyWin(patch.uno_no_mercy_win as 'first_out' | 'last_standing')
    if (patch.uno_series_scoring !== undefined) setUnoSeriesScoring(patch.uno_series_scoring as boolean)
    if (patch.uno_series_target !== undefined) setUnoSeriesTarget(patch.uno_series_target as number)
    void patchSettings(patch)
  }

  const onLudoVariantChange = (next: LudoVariant) => {
    if (next === ludoVariant) return
    setLudoVariant(next)
    void patchSettings({ ludo_variant: next })
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const turnTimerOptions = useMemo(
    () =>
      turnTimerOptionsFor(boardGameType).map((s) => ({
        value: s,
        label: shortTurnLabel(s),
      })),
    [boardGameType]
  )

  const auctionTimerOptions = useMemo(
    () =>
      [5, 10, 15, 20, 30, 45, 60].map((s) => ({
        value: s,
        label: shortTurnLabel(s),
      })),
    []
  )

  const durationFormatter =
    boardGameType === 'whot'
      ? formatWhotGameDuration
      : boardGameType === 'crazy_eights'
        ? formatCrazyEightsGameDuration
        : boardGameType === 'uno'
          ? formatUnoGameDuration
          : formatMonopolyGameDuration
  const durationOptionsSource =
    boardGameType === 'whot'
      ? WHOT_GAME_DURATION_OPTIONS
      : boardGameType === 'crazy_eights'
        ? CRAZY8_GAME_DURATION_OPTIONS
        : boardGameType === 'uno'
          ? UNO_GAME_DURATION_OPTIONS
          : MONOPOLY_GAME_DURATION_OPTIONS

  const durationOptions = useMemo(
    () =>
      durationOptionsSource.map((s) => ({
        value: s,
        label: shortDurationLabel(s, durationFormatter),
      })),
    [durationFormatter, durationOptionsSource]
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection
      status={statusLabel}
      // Open by default — otherwise the sheet reads as "there are no game settings here"
      // for hosts who don't spot the tiny "Expand" chevron.
      defaultOpen
      alwaysVisible={
        // Surfaced above the collapse: the player cap is the setting hosts reach for most
        // (let more people in / trim an empty lobby), so it must never hide behind "Edit".
        <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
          <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
        </HostLobbySettingBlock>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        <HostLobbySettingBlock title="Turn timer">
          <HostLobbyOptionChips value={turnTimer} options={turnTimerOptions} onChange={onTurnTimerChange} />
        </HostLobbySettingBlock>

        {boardGameType === 'monopoly' && (
          <HostLobbySettingBlock title="Auction timer">
            <HostLobbyOptionChips
              value={monopolyAuctionTimerSeconds}
              options={auctionTimerOptions}
              onChange={onAuctionTimerChange}
            />
          </HostLobbySettingBlock>
        )}

        {(boardGameType === 'monopoly' ||
          boardGameType === 'whot' ||
          boardGameType === 'crazy_eights' ||
          boardGameType === 'uno') && (
          <HostLobbySettingBlock title="Game length" className="sm:col-span-2">
            <HostLobbyOptionChips value={gameDuration} options={durationOptions} onChange={onGameDurationChange} />
          </HostLobbySettingBlock>
        )}

        {boardGameType === 'monopoly' && (
          <HostLobbySettingBlock title="House rules" className="sm:col-span-2">
            <div className="space-y-4">
              <Toggle
                label="Double GO Salary"
                description="Collect $400 (instead of $200) when landing exactly on GO."
                value={monopolyDoubleGoSalary}
                onChange={(v: boolean) => {
                  setMonopolyDoubleGoSalary(v)
                  void patchSettings({ monopoly_double_go_salary: v })
                }}
              />
              <Toggle
                label="Forced Auctions"
                description="If a player declines to buy an unowned property, it must go to auction."
                value={monopolyForcedAuctions}
                onChange={(v: boolean) => {
                  setMonopolyForcedAuctions(v)
                  void patchSettings({ monopoly_forced_auctions: v })
                }}
              />
              <Toggle
                label="No Rent in NICKED"
                description="Prevent players in NICKED from collecting rent on their properties."
                value={monopolyNoRentInJail}
                onChange={(v: boolean) => {
                  setMonopolyNoRentInJail(v)
                  void patchSettings({ monopoly_no_rent_in_jail: v })
                }}
              />
              <Toggle
                label="Robin Hood Estate Dividend"
                description="When a player leaves mid-game, their estate is liquidated and split equally among remaining players."
                value={monopolyEstateDividend}
                onChange={(v: boolean) => {
                  setMonopolyEstateDividend(v)
                  void patchSettings({ monopoly_estate_dividend: v })
                }}
              />
            </div>
          </HostLobbySettingBlock>
        )}

        {boardGameType === 'whot' && (
          <HostLobbySettingBlock title="House rules" className="sm:col-span-2">
            <div className="space-y-1.5">
              <Toggle
                label="Pick 3"
                description="Play the Pick 3 draw penalty on 5s (5 cards stay in the deck either way)"
                value={whotPick3Enabled}
                onChange={(v) => onWhotRuleChange({ whot_pick3_enabled: v })}
              />
              <Toggle
                label="Stack Pick 2"
                description="On: defend a Pick 2 with your own 2. Off: you must draw it."
                value={whotPick2Stacking}
                onChange={(v) => onWhotRuleChange({ whot_pick2_stacking: v })}
              />
              <Toggle
                label="WHOT cards"
                description="Include WHOT wild cards in the deck"
                value={whotCardsEnabled}
                onChange={(v) => onWhotRuleChange({ whot_cards_enabled: v })}
              />
              <div className={whotCardsEnabled ? undefined : 'opacity-50 pointer-events-none'}>
                <Toggle
                  label="Numbers on WHOT"
                  description="Call a number when playing WHOT"
                  value={whotNumberCallsEnabled}
                  onChange={(v) => onWhotRuleChange({ whot_number_calls_enabled: v })}
                />
              </div>
            </div>
          </HostLobbySettingBlock>
        )}

        {boardGameType === 'crazy_eights' && (
          <HostLobbySettingBlock title="House rules" className="sm:col-span-2">
            <div className="space-y-1.5">
              <Toggle
                label="Action cards"
                description="Enable 2 (Pick Two), J & A (Skip), Q (Reverse). Off: only the 8 is wild."
                value={crazy8ActionCards}
                onChange={(v) => onCrazy8RuleChange({ crazy8_action_cards: v })}
              />
              <Toggle
                label="Jokers"
                description="Add 2 Jokers — wild cards that make the next player draw 5"
                value={crazy8Jokers}
                onChange={(v) => onCrazy8RuleChange({ crazy8_jokers: v })}
              />
              <div className={crazy8ActionCards ? undefined : 'opacity-50 pointer-events-none'}>
                <Toggle
                  label="Stack Pick 2"
                  description="On: defend a 2 with your own 2. Off: you must draw it."
                  value={crazy8Pick2Stacking}
                  onChange={(v) => onCrazy8RuleChange({ crazy8_pick2_stacking: v })}
                />
              </div>
            </div>
          </HostLobbySettingBlock>
        )}

        {boardGameType === 'uno' && (
          <HostLobbySettingBlock title="House rules" className="sm:col-span-2">
            <div className="space-y-3">
              <div>
                <p className="label-caps text-[10px] mb-1.5">Mode</p>
                <HostLobbyOptionChips
                  value={unoMode}
                  options={[
                    { value: 'classic', label: 'Classic' },
                    { value: 'no_mercy', label: 'High Stakes' },
                  ]}
                  onChange={(v) => onUnoRuleChange({ uno_mode: v })}
                />
                <p className="mt-1 text-xs text-faint">
                  High Stakes is a Show ’em No Mercy-style variant: 168-card deck (Discard Colour, Skip All, Reverse
                  Draw 4, Draw 6, Draw 10, Colour Roulette) with 0-7 and stacking locked in. Draw 4 challenges, Team-Up,
                  and Jump-In are off.
                </p>
              </div>
              {unoMode === 'no_mercy' ? (
                <div>
                  <p className="label-caps text-[10px] mb-1.5">Win condition</p>
                  <HostLobbyOptionChips
                    value={unoNoMercyWin}
                    options={[
                      { value: 'first_out', label: 'First out' },
                      { value: 'last_standing', label: 'Last standing' },
                    ]}
                    onChange={(v) => onUnoRuleChange({ uno_no_mercy_win: v })}
                  />
                  <p className="mt-1 text-xs text-faint">
                    25+ cards knocks you out. Last standing wins when only one player still holds cards.
                  </p>
                </div>
              ) : null}
              {unoMode === 'classic' ? (
                <div className="space-y-1.5">
                  <Toggle
                    label="Team-Up (2v2)"
                    description="Play as 2 teams of 2 — partners see each other's hands and share the win. Needs exactly 4 players; caps the room at 4."
                    value={unoTeamMode}
                    onChange={(v) => onUnoRuleChange({ uno_team_mode: v })}
                  />
                </div>
              ) : null}
              <div>
                <p className="label-caps text-[10px] mb-1.5">Missed last-card penalty</p>
                <HostLobbyOptionChips
                  value={unoUnoPenalty}
                  options={[
                    { value: 2, label: 'Draw 2' },
                    { value: 4, label: 'Draw 4' },
                  ]}
                  onChange={(v) => onUnoRuleChange({ uno_uno_penalty: v })}
                />
              </div>
              <div className="space-y-1.5">
                {unoMode === 'classic' ? (
                  <>
                    <Toggle
                      label="Draw 4 challenge"
                      description="Let the next player challenge a Draw 4. Off: they always draw 4."
                      value={unoWd4Challenge}
                      onChange={(v) => onUnoRuleChange({ uno_wd4_challenge: v })}
                    />
                    <Toggle
                      label="0-7 rule"
                      description="Play a 0 → everyone passes their hand in play direction. Play a 7 → swap hands with any player."
                      value={unoZeroSeven}
                      onChange={(v) => onUnoRuleChange({ uno_zero_seven: v })}
                    />
                    <Toggle
                      label="Stacking"
                      description="Stack Draw 2 on Draw 2 and Draw 4 on Draw 4 — the penalty piles up and passes on."
                      value={unoStacking}
                      onChange={(v) => onUnoRuleChange({ uno_stacking: v })}
                    />
                    <Toggle
                      label="Jump-In"
                      description="Hold an exact match for the top card (same colour + number/symbol)? Play it instantly, out of turn — skipped players lose that turn. Wilds can’t be jumped."
                      value={unoJumpIn}
                      onChange={(v) => onUnoRuleChange({ uno_jump_in: v })}
                    />
                  </>
                ) : (
                  <p className="text-xs text-faint">
                    Locked in High Stakes: 0-7 and Draw-card stacking (equal-or-higher chains). WD4 challenges and
                    Jump-In are off.
                  </p>
                )}
              </div>
              {unoMode === 'classic' ? (
                <div>
                  <p className="label-caps text-[10px] mb-1.5">Multi-Play</p>
                  <HostLobbyOptionChips
                    value={unoMultiPlayMode}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'same_color_or_number', label: 'Colour or №' },
                      { value: 'same_color', label: 'Colour' },
                      { value: 'same_number', label: 'Number' },
                    ]}
                    onChange={(v) => onUnoRuleChange({ uno_multi_play_mode: v })}
                  />
                  <p className="mt-1 text-xs text-faint">Lay several matching cards in one turn.</p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Toggle
                  label="Series scoring"
                  description="Award points to the round winner (opponents' hand values + 250 per Mercy knockout). First to the target wins the series."
                  value={unoSeriesScoring}
                  onChange={(v) => onUnoRuleChange({ uno_series_scoring: v })}
                />
                {unoSeriesScoring ? (
                  <div>
                    <p className="label-caps text-[10px] mb-1.5">Series target</p>
                    <HostLobbyOptionChips
                      value={unoSeriesTarget}
                      options={[
                        { value: 300, label: '300' },
                        { value: 500, label: '500' },
                        { value: 1000, label: '1000' },
                        { value: 2000, label: '2000' },
                      ]}
                      onChange={(v) => onUnoRuleChange({ uno_series_target: v })}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </HostLobbySettingBlock>
        )}

        {boardGameType === 'ludo' && (
          <HostLobbySettingBlock title="Rules" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={ludoVariant === 'modern'}
                onClick={() => onLudoVariantChange('modern')}
                className="px-2.5 py-1.5 text-xs font-semibold"
              >
                Modern
              </Chip>
              <Chip
                active={ludoVariant === 'traditional'}
                onClick={() => onLudoVariantChange('traditional')}
                className="px-2.5 py-1.5 text-xs font-semibold"
              >
                Traditional
              </Chip>
            </div>
            <p className="mt-1.5 text-xs text-white/60">
              {ludoVariant === 'traditional'
                ? 'No safe squares on the track — only your own home column is protected.'
                : 'Every start and the 4 star squares are safe from capture.'}
            </p>
          </HostLobbySettingBlock>
        )}

        {boardGameType === 'mahjong' && <HostMahjongLobbySettings game={game} onPatchSettings={patchSettings} />}
      </div>
    </HostLobbySettingsSection>
  )
}
