'use client'

import { useState } from 'react'
import { BOARD_THEMES, PIECE_SETS, useChessAppearance, type ChessAppearanceDefaults } from '@/lib/chess-appearance'
import { ChessPieceIcon } from '@/components/chess/ChessPieceIcon'

/**
 * Personal, per-device picker for the board colors and piece style. Collapsed
 * by default so it doesn't clutter the game; the chosen look is saved to
 * localStorage and applies instantly to this player's board only. Falls back to
 * the host's chosen defaults until the player picks their own.
 */
export function ChessAppearancePicker({ defaults }: { defaults?: ChessAppearanceDefaults }) {
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
    <div className="max-w-lg sm:max-w-xl lg:max-w-2xl mx-auto w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full rounded-lg border-2 border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/60"
        aria-expanded={open}
      >
        <span aria-hidden>🎨</span>
        <span>Board &amp; pieces</span>
        <span className="text-xs font-normal text-faint truncate">
          {boardTheme.name} · {pieceSet.name}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] shrink-0">
          <span aria-hidden>✏️</span>
          {open ? 'Done' : 'Change'}
          <span aria-hidden className="text-faint">
            {open ? '▴' : '▾'}
          </span>
        </span>
      </button>

      {open && (
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
                      <ChessPieceIcon
                        type="n"
                        variant={set.white.variant}
                        className="h-6 w-6"
                        style={{ color: set.white.color, filter: set.white.filter }}
                      />
                      <ChessPieceIcon
                        type="n"
                        variant={set.black.variant}
                        className="h-6 w-6"
                        style={{ color: set.black.color, filter: set.black.filter }}
                      />
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
      )}
    </div>
  )
}
