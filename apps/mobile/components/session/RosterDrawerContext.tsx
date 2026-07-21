import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Game, Player } from '@fateround/shared'
import { playerIsViewer } from '@fateround/shared/viewers'

/**
 * A single row in the roster drawer — one unified list of "who's here" that
 * merges the old separate roster + leaderboard. Identity (seat/name/status)
 * comes from the game roster via {@link useRosterBase}; the score is layered on
 * by the game view via {@link useGameScores}.
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
  /**
   * Per-game live stat line layered on by the game view — e.g. "🃏 5 cards" for
   * Whot, "3 props · $1,240" for Monopoly, "4 words · 2:31" for a word game.
   * Renders as a muted sub-line under the name; turns the drawer into a live
   * scoreboard. Distinct from `score` (the single sortable headline metric).
   */
  detail?: string
  /** Reserved for a future presence feed — renders nothing while undefined. */
  connected?: boolean
}

type ScoreRegistration = {
  scores: Record<string, number | string> | null
  suffix?: string
}

/** Per-player 1-based finishing place (1 = winner) keyed by player id. */
type PlacementRegistration = Record<string, number> | null

/** Per-player game-specific stat line (e.g. card count), keyed by player id. */
type DetailRegistration = Record<string, string> | null

type ManageConfig = {
  /** The host's own player id, so their row never shows a Remove button. */
  hostPlayerId: string | null
  onRemove: (player: RosterRow) => void
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
  registerDetails: (reg: DetailRegistration) => void
  registerOverride: (rows: RosterRow[] | null) => void
}

const RosterDrawerContext = createContext<RosterDrawerValue | null>(null)

/**
 * Derive the identity rows (seat/name/viewer/eliminated/isMe) from a game
 * roster. Shared by {@link useRosterBase} (the authoritative path) and the
 * provider's fallback, so both produce identical rows.
 */
export function deriveBaseRows(
  players: Player[] | undefined,
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
    // Cross-client host badge (parity with web) — set once game.host_player_id is
    // populated + read (in GAME_SELECT). Harmless while undefined.
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

export function RosterDrawerProvider({
  children,
  /** Used only when no game view has registered base rows (e.g. a host console). */
  fallbackPlayers,
  fallbackGame,
  myPlayerId,
  /** Present only for a host who can remove players; enables per-row Remove. */
  manage,
}: {
  children: ReactNode
  fallbackPlayers?: Player[]
  fallbackGame?: Game | null
  myPlayerId?: string | null
  manage?: ManageConfig | null
}) {
  const [open, setOpen] = useState(false)
  const [base, setBase] = useState<RosterRow[] | null>(null)
  const [scoreReg, setScoreReg] = useState<ScoreRegistration | null>(null)
  const [placementReg, setPlacementReg] = useState<PlacementRegistration>(null)
  const [detailReg, setDetailReg] = useState<DetailRegistration>(null)
  const [override, setOverride] = useState<RosterRow[] | null>(null)

  const fallbackRows = useMemo(
    () => deriveBaseRows(fallbackPlayers, fallbackGame, myPlayerId),
    [fallbackPlayers, fallbackGame, myPlayerId]
  )

  const rows = useMemo(() => {
    // A game view can hand fully-formed rows straight through (e.g. name-keyed
    // poll rows that can't join the player roster) — take them verbatim.
    if (override) return override
    const identity = base ?? fallbackRows
    const scores = scoreReg?.scores
    const suffix = scoreReg?.suffix
    const scored = scores
      ? identity.map((r) => (r.id in scores ? { ...r, score: scores[r.id], scoreSuffix: suffix } : r))
      : identity
    const placed = placementReg
      ? scored.map((r) => (r.id in placementReg ? { ...r, placement: placementReg[r.id] } : r))
      : scored
    const joined = detailReg ? placed.map((r) => (r.id in detailReg ? { ...r, detail: detailReg[r.id] } : r)) : placed
    return sortRows(joined)
  }, [override, base, fallbackRows, scoreReg, placementReg, detailReg])

  const participantCount = useMemo(() => rows.filter((r) => !r.viewer).length, [rows])

  // Close the drawer when there's nothing to show — e.g. the game finishes and
  // GameShell unmounts, nulling the base rows out from under an open drawer.
  useEffect(() => {
    if (open && rows.length === 0) setOpen(false)
  }, [open, rows.length])

  const value = useMemo<RosterDrawerValue>(
    () => ({
      open,
      setOpen,
      rows,
      participantCount,
      manage: manage ?? null,
      registerBase: setBase,
      registerScores: setScoreReg,
      registerPlacements: setPlacementReg,
      registerDetails: setDetailReg,
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
 * once by GameShell — this alone gives every game a plain roster drawer. Safe to
 * call unconditionally; recomputes when the roster changes.
 */
export function useRosterBase(
  players: Player[] | undefined,
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
 * Layer a per-player game-specific stat line onto the roster drawer for as long
 * as the caller is mounted — e.g. `{ [id]: '🃏 5 cards' }` for Whot, or
 * `'3 props · $1,240'` for Monopoly. Renders as a muted sub-line under the name,
 * turning the drawer into a live scoreboard. Pass `null` to contribute none.
 * Memoize the map at the call site to avoid churn.
 */
export function useGameStats(details: Record<string, string> | null) {
  const ctx = useContext(RosterDrawerContext)
  const register = ctx?.registerDetails
  useEffect(() => {
    if (!register) return
    register(details)
    return () => register(null)
  }, [register, details])
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
