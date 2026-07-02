'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, Toggle, PrimaryBtn } from '@/components/ui/PageShell'
import { H2H_ELIGIBLE_TYPES, h2hGroupSize, KNOCKOUT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
import { gameTypeLabel } from '@/lib/game-types'
import { SCRABBLE_DICTIONARY_LABELS, SCRABBLE_DICTIONARY_OPTIONS } from '@/lib/scrabble-dictionary-meta'

type Format = 'round-robin' | 'head-to-head' | 'knockout'

const DEFAULT_POINTS = [10, 7, 5, 3, 2, 1]

// Per-turn timer choices for the group games (mirrors the lobby's options).
const WHOT_TURN_OPTIONS = [0, 10, 15, 30, 60, 90, 120]
const SCRABBLE_TURN_OPTIONS = [0, 60, 180, 300]
const fmtTurn = (s: number) => (s === 0 ? 'No limit' : s < 60 ? `${s}s` : `${s / 60} min`)

// Overall room-length caps, so a Whot/Scrabble room can't run for hours.
const WHOT_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400]
const SCRABBLE_DURATION_OPTIONS = [0, 1800, 3600, 5400, 7200]
const fmtDuration = (s: number) =>
  s === 0 ? 'No limit' : s % 3600 === 0 ? `${s / 3600} hr` : `${Math.round(s / 60)} min`

// Chess per-player clock choices (mirrors CHESS_TIME_OPTIONS).
const CHESS_TIME_OPTIONS = [0, 180, 300, 600]
const fmtChessTime = (s: number) => (s === 0 ? 'Untimed' : `${s / 60} min`)

const PLACEMENT_STYLES = [
  { ring: 'rgba(217, 119, 6, 0.4)', bg: 'rgba(245, 158, 11, 0.14)', text: 'var(--marry)', medal: '🥇' },
  { ring: 'rgba(100, 116, 139, 0.4)', bg: 'rgba(100, 116, 139, 0.12)', text: '#475569', medal: '🥈' },
  { ring: 'rgba(180, 83, 9, 0.4)', bg: 'rgba(180, 83, 9, 0.12)', text: '#b45309', medal: '🥉' },
]

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

function Stepper({
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

export default function TournamentCreatePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<Format>('round-robin')
  const [gameType, setGameType] = useState<string>(H2H_ELIGIBLE_TYPES[0])
  const [targetGameCount, setTargetGameCount] = useState<string>('')
  const [maxPlayers, setMaxPlayers] = useState<string>('')
  const [livesEnabled, setLivesEnabled] = useState(false)
  const [startingLives, setStartingLives] = useState(3)
  const [eliminateCount, setEliminateCount] = useState(1)
  // Knockout (group elimination) config.
  const [questionsPerRound, setQuestionsPerRound] = useState(5)
  const [triviaTimer, setTriviaTimer] = useState(15)
  // Head-to-head group-game (Whot/Scrabble) config: per-turn timer, house rules,
  // and word list — applied to every room the bracket spawns.
  const [h2hChessTimer, setH2hChessTimer] = useState(600)
  const [h2hTurnTimer, setH2hTurnTimer] = useState(30)
  const [h2hGameDuration, setH2hGameDuration] = useState(900)
  const [whotPick3, setWhotPick3] = useState(true)
  const [whotCards, setWhotCards] = useState(true)
  const [whotNumberCalls, setWhotNumberCalls] = useState(true)
  const [whotPick2Stacking, setWhotPick2Stacking] = useState(true)
  const [scrabbleDictionary, setScrabbleDictionary] = useState('enable')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isH2H = format === 'head-to-head'
  const isKnockout = format === 'knockout'
  const isRoundRobin = format === 'round-robin'

  // Keep the chosen game valid for the format (chess for 1v1, trivia for group).
  function pickFormat(next: Format) {
    setFormat(next)
    if (next === 'head-to-head') setGameType(H2H_ELIGIBLE_TYPES[0])
    else if (next === 'knockout') setGameType(KNOCKOUT_ELIGIBLE_TYPES[0])
  }

  // Switching the head-to-head game resets the per-turn timer + room-length to
  // that game's sensible defaults (Whot moves fast; Scrabble needs more time).
  function pickGameType(next: string) {
    setGameType(next)
    if (next === 'scrabble') {
      setH2hTurnTimer(180)
      setH2hGameDuration(1800)
    } else if (next === 'whot') {
      setH2hTurnTimer(30)
      setH2hGameDuration(900)
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError('Enter a tournament title')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        format,
      }
      if (isH2H || isKnockout) {
        body.gameType = gameType
      }
      if (isKnockout) {
        body.gameConfig = {
          questionSource: 'platform',
          roundsCount: questionsPerRound,
          timerSeconds: triviaTimer,
        }
      }
      if (isH2H && gameType === 'chess') {
        body.gameConfig = { timerSeconds: h2hChessTimer }
      } else if (isH2H && gameType === 'whot') {
        body.gameConfig = {
          timerSeconds: h2hTurnTimer,
          gameDurationSeconds: h2hGameDuration,
          whotPick3,
          whotCards,
          whotNumberCalls,
          whotPick2Stacking,
        }
      } else if (isH2H && gameType === 'scrabble') {
        body.gameConfig = {
          timerSeconds: h2hTurnTimer,
          gameDurationSeconds: h2hGameDuration,
          scrabbleDictionary,
        }
      }
      const cap = Number(maxPlayers)
      if (Number.isInteger(cap) && cap >= 2 && cap <= 100) {
        body.maxPlayers = cap
      }
      // Placement points, target game count and lives mode only apply to the
      // round-robin format. Head-to-head and knockout run until one champion.
      if (isRoundRobin) {
        body.placementPoints = DEFAULT_POINTS
        const count = Number(targetGameCount)
        if (Number.isInteger(count) && count >= 1 && count <= 100) {
          body.targetGameCount = count
        }
        if (livesEnabled) {
          body.eliminationConfig = {
            mode: 'lives',
            startingLives,
            livesLostRule: 'bottom-n',
            eliminateCount,
          }
        }
      }

      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create tournament')
        return
      }

      localStorage.setItem(`tournament_host_${data.tournamentCode}`, data.hostToken)
      router.push(`/tournament/${data.tournamentCode}`)
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell centered narrow>
      <div className="text-center space-y-2">
        <span className="premium-badge">Tournament</span>
        <h1 className="text-4xl font-black gradient-title leading-tight">Create Tournament</h1>
        <p className="text-muted text-sm">Set up a multi-game competition for your group</p>
      </div>

      <div className="glass-card-strong p-5 sm:p-6 space-y-5">
        <Field label="Tournament Title" htmlFor="tournament-title">
          <input
            id="tournament-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Friday Game Night"
            maxLength={100}
            className="input-field"
          />
        </Field>

        <div>
          <p className="label-caps mb-2.5">Format</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              aria-pressed={isRoundRobin}
              onClick={() => pickFormat('round-robin')}
              className={`chip ${isRoundRobin ? 'chip-active' : ''}`}
            >
              Round Robin
            </button>
            <button
              type="button"
              aria-pressed={isH2H}
              onClick={() => pickFormat('head-to-head')}
              className={`chip ${isH2H ? 'chip-active' : ''}`}
            >
              Head-to-Head
            </button>
            <button
              type="button"
              aria-pressed={isKnockout}
              onClick={() => pickFormat('knockout')}
              className={`chip ${isKnockout ? 'chip-active' : ''}`}
            >
              Knockout
            </button>
          </div>
          <p className="text-faint text-xs mt-2">
            {isH2H
              ? 'Players are grouped into rooms each round and only the winner of each room advances, until one champion remains. Chess is 1-v-1; Whot and Scrabble play in rooms of 4.'
              : isKnockout
                ? 'Everyone plays together each round; the bottom half is knocked out until one champion remains. Round of 16 → Quarterfinal → Semifinal → Final.'
                : 'Everyone plays each game together and earns placement points across multiple games.'}
          </p>
        </div>

        {(isH2H || isKnockout) && (
          <Field label="Game" htmlFor="tournament-game-type">
            <select
              id="tournament-game-type"
              value={gameType}
              onChange={(e) => pickGameType(e.target.value)}
              className="input-field"
            >
              {(isH2H ? H2H_ELIGIBLE_TYPES : KNOCKOUT_ELIGIBLE_TYPES).map((t) => (
                <option key={t} value={t}>
                  {gameTypeLabel(t) ?? t}
                </option>
              ))}
            </select>
            <p className="text-faint text-xs mt-1.5">
              {isH2H
                ? h2hGroupSize(gameType) > 2
                  ? `Played in rooms of ${h2hGroupSize(gameType)} — only each room's winner advances.`
                  : 'A 1-v-1 duel each round — the winner advances.'
                : 'The game everyone plays together each round.'}
            </p>
          </Field>
        )}

        {isH2H && gameType === 'chess' && (
          <div className="surface-inset p-4">
            <Field label="Time per player" htmlFor="h2h-chess-timer">
              <select
                id="h2h-chess-timer"
                value={h2hChessTimer}
                onChange={(e) => setH2hChessTimer(Number(e.target.value))}
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

        {isH2H && (gameType === 'whot' || gameType === 'scrabble') && (
          <div className="surface-inset p-4 space-y-4">
            <Field label="Time per turn" htmlFor="h2h-turn-timer">
              <select
                id="h2h-turn-timer"
                value={h2hTurnTimer}
                onChange={(e) => setH2hTurnTimer(Number(e.target.value))}
                className="input-field"
              >
                {(gameType === 'whot' ? WHOT_TURN_OPTIONS : SCRABBLE_TURN_OPTIONS).map((s) => (
                  <option key={s} value={s}>
                    {fmtTurn(s)}
                  </option>
                ))}
              </select>
              <p className="text-faint text-xs mt-1.5">How long each player has on their turn in every room.</p>
            </Field>

            <Field label="Game length" htmlFor="h2h-game-duration">
              <select
                id="h2h-game-duration"
                value={h2hGameDuration}
                onChange={(e) => setH2hGameDuration(Number(e.target.value))}
                className="input-field"
              >
                {(gameType === 'whot' ? WHOT_DURATION_OPTIONS : SCRABBLE_DURATION_OPTIONS).map((s) => (
                  <option key={s} value={s}>
                    {fmtDuration(s)}
                  </option>
                ))}
              </select>
              <p className="text-faint text-xs mt-1.5">
                Max length of each room — when time&apos;s up the game ends and the leader wins, so rounds don&apos;t
                drag on.
              </p>
            </Field>

            {gameType === 'whot' && (
              <div className="space-y-1.5">
                <p className="label-caps">House rules</p>
                <Toggle
                  label="Pick 3"
                  description="Play the Pick 3 draw penalty on 5s (5 cards stay in the deck either way)"
                  value={whotPick3}
                  onChange={setWhotPick3}
                />
                <Toggle
                  label="Stack Pick 2"
                  description="On: defend a Pick 2 with your own 2. Off: you must draw it."
                  value={whotPick2Stacking}
                  onChange={setWhotPick2Stacking}
                />
                <Toggle
                  label="WHOT cards"
                  description="Include WHOT wild cards in the deck"
                  value={whotCards}
                  onChange={setWhotCards}
                />
                <div className={whotCards ? undefined : 'opacity-50 pointer-events-none'}>
                  <Toggle
                    label="Numbers on WHOT"
                    description="Let players call a number (not just a shape) when playing WHOT"
                    value={whotNumberCalls}
                    onChange={setWhotNumberCalls}
                  />
                </div>
              </div>
            )}

            {gameType === 'scrabble' && (
              <Field label="Dictionary" htmlFor="scrabble-dictionary">
                <select
                  id="scrabble-dictionary"
                  value={scrabbleDictionary}
                  onChange={(e) => setScrabbleDictionary(e.target.value)}
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

        {isKnockout && (
          <div className="surface-inset p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-body text-sm font-medium">Questions per round</p>
                <p className="text-faint text-xs mt-0.5">Each round is one quick trivia game</p>
              </div>
              <Stepper value={questionsPerRound} min={3} max={20} onChange={setQuestionsPerRound} />
            </div>
            <div className="divider-soft" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-body text-sm font-medium">Seconds per question</p>
                <p className="text-faint text-xs mt-0.5">How long players have to answer each one</p>
              </div>
              <Stepper value={triviaTimer} min={5} max={60} onChange={setTriviaTimer} />
            </div>
          </div>
        )}

        {isRoundRobin && (
          <Field label="Target Games (optional)" htmlFor="tournament-target-games">
            <input
              id="tournament-target-games"
              type="number"
              value={targetGameCount}
              onChange={(e) => setTargetGameCount(e.target.value)}
              placeholder="Leave empty for unlimited"
              min={1}
              max={100}
              step={1}
              className="input-field"
            />
            <p className="text-faint text-xs mt-1.5">
              Tournament ends after this many games, or you can end it manually
            </p>
          </Field>
        )}

        <Field label="Max Players (optional)" htmlFor="tournament-max-players">
          <input
            id="tournament-max-players"
            type="number"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(e.target.value)}
            placeholder="Leave empty for unlimited"
            min={2}
            max={100}
            step={1}
            className="input-field"
          />
          <p className="text-faint text-xs mt-1.5">Once full, new players can&apos;t join</p>
        </Field>

        {isRoundRobin && (
          <div className="space-y-3">
            <Toggle
              label="Lives mode"
              description="Bottom finishers lose a life each game — last player standing wins"
              value={livesEnabled}
              onChange={setLivesEnabled}
            />

            {livesEnabled && (
              <div className="surface-inset p-4 space-y-3 animate-stagger">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-body text-sm font-medium">Starting lives</p>
                    <p className="text-faint text-xs mt-0.5">How many each player begins with</p>
                  </div>
                  <Stepper value={startingLives} min={1} max={10} onChange={setStartingLives} />
                </div>
                <div className="divider-soft" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-body text-sm font-medium">Players who lose a life each game</p>
                    <p className="text-faint text-xs mt-0.5">
                      {eliminateCount === 1
                        ? 'The bottom finisher loses 1 life'
                        : `The bottom ${eliminateCount} finishers each lose 1 life`}
                    </p>
                  </div>
                  <Stepper value={eliminateCount} min={1} max={10} onChange={setEliminateCount} />
                </div>
              </div>
            )}
          </div>
        )}

        {isRoundRobin && (
          <div>
            <p className="label-caps mb-2.5">Placement Points</p>
            <div className="grid grid-cols-3 gap-2">
              {DEFAULT_POINTS.map((pts, i) => {
                const medal = PLACEMENT_STYLES[i]
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-theme px-3 py-2.5 text-center"
                    style={
                      medal
                        ? { background: medal.bg, boxShadow: `inset 0 0 0 1px ${medal.ring}` }
                        : { background: 'var(--surface-inset-bg)' }
                    }
                  >
                    <p
                      className="text-[0.6875rem] font-semibold"
                      style={{ color: medal ? medal.text : 'var(--muted)' }}
                    >
                      {medal ? `${medal.medal} ` : ''}
                      {ordinal(i + 1)}
                    </p>
                    <p
                      className="text-lg font-black tabular-nums leading-tight"
                      style={{ color: medal ? medal.text : 'var(--foreground)' }}
                    >
                      {pts}
                      <span className="text-[0.625rem] font-semibold align-top ml-0.5">pt</span>
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="text-faint text-xs mt-2 text-center">7th place and below earn 1pt each</p>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <PrimaryBtn onClick={handleCreate} disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Tournament'}
      </PrimaryBtn>
    </PageShell>
  )
}
