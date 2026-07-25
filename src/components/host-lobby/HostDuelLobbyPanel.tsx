'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BOARD_THEMES, PIECE_SETS, useChessAppearance } from '@/lib/chess-appearance'
import { ChessPieceGlyph } from '@/components/chess/ChessPieceDetailed'
import { DRAUGHTS10_TIME_OPTIONS } from '@/lib/draughts10'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

/** The 2-player "duel" board games whose only shared lobby knob is the clock. */
export type DuelGameType = 'chess' | 'checkers' | 'checkers_international' | 'checkers_nigeria' | 'tic_tac_toe'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  duelType: DuelGameType
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

// Kept local (not imported from the server-side lib clamps) so no server code is pulled into
// the client bundle. The route re-clamps authoritatively via clamp{Chess,Checkers,TicTacToe}Timer.
const TURN_TIMER_OPTIONS: Record<DuelGameType, readonly number[]> = {
  chess: [0, 180, 300, 600],
  checkers: [0, 180, 300, 600],
  checkers_international: DRAUGHTS10_TIME_OPTIONS,
  checkers_nigeria: DRAUGHTS10_TIME_OPTIONS,
  tic_tac_toe: [0, 15, 30, 60],
}

function timerLabel(seconds: number): string {
  if (!seconds) return 'Off'
  if (seconds < 60) return `${seconds}s`
  return `${seconds / 60}m`
}

const TIMER_TITLE: Record<DuelGameType, string> = {
  chess: 'Time per player',
  checkers: 'Time per player',
  checkers_international: 'Time per player',
  checkers_nigeria: 'Time per player',
  tic_tac_toe: 'Turn timer',
}

/**
 * Lobby Host-settings for the abstract 2-player board games (chess / checkers / ultimate
 * tic-tac-toe). Mirrors the create form's game-specific options: the clock for all three,
 * plus board colours + piece set for chess. Saves via PATCH /api/games/[code] (gated to
 * the waiting/finished lobby server-side, like Scrabble's settings card).
 */
export function HostDuelLobbyPanel({ gameCode, hostToken, game, duelType, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const { setBoardTheme: setDeviceBoardTheme, setPieceSet: setDevicePieceSet } = useChessAppearance()
  const isChess = duelType === 'chess'
  const isCheckersNigeria = duelType === 'checkers_nigeria'
  const [turnTimer, setTurnTimer] = useState(game.timer_seconds ?? 0)
  const [boardTheme, setBoardTheme] = useState(game.chess_board_theme ?? 'green')
  const [pieceSet, setPieceSet] = useState(game.chess_piece_set ?? 'neo')
  const [streetRules, setStreetRules] = useState(game.checkers_nigeria_street_rules === true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTurnTimer(game.timer_seconds ?? 0)
    setBoardTheme(game.chess_board_theme ?? 'green')
    setPieceSet(game.chess_piece_set ?? 'neo')
    setStreetRules(game.checkers_nigeria_street_rules === true)
  }, [game.timer_seconds, game.chess_board_theme, game.chess_piece_set, game.checkers_nigeria_street_rules])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>): Promise<boolean> => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
        if (data.game) onGameUpdate(data.game)
        markSaved()
        return true
      } catch (err) {
        setSaveState('idle')
        toastError(err instanceof Error ? err.message : 'Failed to save settings')
        return false
      }
    },
    [gameCode, hostToken, markSaved, onGameUpdate, toastError]
  )

  const onTurnTimerChange = (next: number) => {
    if (saveState === 'saving' || next === turnTimer) return
    const previous = turnTimer
    setTurnTimer(next)
    void patchSettings({ timer_seconds: next }).then((ok) => {
      if (!ok) setTurnTimer(previous)
    })
  }

  const onBoardThemeChange = (id: string) => {
    if (saveState === 'saving' || id === boardTheme) return
    const previous = boardTheme
    setBoardTheme(id)
    void patchSettings({ chess_board_theme: id }).then((ok) => {
      if (ok) setDeviceBoardTheme(id)
      else setBoardTheme(previous)
    })
  }

  const onPieceSetChange = (id: string) => {
    if (saveState === 'saving' || id === pieceSet) return
    const previous = pieceSet
    setPieceSet(id)
    void patchSettings({ chess_piece_set: id }).then((ok) => {
      if (ok) setDevicePieceSet(id)
      else setPieceSet(previous)
    })
  }

  const onStreetRulesChange = (next: boolean) => {
    if (saveState === 'saving' || next === streetRules) return
    const previous = streetRules
    setStreetRules(next)
    void patchSettings({ checkers_nigeria_street_rules: next }).then((ok) => {
      if (!ok) setStreetRules(previous)
    })
  }

  const timerOptions = useMemo(
    () => TURN_TIMER_OPTIONS[duelType].map((s) => ({ value: s, label: timerLabel(s) })),
    [duelType]
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel}>
      <div className="space-y-4">
        <HostLobbySettingBlock title={TIMER_TITLE[duelType]}>
          <HostLobbyOptionChips value={turnTimer} options={timerOptions} onChange={onTurnTimerChange} />
        </HostLobbySettingBlock>

        {isCheckersNigeria && (
          <HostLobbySettingBlock title="Street Rules">
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs text-faint pr-2">
                Capturing stays optional — decline one and your opponent may huff (remove) the piece instead of moving.
              </span>
              <input
                type="checkbox"
                checked={streetRules}
                onChange={(e) => onStreetRulesChange(e.target.checked)}
                disabled={saveState === 'saving'}
              />
            </label>
          </HostLobbySettingBlock>
        )}

        {isChess && (
          <>
            <HostLobbySettingBlock title="Board">
              <div className="flex flex-wrap gap-2">
                {BOARD_THEMES.map((theme) => {
                  const active = theme.id === boardTheme
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => onBoardThemeChange(theme.id)}
                      title={theme.name}
                      aria-label={`${theme.name} board`}
                      aria-pressed={active}
                      className={[
                        'h-9 w-9 rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 transition-transform',
                        active
                          ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--card)] scale-105'
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
            </HostLobbySettingBlock>

            <HostLobbySettingBlock title="Pieces">
              <div className="flex flex-wrap gap-2">
                {PIECE_SETS.map((set) => {
                  const active = set.id === pieceSet
                  return (
                    <button
                      key={set.id}
                      type="button"
                      onClick={() => onPieceSetChange(set.id)}
                      title={set.name}
                      aria-label={`${set.name} pieces`}
                      aria-pressed={active}
                      className={[
                        'flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-transform',
                        active
                          ? 'ring-2 ring-[var(--primary)] scale-105'
                          : 'ring-1 ring-[var(--border)] hover:scale-105',
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
              <p className="text-faint mt-1 text-xs">Your default look — players can switch their own board in-game.</p>
            </HostLobbySettingBlock>
          </>
        )}
      </div>
    </HostLobbySettingsSection>
  )
}
