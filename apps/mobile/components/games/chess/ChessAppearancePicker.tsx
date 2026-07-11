import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import {
  BOARD_THEMES,
  PIECE_SETS,
  useChessAppearance,
  type ChessAppearanceDefaults,
} from './chess-appearance'
import { ChessPieceGlyph } from './ChessPieceGlyph'

/**
 * Personal, per-device picker for the board colors and piece style. Collapsed by
 * default; the chosen look is saved to SecureStore and applies instantly to this
 * player's board only. Falls back to the host's chosen defaults until the player
 * picks their own. Mirrors src/components/chess/ChessAppearancePicker.tsx.
 */
export function ChessAppearancePicker({ defaults }: { defaults?: ChessAppearanceDefaults }) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const {
    boardTheme,
    pieceSet,
    boardThemeIsOverride,
    pieceSetIsOverride,
    setBoardTheme,
    setPieceSet,
    resetBoardTheme,
    resetPieceSet,
  } = useChessAppearance(defaults)
  const canReset = boardThemeIsOverride || pieceSetIsOverride

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.headerIcon}>🎨</Text>
        <Text style={styles.headerTitle}>Board &amp; pieces</Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {boardTheme.name} · {pieceSet.name}
        </Text>
        <Text style={styles.headerAction}>{open ? 'Done ▴' : 'Change ▾'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>Board</Text>
          <View style={styles.row}>
            {BOARD_THEMES.map((theme) => {
              const active = theme.id === boardTheme.id
              return (
                <Pressable
                  key={theme.id}
                  onPress={() => {
                    if (!active) setBoardTheme(theme.id)
                  }}
                  style={[styles.swatch, active && styles.swatchActive]}
                >
                  <View style={styles.swatchGrid}>
                    <View style={[styles.swatchCell, { backgroundColor: theme.light }]} />
                    <View style={[styles.swatchCell, { backgroundColor: theme.dark }]} />
                    <View style={[styles.swatchCell, { backgroundColor: theme.dark }]} />
                    <View style={[styles.swatchCell, { backgroundColor: theme.light }]} />
                  </View>
                </Pressable>
              )
            })}
          </View>

          <Text style={styles.sectionLabel}>Pieces</Text>
          <View style={styles.row}>
            {PIECE_SETS.map((set) => {
              const active = set.id === pieceSet.id
              return (
                <Pressable
                  key={set.id}
                  onPress={() => {
                    if (!active) setPieceSet(set.id)
                  }}
                  style={[styles.pieceOption, active && styles.pieceOptionActive]}
                >
                  <View style={styles.pieceRow}>
                    <ChessPieceGlyph set={set} color="w" type="n" size={24} />
                    <ChessPieceGlyph set={set} color="b" type="n" size={24} />
                  </View>
                  <Text style={styles.pieceName}>{set.name}</Text>
                </Pressable>
              )
            })}
          </View>

          {canReset ? (
            <Pressable
              onPress={() => {
                resetBoardTheme()
                resetPieceSet()
              }}
            >
              <Text style={styles.reset}>Reset to host's default</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', marginTop: 12 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    headerIcon: { fontSize: 16 },
    headerTitle: { color: theme.text, fontWeight: '700' },
    headerSub: { color: theme.textMuted, fontSize: 12, flex: 1 },
    headerAction: { color: theme.primary, fontWeight: '700', fontSize: 12 },
    body: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surface,
      padding: 12,
      gap: 8,
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
    },
    swatchActive: { borderWidth: 2, borderColor: theme.primary },
    swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', height: '100%' },
    swatchCell: { width: '50%', height: '50%' },
    pieceOption: {
      alignItems: 'center',
      gap: 2,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: '#b58863',
    },
    pieceOptionActive: { borderWidth: 2, borderColor: theme.primary },
    pieceRow: { flexDirection: 'row', gap: 2 },
    pieceName: { fontSize: 10, fontWeight: '700', color: '#ffffff' },
    reset: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      textDecorationLine: 'underline',
      marginTop: 4,
    },
  })
