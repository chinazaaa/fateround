import { useCallback, useSyncExternalStore } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * Chess board + piece appearance is a purely cosmetic, per-device preference —
 * it never touches game state, so it lives in SecureStore (the RN analogue of
 * localStorage / chess.com board themes) rather than the synced game record.
 * Each player picks their own look; opponents are unaffected. The effective look
 * resolves as: player override → host default → global default.
 *
 * Mirrors src/lib/chess-appearance.ts on web. All six piece sets are `detailed`
 * (the light-body / dark-ink look), rendered by ChessPieceGlyph.
 */

export type ChessPieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'
export type PieceVariant = 'filled' | 'outline'

export type PieceFace = {
  variant: PieceVariant
  /** Body fill color. */
  color: string
  /** Silhouette / outline stroke color. */
  outline?: string
  /** Interior "ink" lines / accents (crown lines, knight eye). */
  detail?: string
}

export type ChessPieceSet = {
  id: string
  name: string
  style?: 'silhouette' | 'detailed'
  white: PieceFace
  black: PieceFace
}

export const PIECE_SETS: ChessPieceSet[] = [
  {
    id: 'neo',
    name: 'Neo',
    style: 'detailed',
    white: { variant: 'filled', color: '#f8f8f8', outline: '#4b4b4b', detail: '#4b4b4b' },
    black: { variant: 'filled', color: '#38352f', outline: '#0e0d0b', detail: '#e6e2db' },
  },
  {
    id: 'classic',
    name: 'Wood',
    style: 'detailed',
    white: { variant: 'filled', color: '#e2bd88', outline: '#6b4a2c', detail: '#6b4a2c' },
    black: { variant: 'filled', color: '#5b3a20', outline: '#2a1809', detail: '#e2bd88' },
  },
  {
    id: 'outline',
    name: 'Marble',
    style: 'detailed',
    white: { variant: 'filled', color: '#eef2f6', outline: '#3b4a57', detail: '#3b4a57' },
    black: { variant: 'filled', color: '#33404a', outline: '#10161b', detail: '#d4dee6' },
  },
  {
    id: 'ink',
    name: 'Ink',
    style: 'detailed',
    white: { variant: 'filled', color: '#fafafa', outline: '#171717', detail: '#171717' },
    black: { variant: 'filled', color: '#171717', outline: '#000000', detail: '#f0f0f0' },
  },
  {
    id: 'neon',
    name: 'Neon',
    style: 'detailed',
    white: { variant: 'filled', color: '#22d3ee', outline: '#0e7490', detail: '#ecfeff' },
    black: { variant: 'filled', color: '#e879f9', outline: '#86198f', detail: '#fdf4ff' },
  },
  {
    id: 'gold',
    name: 'Royal',
    style: 'detailed',
    white: { variant: 'filled', color: '#f5d67a', outline: '#7a5a12', detail: '#7a5a12' },
    black: { variant: 'filled', color: '#7f1d2e', outline: '#3f0d17', detail: '#f5d67a' },
  },
]

export type ChessBoardTheme = {
  id: string
  name: string
  light: string
  dark: string
}

export const BOARD_THEMES: ChessBoardTheme[] = [
  { id: 'green', name: 'Green', light: '#ebecd0', dark: '#739552' },
  { id: 'classic', name: 'Classic', light: '#eed9b5', dark: '#b58863' },
  { id: 'ocean', name: 'Ocean', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'midnight', name: 'Midnight', light: '#6b7a8a', dark: '#2c3a47' },
  { id: 'walnut', name: 'Walnut', light: '#e3c6a0', dark: '#7a4a2b' },
  { id: 'frost', name: 'Frost', light: '#eef4f8', dark: '#7393b3' },
  { id: 'grape', name: 'Grape', light: '#e9e1f3', dark: '#7a5ca8' },
  { id: 'rosewood', name: 'Rosewood', light: '#f0d9b5', dark: '#a5685e' },
]

export const DEFAULT_BOARD_THEME = BOARD_THEMES[0]
export const DEFAULT_PIECE_SET = PIECE_SETS[0]

export function boardThemeById(id: string | null | undefined): ChessBoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? DEFAULT_BOARD_THEME
}

export function pieceSetById(id: string | null | undefined): ChessPieceSet {
  return PIECE_SETS.find((s) => s.id === id) ?? DEFAULT_PIECE_SET
}

const STORAGE_KEY = 'kmk_chess_appearance'

/** A player's personal override. `null` for a field means "inherit the host default". */
type StoredOverride = { boardTheme: string | null; pieceSet: string | null }

const EMPTY_OVERRIDE: StoredOverride = { boardTheme: null, pieceSet: null }

export type ChessAppearanceDefaults = { boardTheme?: string | null; pieceSet?: string | null }

// Module-level cache + listener set implements a synchronous external store on
// top of the async SecureStore. We hydrate once (lazily) into `snapshot`, and
// every write updates `snapshot` synchronously and persists in the background,
// so useSyncExternalStore always has a stable value to read.
let snapshot: StoredOverride = EMPTY_OVERRIDE
let hydrated = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  SecureStore.getItemAsync(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return
      const parsed = JSON.parse(raw)
      const next: StoredOverride = {
        boardTheme: parsed?.boardTheme ? boardThemeById(parsed.boardTheme).id : null,
        pieceSet: parsed?.pieceSet ? pieceSetById(parsed.pieceSet).id : null,
      }
      if (next.boardTheme !== snapshot.boardTheme || next.pieceSet !== snapshot.pieceSet) {
        snapshot = next
        emit()
      }
    })
    .catch(() => {
      // storage unavailable / malformed — stay on the empty override
    })
}

function subscribe(onChange: () => void): () => void {
  hydrate()
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getSnapshot(): StoredOverride {
  return snapshot
}

function writeStored(next: StoredOverride): void {
  snapshot = next
  emit()
  SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {
    // best-effort; preference just won't persist across launches
  })
}

/**
 * Read + update the player's board-theme / piece-set choice. A player who never
 * touches the picker simply sees whatever the host chose.
 */
export function useChessAppearance(defaults?: ChessAppearanceDefaults) {
  const override = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const boardThemeId = override.boardTheme ?? defaults?.boardTheme ?? DEFAULT_BOARD_THEME.id
  const pieceSetId = override.pieceSet ?? defaults?.pieceSet ?? DEFAULT_PIECE_SET.id

  const setBoardTheme = useCallback(
    (id: string) => writeStored({ ...snapshot, boardTheme: boardThemeById(id).id }),
    []
  )
  const setPieceSet = useCallback((id: string) => writeStored({ ...snapshot, pieceSet: pieceSetById(id).id }), [])
  const resetBoardTheme = useCallback(() => writeStored({ ...snapshot, boardTheme: null }), [])
  const resetPieceSet = useCallback(() => writeStored({ ...snapshot, pieceSet: null }), [])

  return {
    boardTheme: boardThemeById(boardThemeId),
    pieceSet: pieceSetById(pieceSetId),
    boardThemeIsOverride: override.boardTheme != null,
    pieceSetIsOverride: override.pieceSet != null,
    setBoardTheme,
    setPieceSet,
    resetBoardTheme,
    resetPieceSet,
  }
}
