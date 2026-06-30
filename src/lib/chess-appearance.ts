'use client'

import { useSyncExternalStore } from 'react'

/**
 * Chess board + piece appearance is a purely cosmetic, per-device preference —
 * it never touches game state, so it lives in localStorage (like chess.com /
 * lichess board themes) rather than the synced game record. Each player picks
 * their own look; opponents are unaffected.
 */

export type ChessPieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'

/**
 * How a side's pieces are drawn:
 * - `filled` — solid silhouette (the side's `color` fills the shape).
 * - `outline` — hollow line-drawing (the `color` strokes the outline only).
 * The actual shapes live in `ChessPieceIcon`; here we only pick the look.
 */
export type PieceVariant = 'filled' | 'outline'

export type PieceFace = {
  variant: PieceVariant
  /** Fill (filled) or stroke (outline) color — drives the SVG `currentColor`. */
  color: string
  /** CSS `filter` value: a drop-shadow chain giving the piece a halo / depth. */
  filter: string
}

export type ChessPieceSet = {
  id: string
  name: string
  white: PieceFace
  black: PieceFace
}

export const PIECE_SETS: ChessPieceSet[] = [
  {
    id: 'classic',
    name: 'Classic',
    white: {
      variant: 'filled',
      color: '#f8fafc',
      filter: 'drop-shadow(0 0 1px #0f172a) drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
    },
    black: {
      variant: 'filled',
      color: '#1e293b',
      filter: 'drop-shadow(0 0 1px #f8fafc) drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
    },
  },
  {
    id: 'outline',
    name: 'Outline',
    // White side hollow, black side solid — a clean, modern two-tone look.
    white: {
      variant: 'outline',
      color: '#f8fafc',
      filter: 'drop-shadow(0 0 1px #0f172a) drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
    },
    black: {
      variant: 'filled',
      color: '#111827',
      filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
    },
  },
  {
    id: 'ink',
    name: 'Ink',
    // Both dark; white reads as a line drawing, black as solid — the classic
    // printed-book / newspaper diagram style.
    white: { variant: 'outline', color: '#1f2937', filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.35))' },
    black: { variant: 'filled', color: '#0b1220', filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.25))' },
  },
  {
    id: 'neon',
    name: 'Neon',
    white: {
      variant: 'filled',
      color: '#67e8f9',
      filter: 'drop-shadow(0 0 4px #22d3ee) drop-shadow(0 0 8px rgba(34,211,238,0.7))',
    },
    black: {
      variant: 'filled',
      color: '#f0abfc',
      filter: 'drop-shadow(0 0 4px #e879f9) drop-shadow(0 0 8px rgba(232,121,249,0.7))',
    },
  },
  {
    id: 'gold',
    name: 'Royal',
    white: {
      variant: 'filled',
      color: '#fde68a',
      filter: 'drop-shadow(0 0 1px #78350f) drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
    },
    black: {
      variant: 'filled',
      color: '#7f1d1d',
      filter: 'drop-shadow(0 0 1px #fde68a) drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
    },
  },
]

export type ChessBoardTheme = {
  id: string
  name: string
  light: string
  dark: string
}

export const BOARD_THEMES: ChessBoardTheme[] = [
  { id: 'classic', name: 'Classic', light: '#eed9b5', dark: '#b58863' },
  { id: 'emerald', name: 'Emerald', light: '#eeeed2', dark: '#769656' },
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
const CHANGE_EVENT = 'kmk-chess-appearance'

/** A player's personal override. `null` for a field means "inherit the host default". */
type StoredOverride = { boardTheme: string | null; pieceSet: string | null }

const EMPTY_OVERRIDE: StoredOverride = { boardTheme: null, pieceSet: null }

/** Host-chosen defaults for a game; either field may be absent. */
export type ChessAppearanceDefaults = { boardTheme?: string | null; pieceSet?: string | null }

// useSyncExternalStore requires getSnapshot to return a referentially-stable
// value when nothing changed, so we cache the parsed object and only rebuild it
// when the underlying localStorage string actually differs.
let cachedRaw: string | null = null
let cachedSnapshot: StoredOverride = EMPTY_OVERRIDE

function getSnapshot(): StoredOverride {
  if (typeof window === 'undefined') return EMPTY_OVERRIDE
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return EMPTY_OVERRIDE
  }
  if (raw === cachedRaw) return cachedSnapshot
  cachedRaw = raw
  let next = EMPTY_OVERRIDE
  try {
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed) {
      next = {
        boardTheme: parsed.boardTheme ? boardThemeById(parsed.boardTheme).id : null,
        pieceSet: parsed.pieceSet ? pieceSetById(parsed.pieceSet).id : null,
      }
    }
  } catch {
    // malformed — treat as no override
  }
  cachedSnapshot = next
  return cachedSnapshot
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function writeStored(next: StoredOverride): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable (private mode / quota) — preference just won't persist
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/**
 * Read + update the player's board-theme / piece-set choice. The effective look
 * resolves as: player override → host default → global default. A player who
 * never touches the picker simply sees whatever the host chose.
 *
 * SSR-safe via useSyncExternalStore: the server (and first client paint) see no
 * override, then the store hydrates from localStorage. All mounts stay in sync
 * through a window event (and the native `storage` event across tabs).
 */
export function useChessAppearance(defaults?: ChessAppearanceDefaults) {
  const override = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_OVERRIDE)

  const boardThemeId = override.boardTheme ?? defaults?.boardTheme ?? DEFAULT_BOARD_THEME.id
  const pieceSetId = override.pieceSet ?? defaults?.pieceSet ?? DEFAULT_PIECE_SET.id

  return {
    boardTheme: boardThemeById(boardThemeId),
    pieceSet: pieceSetById(pieceSetId),
    /** True when the player is overriding the host default for that field. */
    boardThemeIsOverride: override.boardTheme != null,
    pieceSetIsOverride: override.pieceSet != null,
    setBoardTheme: (id: string) => writeStored({ ...override, boardTheme: boardThemeById(id).id }),
    setPieceSet: (id: string) => writeStored({ ...override, pieceSet: pieceSetById(id).id }),
    /** Clear the player's override and fall back to the host default. */
    resetBoardTheme: () => writeStored({ ...override, boardTheme: null }),
    resetPieceSet: () => writeStored({ ...override, pieceSet: null }),
  }
}
