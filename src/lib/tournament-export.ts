import { hasGraduated, clampSchoolClassCount, schoolClassLabel } from './tournament-school'
import {
  buildLastRoundRank,
  orderForStandings,
  orderSchoolStandings,
} from '@/components/tournament/TournamentShareLeaderboard'
import type { Tournament, TournamentGame, TournamentPlayer } from '@/types/tournament'

/**
 * Whoever the tournament crowned. Format-aware:
 *
 *  - round-robin: highest total_points (games.length ≥ 1 so any tiebreaker
 *    happens naturally on the sort stability).
 *  - head-to-head / knockout: sole surviving (non-eliminated) player, if one
 *    remains. If the host ended the tournament early with multiple survivors,
 *    the bracket has no clean winner — we return null and callers skip the
 *    certificate rather than crowning someone who didn't actually win.
 *  - school: whoever graduated past the top class (preferring one who
 *    actually won their final Whot room), else the sole survivor.
 *
 * Returns null when there's no meaningful champion (empty tournament, tie
 * that never resolved, host ended early with several players still in).
 */
export function resolveTournamentChampion(
  tournament: Tournament,
  players: TournamentPlayer[],
  games: TournamentGame[]
): TournamentPlayer | null {
  if (!players.length) return null

  const format = tournament.format
  const survivors = players.filter((p) => !p.is_eliminated)

  if (format === 'head-to-head' || format === 'knockout') {
    // Bracket-style: only crown when exactly one player is left standing.
    return survivors.length === 1 ? (survivors[0] ?? null) : null
  }

  if (format === 'school') {
    const cap = clampSchoolClassCount(
      (tournament.game_config as { schoolClassCount?: number } | null)?.schoolClassCount
    )
    const graduates = players.filter((p) => hasGraduated(p.school_level ?? 0, cap))
    const roomWinner = graduates.find((p) => games.some((g) => g.winner_player_id === p.id))
    if (roomWinner) return roomWinner
    if (graduates[0]) return graduates[0]
    return survivors.length === 1 ? (survivors[0] ?? null) : null
  }

  // Round-robin: highest total_points, with a stable order — no artificial
  // tiebreaker beyond join order (matches what the leaderboard renders).
  const sorted = [...players].sort((a, b) => b.total_points - a.total_points)
  return sorted[0] ?? null
}

/**
 * Ordered standings for the CSV / certificate summary — matches the visible
 * leaderboard's ordering exactly so the exported artifact never contradicts
 * what the room saw on screen. Uses the same helpers the on-screen
 * TournamentShareLeaderboard uses.
 */
export function orderForExport(
  tournament: Tournament,
  players: TournamentPlayer[],
  games: TournamentGame[]
): TournamentPlayer[] {
  const knockout = tournament.format === 'knockout'
  const h2h = tournament.format === 'head-to-head' || knockout
  if (tournament.format === 'school') return orderSchoolStandings(players)
  if (h2h) return orderForStandings(players, true, knockout ? buildLastRoundRank(games) : undefined)
  // Round-robin: sorted by points desc.
  return [...players].sort((a, b) => b.total_points - a.total_points)
}

const CSV_HEADERS_ROUND_ROBIN = ['Rank', 'Player', 'Points', 'Games Played', 'Lives Left', 'Status'] as const
const CSV_HEADERS_BRACKET = ['Rank', 'Player', 'Games Played', 'Status'] as const
const CSV_HEADERS_SCHOOL = ['Rank', 'Player', 'Class Reached', 'Status'] as const

/** RFC-4180-ish escape: wrap in quotes and double any inner quotes. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

/**
 * Build a participation CSV — one row per player, ordered by final standing.
 * Column set adapts to the format so an organiser handing this to their
 * manager or teacher can read it without a legend:
 *
 *  - round-robin: Rank, Player, Points, Games Played, Lives Left, Status
 *  - h2h / knockout: Rank, Player, Games Played, Status
 *  - school: Rank, Player, Class Reached, Status
 *
 * The tournament title, date and format are added as a header block above
 * the data rows (CSV parsers that read comma-separated values as tables still
 * accept a header block — Excel/Numbers/Sheets skip it once they hit "Rank").
 */
export function buildParticipationCsv(
  tournament: Tournament,
  players: TournamentPlayer[],
  games: TournamentGame[]
): string {
  const ranked = orderForExport(tournament, players, games)
  const format = tournament.format
  const isRR = format === 'round-robin'
  const isSchool = format === 'school'
  const cap = clampSchoolClassCount((tournament.game_config as { schoolClassCount?: number } | null)?.schoolClassCount)

  const headerBlock = [
    csvRow(['Tournament', tournament.title]),
    csvRow(['Format', format]),
    csvRow(['Players', players.length]),
    csvRow(['Exported', new Date(tournament.created_at).toISOString().slice(0, 10)]),
    '',
  ]

  const columns = isRR ? CSV_HEADERS_ROUND_ROBIN : isSchool ? CSV_HEADERS_SCHOOL : CSV_HEADERS_BRACKET
  const rows = ranked.map((p, i) => {
    const rank = i + 1
    const status = p.is_eliminated ? 'Eliminated' : 'Active'
    if (isRR) {
      return csvRow([rank, p.player_name, p.total_points, p.games_played, p.lives_remaining ?? '', status])
    }
    if (isSchool) {
      return csvRow([rank, p.player_name, schoolClassLabel(p.school_level ?? 0, cap), status])
    }
    return csvRow([rank, p.player_name, p.games_played, status])
  })

  return [...headerBlock, csvRow([...columns]), ...rows].join('\n')
}

/** Turn a CSV string into a blob suitable for downloadBlobAsFile. */
export function csvBlob(csv: string): Blob {
  // Prepend a UTF-8 BOM so Excel opens non-ASCII names (é, ñ, …) correctly.
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
}
