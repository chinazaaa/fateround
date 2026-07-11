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

/** A player's row: name, captured opponent pieces, and (optionally) a clock. */
export function CapturedTray({
  name,
  pieces,
  glyphColor,
  set,
  clock,
}: {
  name: string
  pieces: ChessPieceType[]
  glyphColor: ChessColor
  set: ChessPieceSet
  clock?: ReactNode
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.tray}>
      <Text style={styles.name} numberOfLines={1}>
        <KingGlyph color={glyphColor} /> {name}
      </Text>
      <View style={styles.pieces}>
        {pieces.map((type, i) => (
          <ChessPieceGlyph key={`${type}-${i}`} set={set} color={glyphColor} type={type} size={18} />
        ))}
      </View>
      {clock ? <View style={styles.clockSlot}>{clock}</View> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tray: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 26,
      paddingHorizontal: 2,
    },
    name: { color: theme.text, fontSize: 12, fontWeight: '700', flexShrink: 0 },
    pieces: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1 },
    clockSlot: { marginLeft: 'auto' },
  })
