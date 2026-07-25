'use client'

import { useState } from 'react'
import { BOARD_THEMES, PIECE_SETS, useChessAppearance, type ChessAppearanceDefaults } from '@/lib/chess-appearance'
import { ChessPieceGlyph } from '@/components/chess/ChessPieceDetailed'

/** Compact square icon button that toggles the appearance panel below — meant to sit
 *  beside the Resign button in an actions row. */
export function ChessAppearanceIconButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Board & pieces"
      className={[
        'flex items-center justify-center h-12 w-12 shrink-0 rounded-lg border text-xl transition-colors',
        open
          ? 'border-[var(--primary)] bg-[var(--primary)]/10'
          : 'border-[var(--border)] bg-[var(--surface-bg)] hover:border-[var(--primary)]/60',
      ].join(' ')}
    >
      <span aria-hidden>🎨</span>
    </button>
  )
}

/**
 * Personal, per-device picker body for the board colors and piece style. Rendered (by
 * the caller) only while the {@link ChessAppearanceIconButton} above it is open. The
 * chosen look is saved to localStorage and applies instantly to this player's board
 * only, falling back to the host's chosen defaults until the player picks their own.
 */
export function ChessAppearancePanel({ defaults }: { defaults?: ChessAppearanceDefaults }) {
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
    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3 space-y-3">
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Board</p>
        <div className="flex flex-wrap gap-2">
          {BOARD_THEMES.map((theme) => {
            const active = theme.id === boardTheme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => {
                  // Only persist an override when the player actually changes the
                  // selection — re-clicking the inherited host default keeps it inherited.
                  if (!active) setBoardTheme(theme.id)
                }}
                title={theme.name}
                aria-label={`${theme.name} board${active ? ' (selected)' : ''}`}
                aria-pressed={active}
                className={[
                  'h-9 w-9 rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 transition-transform',
                  active
                    ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--surface-inset-bg)] scale-105'
                    : 'ring-1 ring-[var(--border)] hover:scale-105',
                ].join(' ')}
              >
                <span style={{ backgroundColor: theme.light }} />
                <span style={{ backgroundColor: theme.dark }} />
                <span style={{ backgroundColor: theme.dark }} />
                <span style={{ backgroundColor: theme.light }} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Pieces</p>
        <div className="flex flex-wrap gap-2">
          {PIECE_SETS.map((set) => {
            const active = set.id === pieceSet.id
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => {
                  if (!active) setPieceSet(set.id)
                }}
                title={set.name}
                aria-label={`${set.name} pieces${active ? ' (selected)' : ''}`}
                aria-pressed={active}
                className={[
                  'flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-transform',
                  // a neutral board-ish backdrop so light pieces stay visible
                  active ? 'ring-2 ring-[var(--primary)] scale-105' : 'ring-1 ring-[var(--border)] hover:scale-105',
                ].join(' ')}
                style={{ backgroundColor: '#b58863' }}
              >
                <span className="leading-none flex gap-0.5">
                  <ChessPieceGlyph set={set} color="w" type="n" className="h-6 w-6" />
                  <ChessPieceGlyph set={set} color="b" type="n" className="h-6 w-6" />
                </span>
                <span className="text-[10px] font-semibold text-white/90 leading-none">{set.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {canReset && (
        <button
          type="button"
          onClick={() => {
            resetBoardTheme()
            resetPieceSet()
          }}
          className="text-[11px] font-semibold text-faint hover:text-[var(--foreground)] underline underline-offset-2"
        >
          Reset to host&apos;s default
        </button>
      )}
    </div>
  )
}

/** Self-contained icon button + panel, for callers that don't need to place the trigger
 *  beside another control. */
export function ChessAppearancePicker({ defaults }: { defaults?: ChessAppearanceDefaults }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="max-w-lg sm:max-w-xl lg:max-w-2xl mx-auto w-full">
      <ChessAppearanceIconButton open={open} onToggle={() => setOpen((v) => !v)} />
      {open && <ChessAppearancePanel defaults={defaults} />}
    </div>
  )
}
