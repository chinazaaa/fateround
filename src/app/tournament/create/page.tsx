'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, Toggle, PrimaryBtn } from '@/components/ui/PageShell'
import {
  H2H_ELIGIBLE_TYPES,
  h2hGroupSize,
  KNOCKOUT_ELIGIBLE_TYPES,
  SCHOOL_ELIGIBLE_TYPES,
} from '@/lib/tournament-validation'
import { gameTypeLabel } from '@/lib/game-types'
import {
  Stepper,
  TournamentGameConfigFields,
  defaultGameConfigValue,
  gameConfigForGame,
  gameConfigRequestBody,
} from '@/components/tournament/TournamentGameConfigFields'

type Format = 'round-robin' | 'head-to-head' | 'knockout' | 'school'

const DEFAULT_POINTS = [10, 7, 5, 3, 2, 1]

const PLACEMENT_STYLES = [
  { ring: 'rgba(217, 119, 6, 0.4)', bg: 'rgba(245, 158, 11, 0.14)', text: 'var(--marry)', medal: '🥇' },
  { ring: 'rgba(100, 116, 139, 0.4)', bg: 'rgba(100, 116, 139, 0.12)', text: '#475569', medal: '🥈' },
  { ring: 'rgba(180, 83, 9, 0.4)', bg: 'rgba(180, 83, 9, 0.12)', text: '#b45309', medal: '🥉' },
]

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
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
  // Per-round game setup (house rules, dictionary, timers, ladder, trivia settings).
  const [gameConfig, setGameConfig] = useState(defaultGameConfigValue())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isH2H = format === 'head-to-head'
  const isKnockout = format === 'knockout'
  const isSchool = format === 'school'
  const isRoundRobin = format === 'round-robin'

  // Keep the chosen game valid for the format (chess for 1v1, trivia for group,
  // Whot for school), and reset the timers to that game's sensible defaults.
  function pickFormat(next: Format) {
    setFormat(next)
    let nextGame = gameType
    if (next === 'head-to-head') nextGame = H2H_ELIGIBLE_TYPES[0]
    else if (next === 'knockout') nextGame = KNOCKOUT_ELIGIBLE_TYPES[0]
    else if (next === 'school') nextGame = SCHOOL_ELIGIBLE_TYPES[0]
    setGameType(nextGame)
    setGameConfig((prev) => gameConfigForGame(next, nextGame, prev))
  }

  function pickGameType(next: string) {
    setGameType(next)
    setGameConfig((prev) => gameConfigForGame(format, next, prev))
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
      if (isH2H || isKnockout || isSchool) {
        body.gameType = gameType
      }
      const gc = gameConfigRequestBody(format, gameType, gameConfig)
      if (gc) body.gameConfig = gc

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
          <div className="grid grid-cols-2 gap-2">
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
            <button
              type="button"
              aria-pressed={isSchool}
              onClick={() => pickFormat('school')}
              className={`chip ${isSchool ? 'chip-active' : ''}`}
            >
              🎓 School
            </button>
          </div>
          <p className="text-faint text-xs mt-2">
            {isH2H
              ? 'Players are grouped into rooms each round and only the winner of each room advances, until one champion remains. Chess is 1-v-1; Whot plays in rooms of up to 5, Scrabble up to 4.'
              : isKnockout
                ? gameType === 'scrabble'
                  ? 'Everyone plays in rooms of up to 4, but the whole field is ranked together by score and the bottom half is knocked out each round — it doesn’t matter which room you were in. Repeats until one champion remains.'
                  : 'Everyone plays together each round; the bottom half is knocked out until one champion remains. Round of 16 → Quarterfinal → Semifinal → Final.'
                : isSchool
                  ? 'School Whot: everyone starts in the lowest class and is grouped with classmates into a timed Whot room (up to 5) each round. Empty your hand to climb a class; when time’s up the player left holding the most cards repeats. Get stuck with no one left to play and you’re out. First to graduate past the top class wins.'
                  : 'Everyone plays each round together — pick a game per round (Trivia, I Call On, Two Truths, or repeat). Placements across all rounds feed one leaderboard.'}
          </p>
        </div>

        {(isH2H || isKnockout) && (
          <Field label="Game" htmlFor="tournament-game-type">
            <select
              id="tournament-game-type"
              value={gameType}
              onChange={(e) => pickGameType(e.target.value)}
              className="fr-select"
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
                  ? `Played in rooms of up to ${h2hGroupSize(gameType)} — only each room's winner advances.`
                  : 'A 1-v-1 duel each round — the winner advances.'
                : gameType === 'scrabble'
                  ? 'Played in rooms of up to 4, but ranked as one field — the bottom half by score is knocked out each round.'
                  : 'The game everyone plays together each round.'}
            </p>
          </Field>
        )}

        <TournamentGameConfigFields format={format} gameType={gameType} value={gameConfig} onChange={setGameConfig} />

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
