import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Chess, type Square } from 'chess.js'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { ChessPieceGlyph } from './ChessPieceGlyph'
import {
  type ChessAppearanceDefaults,
  type ChessPieceType,
  useChessAppearance,
} from './chess-appearance'

/**
 * A compact, non-interactive board showing a fixed position (the final FEN).
 * Mirrors src/components/chess/ChessFinalResultsShareBlock.tsx (ReadOnlyBoard) —
 * the results/share snapshot of where the game ended.
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const
const CELL = 30

export function ChessReadOnlyBoard({
  fen,
  defaults,
}: {
  fen: string
  defaults?: ChessAppearanceDefaults
}) {
  const styles = useThemedStyles(makeStyles)
  const { boardTheme, pieceSet } = useChessAppearance(defaults)
  const chess = useMemo(() => {
    const c = new Chess()
    try {
      c.load(fen)
    } catch {
      // keep starting position on a bad FEN
    }
    return c
  }, [fen])

  return (
    <View style={styles.board}>
      {RANKS.map((rank) => (
        <View key={rank} style={styles.row}>
          {FILES.map((file) => {
            const square = `${file}${rank}`
            const piece = chess.get(square as Square)
            // Light when (file index + rank) is even, so a1 is dark and a8/h1 are
            // light — the canonical board (matches ChessBoard).
            const isLight = (FILES.indexOf(file) + rank) % 2 === 0
            return (
              <View
                key={square}
                style={[styles.square, { backgroundColor: isLight ? boardTheme.light : boardTheme.dark }]}
              >
                {piece ? (
                  <ChessPieceGlyph
                    set={pieceSet}
                    color={piece.color}
                    type={piece.type as ChessPieceType}
                    size={CELL - 4}
                  />
                ) : null}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    board: {
      alignSelf: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 8,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row' },
    square: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  })
