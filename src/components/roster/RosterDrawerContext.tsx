'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { playerIsViewer } from '@/lib/viewers'
import type { Game, Player } from '@/types'

/**
 * A single row in the roster drawer — one unified list of "who's here" that
 * merges the old separate roster + leaderboard. Identity (seat/name/status)
 * comes from the game roster via {@link useRosterBase}; the score is layered on
 * by the game view via {@link useGameScores}.
 *
 * This is the web port of `apps/mobile/components/session/RosterDrawerContext`.
 * Keep the two in sync — the shape and merge semantics are intentionally
 * identical so a game behaves the same on both platforms.
 */
export type RosterRow = {
  id: string
  name: string
  /** 1-based display index in join order. */
  seat: number
  /** Layered on by the game view; omit for games with no score concept. */
  score?: number | string | null
  /** Unit shown after a numeric score, e.g. " pts". */
  scoreSuffix?: string
  isMe?: boolean
  viewer?: boolean
  eliminated?: boolean
  /** This row is the game's host — drives the "HOST" pill. */
  host?: boolean
  /**
   * 1-based finishing place layered on by the game view — 1 = winner, 2 =
   * runner-up, … — drives the medal pill. Omit for players who haven't placed.
   */
  placement?: number
  /** Free-form badge, e.g. "Team Red". */
  status?: string
}

type ScoreRegistration = {
  scores: Record<string, number | string> | null
  suffix?: string
}

/** Per-player 1-based finishing place (1 = winner) keyed by player id. */
type PlacementRegistration = Record<string, number> | null

type ManageConfig = {
  /** The host's own player id, so their row never shows a Remove button. */
  hostPlayerId: string | null
  onRemove: (row: RosterRow) => void
}

type RosterDrawerValue = {
  open: boolean
  setOpen: (open: boolean) => void
  rows: RosterRow[]
  /** Participants (excludes viewers) — drives the header count badge. */
  participantCount: number
  manage: ManageConfig | null
  registerBase: (rows: RosterRow[] | null) => void
  registerScores: (reg: ScoreRegistration | null) => void
  registerPlacements: (reg: PlacementRegistration) => void
  registerManage: (config: ManageConfig | null) => void
  registerOverride: (rows: RosterRow[] | null) => void
}

const RosterDrawerContext = createContext<RosterDrawerValue | null>(null)

/**
 * Derive the identity rows (seat/name/viewer/eliminated/isMe) from a game
 * roster. Shared by {@link useRosterBase} so every game produces identical rows.
 */
export function deriveBaseRows(
  players: readonly Player[] | undefined,
  game: Game | null | undefined,
  myPlayerId: string | null | undefined
): RosterRow[] {
  if (!players?.length) return []
  const hostId = game?.host_player_id ?? null
  return players.map((p, index) => ({
    id: p.id,
    name: p.name,
    seat: index + 1,
    isMe: !!myPlayerId && p.id === myPlayerId,
    viewer: game ? playerIsViewer(p, game) : !!p.spectator,
    eliminated: !!p.is_eliminated,
    // Cross-client host badge: lights up once game.host_player_id is populated +
    // read (migration 20260718140000 + GAME_SELECT). Until then the host's own
    // client still badges itself via the roster manage config (see RosterDrawer).
    host: !!hostId && p.id === hostId,
  }))
}

function sortRows(rows: RosterRow[]): RosterRow[] {
  const hasNumericScore = rows.some((r) => typeof r.score === 'number')
  return [...rows].sort((a, b) => {
    // Placed players (winner, runner-up, …) always float to the top in finishing
    // order — a Whot/Crazy8 winner is flagged "out" so the viewer rule below would
    // otherwise sink them beneath still-playing losers.
    if (a.placement != null || b.placement != null) {
      if (a.placement == null) return 1
      if (b.placement == null) return -1
      if (a.placement !== b.placement) return a.placement - b.placement
    }
    // Watchers (spectators) always sink below active players, so the drawer reads
    // as "who's playing, then who's watching" — the main value on board games
    // where player names are already on the board.
    if (!!a.viewer !== !!b.viewer) return a.viewer ? 1 : -1
    if (hasNumericScore) {
      const av = typeof a.score === 'number' ? a.score : Number.NEGATIVE_INFINITY
      const bv = typeof b.score === 'number' ? b.score : Number.NEGATIVE_INFINITY
      if (av !== bv) return bv - av
    }
    return a.seat - b.seat
  })
}

export function RosterDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [base, setBase] = useState<RosterRow[] | null>(null)
  const [scoreReg, setScoreReg] = useState<ScoreRegistration | null>(null)
  const [placementReg, setPlacementReg] = useState<PlacementRegistration>(null)
  const [manage, setManage] = useState<ManageConfig | null>(null)
  const [override, setOverride] = useState<RosterRow[] | null>(null)

  const rows = useMemo(() => {
    // A game view can hand fully-formed rows straight through (e.g. name-keyed
    // poll rows that can't join the player roster) — take them verbatim.
    if (override) return override
    const identity = base ?? []
    const scores = scoreReg?.scores
    const suffix = scoreReg?.suffix
    const scored = scores
      ? identity.map((r) => (r.id in scores ? { ...r, score: scores[r.id], scoreSuffix: suffix } : r))
      : identity
    const joined = placementReg
      ? scored.map((r) => (r.id in placementReg ? { ...r, placement: placementReg[r.id] } : r))
      : scored
    return sortRows(joined)
  }, [override, base, scoreReg, placementReg])

  const participantCount = useMemo(() => rows.filter((r) => !r.viewer).length, [rows])

  // Close the drawer when there's nothing to show — e.g. the game finishes and
  // the view unmounts, nulling the base rows out from under an open drawer.
  useEffect(() => {
    if (open && rows.length === 0) setOpen(false)
  }, [open, rows.length])

  const value = useMemo<RosterDrawerValue>(
    () => ({
      open,
      setOpen,
      rows,
      participantCount,
      manage,
      registerBase: setBase,
      registerScores: setScoreReg,
      registerPlacements: setPlacementReg,
      registerManage: setManage,
      registerOverride: setOverride,
    }),
    [open, rows, participantCount, manage]
  )

  return <RosterDrawerContext.Provider value={value}>{children}</RosterDrawerContext.Provider>
}

/** Read/control the drawer open state (the header button + the drawer itself). */
export function useRosterDrawer() {
  return useContext(RosterDrawerContext)
}

/**
 * Register the roster identity rows for as long as the caller is mounted. Called
 * once per session (host: HostGameLayout, player: PollGamePlayerExperience) —
 * this alone gives every game a plain roster drawer. Safe to call
 * unconditionally; recomputes when the roster changes.
 */
export function useRosterBase(
  players: readonly Player[] | undefined,
  game: Game | null | undefined,
  myPlayerId: string | null | undefined
) {
  const ctx = useContext(RosterDrawerContext)
  const register = ctx?.registerBase
  const rows = useMemo(() => deriveBaseRows(players, game, myPlayerId), [players, game, myPlayerId])
  useEffect(() => {
    if (!register) return
    register(rows)
    return () => register(null)
  }, [register, rows])
}

/**
 * Layer per-player scores onto the roster drawer for as long as the caller is
 * mounted. Pass `null` to contribute no scores (the drawer falls back to a plain
 * roster). Memoize the `scores` map at the call site to avoid churn.
 */
export function useGameScores(scores: Record<string, number | string> | null, opts?: { suffix?: string }) {
  const ctx = useContext(RosterDrawerContext)
  const register = ctx?.registerScores
  const suffix = opts?.suffix
  useEffect(() => {
    if (!register) return
    register({ scores, suffix })
    return () => register(null)
  }, [register, scores, suffix])
}

/**
 * Layer per-player finishing places onto the roster drawer for as long as the
 * caller is mounted — 1 = winner, 2 = runner-up, … — driving a medal pill. Pass
 * `null` for games with no placement concept. Memoize the map at the call site.
 */
export function useGamePlacements(placements: Record<string, number> | null) {
  const ctx = useContext(RosterDrawerContext)
  const register = ctx?.registerPlacements
  useEffect(() => {
    if (!register) return
    register(placements)
    return () => register(null)
  }, [register, placements])
}

/**
 * Enable per-row Remove in the drawer for a host. Pass `null` (or omit while not
 * hosting) to hide the Remove action. `onRemove` receives the roster row.
 */
export function useRosterManage(config: ManageConfig | null) {
  const ctx = useContext(RosterDrawerContext)
  const register = ctx?.registerManage
  const hostPlayerId = config?.hostPlayerId ?? null
  const onRemove = config?.onRemove
  useEffect(() => {
    if (!register) return
    register(onRemove ? { hostPlayerId, onRemove } : null)
    return () => register(null)
  }, [register, hostPlayerId, onRemove])
}

/**
 * Hand the drawer fully-formed rows, bypassing the roster join. Use when rows
 * can't be keyed by player id (e.g. poll rounds keyed by name). Pass `null` to
 * release the override.
 */
export function useRosterRowsOverride(rows: RosterRow[] | null) {
  const ctx = useContext(RosterDrawerContext)
  const register = ctx?.registerOverride
  useEffect(() => {
    if (!register) return
    register(rows)
    return () => register(null)
  }, [register, rows])
}
