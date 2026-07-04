'use client'

import { Field, Toggle } from '@/components/ui/PageShell'
import {
  SCHOOL_LADDER_OPTIONS,
  SCHOOL_MATCH_SECONDS_OPTIONS,
  DEFAULT_SCHOOL_MATCH_SECONDS,
  MAX_SCHOOL_CLASSES,
} from '@/lib/tournament-school'
import { SCRABBLE_DICTIONARY_LABELS, SCRABBLE_DICTIONARY_OPTIONS } from '@/lib/scrabble-dictionary-meta'

// Per-turn timer choices for the group games (mirrors the lobby's options).
const WHOT_TURN_OPTIONS = [0, 10, 15, 30, 60, 90, 120]
const SCRABBLE_TURN_OPTIONS = [0, 60, 180, 300]
const fmtTurn = (s: number) => (s === 0 ? 'No limit' : s < 60 ? `${s}s` : `${s / 60} min`)

// Overall room-length caps, so a Whot/Scrabble room can't run for hours.
const WHOT_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400]
const SCRABBLE_DURATION_OPTIONS = [0, 600, 900, 1800, 3600, 5400, 7200]
const fmtDuration = (s: number) =>
  s === 0 ? 'No limit' : s % 3600 === 0 ? `${s / 3600} hr` : `${Math.round(s / 60)} min`

// Chess per-player clock choices.
const CHESS_TIME_OPTIONS = [0, 180, 300, 600]
const fmtChessTime = (s: number) => (s === 0 ? 'Untimed' : `${s / 60} min`)

/** Stepper control (shared with the create page's lives/target inputs). */
export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="surface-inset flex items-center gap-1 p-1">
      <button
        type="button"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-muted transition hover:bg-[var(--card-hover)] hover:text-body disabled:opacity-30 disabled:hover:bg-transparent"
      >
        −
      </button>
      <span className="w-8 text-center text-body font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-muted transition hover:bg-[var(--card-hover)] hover:text-body disabled:opacity-30 disabled:hover:bg-transparent"
      >
        +
      </button>
    </div>
  )
}

// The form's working copy of a tournament's game config. Maps to the stored
// game_config via the helpers below; the UI edits these fields directly.
export interface TournamentGameConfigValue {
  chessTimer: number // head-to-head chess: per-player clock
  turnTimer: number // whot/scrabble/school: per-turn timer
  gameDuration: number // whot/scrabble room length, or school match length
  whotPick3: boolean
  whotCards: boolean
  whotNumberCalls: boolean
  whotPick2Stacking: boolean
  scrabbleDictionary: string
  schoolClassCount: number
  questionsPerRound: number // knockout
  triviaTimer: number // knockout: seconds per question
}

export function defaultGameConfigValue(): TournamentGameConfigValue {
  return {
    chessTimer: 600,
    turnTimer: 30,
    gameDuration: 900,
    whotPick3: true,
    whotCards: true,
    whotNumberCalls: true,
    whotPick2Stacking: true,
    scrabbleDictionary: 'enable',
    schoolClassCount: MAX_SCHOOL_CLASSES,
    questionsPerRound: 5,
    triviaTimer: 15,
  }
}

/** Reset the timers to a format/game's sensible defaults when it's (re)selected. */
export function gameConfigForGame(
  format: string,
  gameType: string,
  prev: TournamentGameConfigValue
): TournamentGameConfigValue {
  if (format === 'school') return { ...prev, turnTimer: 15, gameDuration: DEFAULT_SCHOOL_MATCH_SECONDS }
  if (format === 'knockout' && gameType === 'scrabble') return { ...prev, turnTimer: 60, gameDuration: 900 }
  if (format === 'head-to-head') {
    if (gameType === 'scrabble') return { ...prev, turnTimer: 60, gameDuration: 900 }
    if (gameType === 'whot') return { ...prev, turnTimer: 15, gameDuration: 900 }
  }
  return prev
}

/** The `gameConfig` request body for a format + game (undefined = nothing to send). */
export function gameConfigRequestBody(
  format: string,
  gameType: string,
  v: TournamentGameConfigValue
): Record<string, unknown> | undefined {
  if (format === 'knockout') {
    if (gameType === 'scrabble') {
      return {
        timerSeconds: v.turnTimer,
        gameDurationSeconds: v.gameDuration,
        scrabbleDictionary: v.scrabbleDictionary,
      }
    }
    return { questionSource: 'platform', roundsCount: v.questionsPerRound, timerSeconds: v.triviaTimer }
  }
  if (format === 'school') {
    return {
      schoolClassCount: v.schoolClassCount,
      timerSeconds: v.turnTimer,
      gameDurationSeconds: v.gameDuration,
      whotPick3: v.whotPick3,
      whotCards: v.whotCards,
      whotNumberCalls: v.whotNumberCalls,
      whotPick2Stacking: v.whotPick2Stacking,
    }
  }
  if (format === 'head-to-head') {
    if (gameType === 'chess') return { timerSeconds: v.chessTimer }
    if (gameType === 'whot') {
      return {
        timerSeconds: v.turnTimer,
        gameDurationSeconds: v.gameDuration,
        whotPick3: v.whotPick3,
        whotCards: v.whotCards,
        whotNumberCalls: v.whotNumberCalls,
        whotPick2Stacking: v.whotPick2Stacking,
      }
    }
    if (gameType === 'scrabble') {
      return {
        timerSeconds: v.turnTimer,
        gameDurationSeconds: v.gameDuration,
        scrabbleDictionary: v.scrabbleDictionary,
      }
    }
  }
  return undefined
}

/** Populate the form value from a tournament's stored game_config (for editing). */
export function gameConfigValueFromStored(
  format: string | null | undefined,
  gameType: string | null | undefined,
  stored: unknown
): TournamentGameConfigValue {
  const v = defaultGameConfigValue()
  const c = (stored ?? {}) as Partial<{
    timerSeconds: number
    gameDurationSeconds: number
    roundsCount: number
    whotPick3: boolean
    whotCards: boolean
    whotNumberCalls: boolean
    whotPick2Stacking: boolean
    scrabbleDictionary: string
    schoolClassCount: number
  }>
  if (format === 'knockout') {
    if (gameType === 'scrabble') {
      v.turnTimer = c.timerSeconds ?? 60
      v.gameDuration = c.gameDurationSeconds ?? 900
      v.scrabbleDictionary = c.scrabbleDictionary ?? 'enable'
      return v
    }
    v.questionsPerRound = c.roundsCount ?? 5
    v.triviaTimer = c.timerSeconds ?? 15
    return v
  }
  if (format === 'school') {
    v.schoolClassCount = c.schoolClassCount ?? MAX_SCHOOL_CLASSES
    v.turnTimer = c.timerSeconds ?? 15
    v.gameDuration = c.gameDurationSeconds ?? DEFAULT_SCHOOL_MATCH_SECONDS
    v.whotPick3 = c.whotPick3 ?? true
    v.whotCards = c.whotCards ?? true
    v.whotNumberCalls = c.whotNumberCalls ?? true
    v.whotPick2Stacking = c.whotPick2Stacking ?? true
    return v
  }
  if (format === 'head-to-head') {
    if (gameType === 'chess') {
      v.chessTimer = c.timerSeconds ?? 600
      return v
    }
    v.turnTimer = c.timerSeconds ?? (gameType === 'scrabble' ? 60 : 15)
    v.gameDuration = c.gameDurationSeconds ?? 900
    if (gameType === 'whot') {
      v.whotPick3 = c.whotPick3 ?? true
      v.whotCards = c.whotCards ?? true
      v.whotNumberCalls = c.whotNumberCalls ?? true
      v.whotPick2Stacking = c.whotPick2Stacking ?? true
    }
    if (gameType === 'scrabble') v.scrabbleDictionary = c.scrabbleDictionary ?? 'enable'
  }
  return v
}

/** Whether a format carries an editable per-round game config (round-robin doesn't). */
export function formatHasGameConfig(format: string | null | undefined): boolean {
  return format === 'head-to-head' || format === 'knockout' || format === 'school'
}

/**
 * The per-round game-setup controls (house rules, dictionary, timers, ladder,
 * trivia settings) for a tournament's format + game. Shared by the create page and
 * the host's Edit Settings panel so the two never drift.
 */
export function TournamentGameConfigFields({
  format,
  gameType,
  value,
  onChange,
}: {
  format: string
  gameType: string
  value: TournamentGameConfigValue
  onChange: (next: TournamentGameConfigValue) => void
}) {
  const set = (patch: Partial<TournamentGameConfigValue>) => onChange({ ...value, ...patch })
  const isH2H = format === 'head-to-head'
  const isSchool = format === 'school'
  const isKnockout = format === 'knockout'
  // Scrabble knockout plays in rooms and reuses the same room controls as the
  // head-to-head Scrabble bracket; trivia knockout keeps the questions/timer panel.
  const isKnockoutScrabble = isKnockout && gameType === 'scrabble'
  const isKnockoutTrivia = isKnockout && gameType !== 'scrabble'

  return (
    <>
      {isSchool && (
        <Field label="Class ladder" htmlFor="tgc-school-ladder">
          <select
            id="tgc-school-ladder"
            value={value.schoolClassCount}
            onChange={(e) => set({ schoolClassCount: Number(e.target.value) })}
            className="input-field"
          >
            {SCHOOL_LADDER_OPTIONS.map((o) => (
              <option key={o.count} value={o.count}>
                {o.label} ({o.count} classes)
              </option>
            ))}
          </select>
          <p className="text-faint text-xs mt-1.5">
            {SCHOOL_LADDER_OPTIONS.find((o) => o.count === value.schoolClassCount)?.hint ??
              'How many classes players climb before graduating.'}{' '}
            Every win moves a player up one class.
          </p>
        </Field>
      )}

      {isH2H && gameType === 'chess' && (
        <div className="surface-inset p-4">
          <Field label="Time per player" htmlFor="tgc-chess-timer">
            <select
              id="tgc-chess-timer"
              value={value.chessTimer}
              onChange={(e) => set({ chessTimer: Number(e.target.value) })}
              className="input-field"
            >
              {CHESS_TIME_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {fmtChessTime(s)}
                </option>
              ))}
            </select>
            <p className="text-faint text-xs mt-1.5">Each player&apos;s clock for every match in the bracket.</p>
          </Field>
        </div>
      )}

      {((isH2H && (gameType === 'whot' || gameType === 'scrabble')) || isSchool || isKnockoutScrabble) && (
        <div className="surface-inset p-4 space-y-4">
          <Field label="Time per turn" htmlFor="tgc-turn-timer">
            <select
              id="tgc-turn-timer"
              value={value.turnTimer}
              onChange={(e) => set({ turnTimer: Number(e.target.value) })}
              className="input-field"
            >
              {(isSchool || gameType === 'whot' ? WHOT_TURN_OPTIONS : SCRABBLE_TURN_OPTIONS).map((s) => (
                <option key={s} value={s}>
                  {fmtTurn(s)}
                </option>
              ))}
            </select>
            <p className="text-faint text-xs mt-1.5">How long each player has on their turn in every room.</p>
          </Field>

          <Field label={isSchool ? 'Match length' : 'Game length'} htmlFor="tgc-game-duration">
            <select
              id="tgc-game-duration"
              value={value.gameDuration}
              onChange={(e) => set({ gameDuration: Number(e.target.value) })}
              className="input-field"
            >
              {(isSchool
                ? SCHOOL_MATCH_SECONDS_OPTIONS
                : gameType === 'whot'
                  ? WHOT_DURATION_OPTIONS
                  : SCRABBLE_DURATION_OPTIONS
              ).map((s) => (
                <option key={s} value={s}>
                  {fmtDuration(s)}
                </option>
              ))}
            </select>
            <p className="text-faint text-xs mt-1.5">
              {isSchool
                ? 'How long each match runs. Empty your hand to climb a class; when time’s up the player left holding the most cards repeats.'
                : 'Max length of each room — when time’s up the game ends and the leader wins, so rounds don’t drag on.'}
            </p>
          </Field>

          {gameType === 'whot' && (
            <div className="space-y-1.5">
              <p className="label-caps">House rules</p>
              <Toggle
                label="Pick 3"
                description="Play the Pick 3 draw penalty on 5s (5 cards stay in the deck either way)"
                value={value.whotPick3}
                onChange={(whotPick3) => set({ whotPick3 })}
              />
              <Toggle
                label="Stack Pick 2"
                description="On: defend a Pick 2 with your own 2. Off: you must draw it."
                value={value.whotPick2Stacking}
                onChange={(whotPick2Stacking) => set({ whotPick2Stacking })}
              />
              <Toggle
                label="WHOT cards"
                description="Include WHOT wild cards in the deck"
                value={value.whotCards}
                onChange={(whotCards) => set({ whotCards })}
              />
              <div className={value.whotCards ? undefined : 'opacity-50 pointer-events-none'}>
                <Toggle
                  label="Numbers on WHOT"
                  description="Let players call a number (not just a shape) when playing WHOT"
                  value={value.whotNumberCalls}
                  onChange={(whotNumberCalls) => set({ whotNumberCalls })}
                />
              </div>
            </div>
          )}

          {gameType === 'scrabble' && (
            <Field label="Dictionary" htmlFor="tgc-scrabble-dictionary">
              <select
                id="tgc-scrabble-dictionary"
                value={value.scrabbleDictionary}
                onChange={(e) => set({ scrabbleDictionary: e.target.value })}
                className="input-field"
              >
                {SCRABBLE_DICTIONARY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {SCRABBLE_DICTIONARY_LABELS[d]}
                  </option>
                ))}
              </select>
              <p className="text-faint text-xs mt-1.5">The word list every room validates against.</p>
            </Field>
          )}
        </div>
      )}

      {isKnockoutTrivia && (
        <div className="surface-inset p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body text-sm font-medium">Questions per round</p>
              <p className="text-faint text-xs mt-0.5">Each round is one quick trivia game</p>
            </div>
            <Stepper
              value={value.questionsPerRound}
              min={3}
              max={20}
              onChange={(questionsPerRound) => set({ questionsPerRound })}
            />
          </div>
          <div className="divider-soft" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body text-sm font-medium">Seconds per question</p>
              <p className="text-faint text-xs mt-0.5">How long players have to answer each one</p>
            </div>
            <Stepper value={value.triviaTimer} min={5} max={60} onChange={(triviaTimer) => set({ triviaTimer })} />
          </div>
        </div>
      )}
    </>
  )
}
