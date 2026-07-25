import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Chess } from 'chess.js'
import type { ChessColor } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { ChessPieceGlyph } from './ChessPieceGlyph'
import type { ChessPieceSet, ChessPieceType } from './chess-appearance'

/**
 * Captured-pieces tray + material tally. Mirrors src/components/chess/ChessBoard.tsx
 * (CapturedTray + computeMaterial). Each side shows the enemy pieces it has taken
 * (rendered with the themed piece glyphs) so players can read material at a glance.
 */

const CAPTURABLE_TYPES: ChessPieceType[] = ['q', 'r', 'b', 'n', 'p']
const STARTING_COUNT: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }

export type ChessMaterial = {
  /** Black pieces removed from the board — i.e. captured by White. */
  capturedByWhite: ChessPieceType[]
  /** White pieces removed from the board — i.e. captured by Black. */
  capturedByBlack: ChessPieceType[]
}

export function computeMaterial(chess: Chess): ChessMaterial {
  const counts: Record<ChessColor, Record<string, number>> = {
    w: { q: 0, r: 0, b: 0, n: 0, p: 0 },
    b: { q: 0, r: 0, b: 0, n: 0, p: 0 },
  }
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type !== 'k') counts[cell.color][cell.type] += 1
    }
  }

  const capturedByWhite: ChessPieceType[] = []
  const capturedByBlack: ChessPieceType[] = []

  for (const type of CAPTURABLE_TYPES) {
    // Promotions can leave more than the starting count; clamp at 0.
    const missingBlack = Math.max(0, STARTING_COUNT[type] - counts.b[type])
    const missingWhite = Math.max(0, STARTING_COUNT[type] - counts.w[type])
    for (let i = 0; i < missingBlack; i += 1) capturedByWhite.push(type)
    for (let i = 0; i < missingWhite; i += 1) capturedByBlack.push(type)
  }

  return { capturedByWhite, capturedByBlack }
}

/** Side indicator with fixed piece colours (plus a contrasting outline) so it
 *  never inverts with the light/dark theme, matching web's KingGlyph. */
export function KingGlyph({ color, size = 16 }: { color: ChessColor; size?: number }) {
  return (
    <Text
      style={{
        color: color === 'w' ? '#f5f5f5' : '#1a1a1a',
        fontSize: size,
        textShadowColor: color === 'w' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)',
        textShadowRadius: 1.5,
      }}
    >
      {'♚'}
    </Text>
  )
}

/** Collapse repeated captures into type+count (e.g. 6 pawns -> one pawn glyph + "×6") so a
 *  long capture streak never grows past 5 icons (one per piece type) and can't force a wrap
 *  mid-name. Order follows {@link CAPTURABLE_TYPES} (queen down to pawn). */
function groupPieces(pieces: ChessPieceType[]): { type: ChessPieceType; count: number }[] {
  const counts = new Map<ChessPieceType, number>()
  for (const type of pieces) counts.set(type, (counts.get(type) ?? 0) + 1)
  return CAPTURABLE_TYPES.filter((type) => counts.has(type)).map((type) => ({ type, count: counts.get(type)! }))
}

/** One combined captured-material line for both sides (e.g. "ADA ♟ · KOJO ♙×6"), sitting
 *  below the player cards. Each entry that has no captures yet is skipped. */
export function ChessCapturedSummary({
  entries,
  set,
}: {
  entries: { name: string; pieces: ChessPieceType[]; glyphColor: ChessColor }[]
  set: ChessPieceSet
}) {
  const styles = useThemedStyles(makeStyles)
  const shown = entries.filter((e) => e.pieces.length > 0)
  if (shown.length === 0) return null
  return (
    <View style={styles.summaryRow}>
      {shown.map((e, i) => (
        <View key={e.name + i} style={styles.summaryItem}>
          {i > 0 ? <Text style={styles.summaryDot}>·</Text> : null}
          <Text style={styles.summaryName} numberOfLines={1}>
            {e.name.toUpperCase()}
          </Text>
          {groupPieces(e.pieces).map(({ type, count }) => (
            <View key={type} style={styles.summaryPiece}>
              <ChessPieceGlyph set={set} color={e.glyphColor} type={type} size={14} />
              {count > 1 ? <Text style={styles.summaryCount}>×{count}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** A player identity card: avatar, name, colour label, and (optionally) a live clock —
 *  two of these sit side by side above the board, mirroring the chess.com-style header. */
export function ChessPlayerCard({
  name,
  color,
  clock,
  active,
}: {
  name: string
  color: ChessColor
  clock?: ReactNode
  active?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <View style={[styles.avatar, color === 'w' ? styles.avatarWhite : styles.avatarBlack]}>
        <Text style={[styles.avatarText, color === 'w' ? styles.avatarTextWhite : styles.avatarTextBlack]}>
          {initial}
        </Text>
      </View>
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.colorLabel}>{color === 'w' ? 'White' : 'Black'}</Text>
      </View>
      {clock ? (
        <View style={styles.clockSlot}>
          {active ? <View style={styles.activeDot} /> : null}
          {clock}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 2,
    },
    summaryItem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
    summaryDot: { color: theme.textFaint, fontSize: 12, marginRight: 2 },
    summaryName: { color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, marginRight: 1 },
    summaryPiece: { flexDirection: 'row', alignItems: 'center' },
    summaryCount: { color: theme.textFaint, fontSize: 10, fontWeight: '700', marginLeft: 1 },
    card: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 52,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    cardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarWhite: { backgroundColor: theme.primarySoft },
    avatarBlack: { backgroundColor: '#1a1a1a' },
    avatarText: { fontWeight: '800', fontSize: 13 },
    avatarTextWhite: { color: theme.primary },
    avatarTextBlack: { color: '#f5f5f5' },
    identity: { flex: 1, minWidth: 0 },
    name: { color: theme.text, fontSize: 13, fontWeight: '700' },
    colorLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
    clockSlot: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
    activeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.success },
  })
