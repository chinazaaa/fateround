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
  /** Detailed sets only: outline stroke around the piece body. */
  outline?: string
  /** Detailed sets only: interior "ink" lines / accents (crown lines, knight eye). */
  detail?: string
}

export type ChessPieceSet = {
  id: string
  name: string
  /**
   * How the pieces are drawn. `silhouette` (default) uses the single-tone
   * `ChessPieceIcon`; `detailed` uses the two-tone `ChessPieceDetailed` set —
   * the classic light-body / dark-ink look you see on chess.com & lichess.
   */
  style?: 'silhouette' | 'detailed'
  white: PieceFace
  black: PieceFace
}

export const PIECE_SETS: ChessPieceSet[] = [
  {
    // The most-requested look: classic two-tone pieces (light body, dark ink).
    // Rendered by `ChessPieceDetailed`; the `color`/`outline`/`detail` fields
    // drive its body fill, silhouette stroke, and interior lines respectively.
    id: 'neo',
    name: 'Neo',
    style: 'detailed',
    white: {
      variant: 'filled',
      color: '#f8f8f8',
      outline: '#4b4b4b',
      detail: '#4b4b4b',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.28))',
    },
    black: {
      variant: 'filled',
      color: '#38352f',
      outline: '#0e0d0b',
      detail: '#e6e2db',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.3))',
    },
  },
  {
    // Wooden set — pale boxwood vs rich walnut, the traditional tournament look.
    id: 'classic',
    name: 'Wood',
    style: 'detailed',
    white: {
      variant: 'filled',
      color: '#e2bd88',
      outline: '#6b4a2c',
      detail: '#6b4a2c',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.3))',
    },
    black: {
      variant: 'filled',
      color: '#5b3a20',
      outline: '#2a1809',
      detail: '#e2bd88',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.35))',
    },
  },
  {
    // Cool marble — bluish stone with slate ink.
    id: 'outline',
    name: 'Marble',
    style: 'detailed',
    white: {
      variant: 'filled',
      color: '#eef2f6',
      outline: '#3b4a57',
      detail: '#3b4a57',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.28))',
    },
    black: {
      variant: 'filled',
      color: '#33404a',
      outline: '#10161b',
      detail: '#d4dee6',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.3))',
    },
  },
  {
    // Stark grayscale — crisp black lines, the printed-diagram look.
    id: 'ink',
    name: 'Ink',
    style: 'detailed',
    white: {
      variant: 'filled',
      color: '#fafafa',
      outline: '#171717',
      detail: '#171717',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.25))',
    },
    black: {
      variant: 'filled',
      color: '#171717',
      outline: '#000000',
      detail: '#f0f0f0',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.3))',
    },
  },
  {
    // Glowing neon — bright bodies with a coloured halo.
    id: 'neon',
    name: 'Neon',
    style: 'detailed',
    white: {
      variant: 'filled',
      color: '#22d3ee',
      outline: '#0e7490',
      detail: '#ecfeff',
      filter: 'drop-shadow(0 0 3px #22d3ee) drop-shadow(0 0 6px rgba(34,211,238,0.7))',
    },
    black: {
      variant: 'filled',
      color: '#e879f9',
      outline: '#86198f',
      detail: '#fdf4ff',
      filter: 'drop-shadow(0 0 3px #e879f9) drop-shadow(0 0 6px rgba(232,121,249,0.7))',
    },
  },
  {
    // Gold & burgundy — a regal, high-ornament pairing.
    id: 'gold',
    name: 'Royal',
    style: 'detailed',
    white: {
      variant: 'filled',
      color: '#f5d67a',
      outline: '#7a5a12',
      detail: '#7a5a12',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.3))',
    },
    black: {
      variant: 'filled',
      color: '#7f1d2e',
      outline: '#3f0d17',
      detail: '#f5d67a',
      filter: 'drop-shadow(0 1.5px 1px rgba(0,0,0,0.35))',
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
