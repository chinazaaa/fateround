'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameSupportsViewerSetting } from '@/lib/viewers'
import { Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

const MAFIA_NIGHT_TIMER_OPTIONS = [30, 45, 60, 90, 120, 180] as const
const MAFIA_DAY_TIMER_OPTIONS = [45, 60, 90, 120, 180, 300] as const
const MAFIA_VOTING_TIMER_OPTIONS = [20, 30, 45, 60, 90] as const

// Role selection is fully automatic (see resolveMafiaRoundToggles in @/lib/mafia): a fixed
// core is always in, the investigator trio (Aura Seer/Seer/Detective) and Mafia specialist
// pool rotate every game, and this single switch swaps three Classic roles for their Advanced
// counterpart — no more picking each role on/off individually.

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  playerCount: number
  /** Ready (non-spectator) players — the count that actually consumes a cap seat.
   *  Defaults to `playerCount` for callers that haven't opted in. */
  seatedCount?: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

function shortTimerLabel(seconds: number): string {
  if (seconds === 60) return '1m'
  if (seconds === 90) return '1.5m'
  if (seconds === 120) return '2m'
  if (seconds === 180) return '3m'
  if (seconds === 300) return '5m'
  return `${seconds}s`
}

export function HostMafiaLobbyPanel({ gameCode, hostToken, game, playerCount, seatedCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(10)
  const [nightTimer, setNightTimer] = useState(60)
  const [dayTimer, setDayTimer] = useState(90)
  const [votingTimer, setVotingTimer] = useState(45)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [anonymousVotes, setAnonymousVotes] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Each setting change fires its own independent PATCH request, and each response carries
  // a full game-row snapshot that gets synced back into local state below. Over a real
  // network (unlike localhost) two requests fired close together can have their responses
  // arrive out of order — a slower request's now-stale snapshot landing after a faster one
  // would silently overwrite whatever the faster one just set. This counter lets a response
  // detect it's no longer the latest in-flight request and skip applying its snapshot.
  const patchSeqRef = useRef(0)
  // The host lobby also polls/realtime-syncs in the background completely independently of
  // any settings change (see MafiaHostView's usePolling on POLL_INTERVALS.lobby) — that read
  // can land in the split second before this panel's own patch has committed server-side,
  // then flow back down through this same `game` prop and get re-applied by the sync effect
  // below, silently reverting the field the host just changed. patchSeqRef alone doesn't
  // catch this because the poll's `load()` call is genuinely a separate, later-issued call —
  // it just happens to read stale data. So each locally-changed field gets a short grace
  // window during which the sync effect trusts the local value over whatever `game` says,
  // long enough for the in-flight patch to actually commit and for the next poll to reflect it.
  const pendingUntilRef = useRef<Partial<Record<'night' | 'day' | 'voting' | 'advanced' | 'anonymous', number>>>({})
  const GRACE_MS = 4000
  const markPending = (field: keyof typeof pendingUntilRef.current) => {
    pendingUntilRef.current[field] = Date.now() + GRACE_MS
  }

  useEffect(() => {
    void fetch('/api/game-limits')
      .then((res) => res.json())
      .then((data: { limits?: GamePlayerLimitsMap }) => {
        if (data.limits) setLimits(data.limits)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!limits) return
    const now = Date.now()
    const isPending = (field: keyof typeof pendingUntilRef.current) => (pendingUntilRef.current[field] ?? 0) > now
    setMaxPlayers(lobbyMaxPlayersFromGame('mafia', game, limits))
    if (!isPending('night')) setNightTimer(game.timer_seconds ?? 60)
    if (!isPending('day')) setDayTimer(game.mafia_day_seconds ?? 90)
    if (!isPending('voting')) setVotingTimer(game.mafia_voting_seconds ?? 45)
    if (!isPending('anonymous')) setAnonymousVotes(game.mafia_anonymous_votes === true)
    if (!isPending('advanced')) setAdvancedMode(game.mafia_advanced_mode === true)
  }, [game, limits])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.mafia
  const minPlayers = limitCfg?.min ?? 5
  const maxCap = limitCfg?.max ?? 20

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>) => {
      const seq = ++patchSeqRef.current
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
        // Only the most recently issued request may apply its snapshot — an older request
        // that happens to resolve later would otherwise stomp a newer change with stale data.
        if (data.game && patchSeqRef.current === seq) onGameUpdate(data.game)
        if (patchSeqRef.current === seq) markSaved()
      } catch (err) {
        if (patchSeqRef.current === seq) {
          setSaveState('idle')
          toastError(err instanceof Error ? err.message : 'Failed to save settings')
        }
      }
    },
    [gameCode, hostToken, markSaved, onGameUpdate, toastError]
  )

  const onMaxPlayersChange = (next: number) => {
    // Only ready (non-spectator) players count against the cap — matches the server. Not-ready
    // players are `spectator: true`, so counting them here would refuse a valid lower-cap change
    // while they watch. seatedCount defaults to playerCount for callers that haven't opted in.
    const effectiveSeated = seatedCount ?? playerCount
    if (next < effectiveSeated) {
      toastError(
        `Already have ${effectiveSeated} seated player${effectiveSeated === 1 ? '' : 's'} — remove someone or pick at least ${effectiveSeated}`
      )
      return
    }
    setMaxPlayers(next)
    void patchSettings({ max_players: next })
  }

  const onNightTimerChange = (next: number) => {
    markPending('night')
    setNightTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const onDayTimerChange = (next: number) => {
    markPending('day')
    setDayTimer(next)
    void patchSettings({ mafia_day_seconds: next })
  }

  const onVotingTimerChange = (next: number) => {
    markPending('voting')
    setVotingTimer(next)
    void patchSettings({ mafia_voting_seconds: next })
  }

  const onAdvancedModeChange = (next: boolean) => {
    markPending('advanced')
    setAdvancedMode(next)
    void patchSettings({ mafia_advanced_mode: next })
  }

  const onAnonymousVotesChange = (next: boolean) => {
    markPending('anonymous')
    setAnonymousVotes(next)
    void patchSettings({ mafia_anonymous_votes: next })
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const nightTimerOptions = useMemo(
    () => MAFIA_NIGHT_TIMER_OPTIONS.map((s) => ({ value: s, label: shortTimerLabel(s) })),
    []
  )
  const dayTimerOptions = useMemo(
    () => MAFIA_DAY_TIMER_OPTIONS.map((s) => ({ value: s, label: shortTimerLabel(s) })),
    []
  )
  const votingTimerOptions = useMemo(
    () => MAFIA_VOTING_TIMER_OPTIONS.map((s) => ({ value: s, label: shortTimerLabel(s) })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Night timer">
        <HostLobbyOptionChips value={nightTimer} options={nightTimerOptions} onChange={onNightTimerChange} />
        <p className="text-xs text-muted pt-1.5">How long night-action roles get to submit their move.</p>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Day discussion timer">
        <HostLobbyOptionChips value={dayTimer} options={dayTimerOptions} onChange={onDayTimerChange} />
        <p className="text-xs text-muted pt-1.5">How long the town gets to talk before voting opens.</p>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Voting timer">
        <HostLobbyOptionChips value={votingTimer} options={votingTimerOptions} onChange={onVotingTimerChange} />
        <p className="text-xs text-muted pt-1.5">How long players get to cast their lynch vote.</p>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Role set">
        <div className="space-y-2 pt-1">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onAdvancedModeChange(false)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                !advancedMode
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'border-[var(--border)] text-muted'
              }`}
            >
              Classic
            </button>
            <button
              type="button"
              onClick={() => onAdvancedModeChange(true)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                advancedMode
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'border-[var(--border)] text-muted'
              }`}
            >
              Advanced
            </button>
          </div>
          <p className="text-xs text-muted">
            {advancedMode
              ? 'Trapper, Arsonist, and Vigilante replace Bodyguard, Serial Killer, and Priest — Witch and Little Girl join the mix too.'
              : 'The classic power roles: Bodyguard, Serial Killer, and Priest.'}
          </p>
          <p className="text-xs text-muted">
            Everything else is automatic — Aura Seer/Seer/Detective rotate (only 2 of the 3 each game), and the Mafia's
            specialist lineup varies too.
          </p>
        </div>
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Voting rules">
        <div className="pt-1">
          <Toggle
            label="Anonymous votes"
            description="Hide who voted for whom during the day phase"
            value={anonymousVotes}
            onChange={onAnonymousVotesChange}
          />
        </div>
      </HostLobbySettingBlock>
    </HostLobbySettingsSection>
  )
}
