'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, Toggle, PrimaryBtn } from '@/components/ui/PageShell'
import {
  H2H_ELIGIBLE_TYPES,
  h2hGroupSize,
  KNOCKOUT_ELIGIBLE_TYPES,
  SCHOOL_ELIGIBLE_TYPES,
  TOURNAMENT_ELIGIBLE_TYPES,
} from '@/lib/tournament-validation'
import type { TournamentQueueEntry } from '@/types/tournament'
import { gameTypeLabel } from '@/lib/game-types'
import type { TriviaQuestion } from '@/types'
import {
  parseTriviaQuestionImport,
  parseExcelTriviaQuestionImport,
  formatTriviaImportSummary,
  questionSampleFile,
} from '@/lib/custom-questions'
import { AiQuestionsGenerator } from '@/components/ui/AiQuestionsGenerator'
import {
  estimateGameSeconds,
  estimatePlaylistSeconds,
  formatEstimatedDuration,
  TIMING_PLAYER_FALLBACK,
} from '@/lib/tournament-timing'
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
  // Round-robin planning: true = pre-set the game order now (playlist), false =
  // pick each game live from the detail page. Data-wise the mode IS the queue
  // being non-empty vs null — this flag just controls create-page UI.
  const [planned, setPlanned] = useState(false)
  const [queue, setQueue] = useState<TournamentQueueEntry[]>([])
  // Draft state for the "add a game" row inside the playlist editor.
  const [draftGameType, setDraftGameType] = useState<string>(TOURNAMENT_ELIGIBLE_TYPES[0])
  const [draftRounds, setDraftRounds] = useState<string>('10')
  const [draftTimer, setDraftTimer] = useState<string>('30')
  // Per-entry display mode. Default off (phone-only) — the projector big-
  // screen mode is a deliberate host choice per game, so hosts who never
  // set up a projector aren't accidentally opted in.
  const [draftBigScreenMode, setDraftBigScreenMode] = useState<'phone_only' | 'projector'>('phone_only')
  // Optional shared trivia pack for every planned Trivia round in this
  // tournament. Only surfaced when the playlist actually contains a Trivia
  // entry. Empty = platform bank (today's default).
  const [triviaSource, setTriviaSource] = useState<'platform' | 'custom' | 'ai'>('platform')
  const [customTriviaPack, setCustomTriviaPack] = useState<TriviaQuestion[]>([])
  const [triviaUploadMsg, setTriviaUploadMsg] = useState<string | null>(null)
  const triviaFileRef = useRef<HTMLInputElement>(null)
  // Event branding — two colours + a logo file the host optionally attaches.
  // Logo is uploaded to storage AFTER the tournament row is created (needs an
  // id + host token to auth the upload), so we hold the picked File in memory
  // and a data-URL preview until then.
  const [brandPrimary, setBrandPrimary] = useState<string>('')
  const [brandAccent, setBrandAccent] = useState<string>('')
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null)
  const [brandLogoPreview, setBrandLogoPreview] = useState<string | null>(null)
  const [brandLogoMsg, setBrandLogoMsg] = useState<string | null>(null)
  const brandLogoRef = useRef<HTMLInputElement>(null)
  // Scheduled start (optional). Held as the datetime-local string ("YYYY-
  // MM-DDTHH:mm") the input emits, converted to ISO-Z when POSTing so the
  // server always sees UTC regardless of the host's timezone.
  const [scheduledLocal, setScheduledLocal] = useState<string>('')
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

  // Sensible per-game defaults for the playlist editor's draft row — same
  // values the freestyle "Start Next Game" panel swaps in on the detail page.
  function pickDraftGameType(next: string) {
    setDraftGameType(next)
    if (next === 'trivia') {
      setDraftRounds('10')
      setDraftTimer('30')
    } else if (next === 'i_call_on') {
      setDraftRounds('5')
      setDraftTimer('60')
    } else if (next === 'two_truths') {
      // Two Truths is always one lobby-wide round; rounds input is hidden.
      setDraftTimer('45')
    } else if (next === 'who_said_this') {
      // Round count comes from submitted quotes at game start; only the timer
      // is host-settable here.
      setDraftTimer('30')
    }
  }

  function addQueueEntry() {
    const entry: TournamentQueueEntry = {
      gameType: draftGameType,
      timerSeconds: Math.max(1, parseInt(draftTimer, 10) || 30),
      bigScreenMode: draftBigScreenMode,
    }
    // Two Truths and Who Said This don't take a host-settable round count —
    // the game engine determines rounds at start time.
    if (draftGameType !== 'two_truths' && draftGameType !== 'who_said_this') {
      entry.roundsCount = Math.max(1, parseInt(draftRounds, 10) || 10)
    }
    setQueue((prev) => [...prev, entry])
  }

  function moveQueueEntry(index: number, dir: -1 | 1) {
    setQueue((prev) => {
      const next = prev.slice()
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function removeQueueEntry(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }

  function handleBrandLogoFile(file: File) {
    setBrandLogoMsg(null)
    // ~1 MB — mirrors the server's cap so the host sees the problem before upload.
    if (file.size > 1 * 1024 * 1024) {
      setBrandLogoMsg('Logo must be under 1 MB. Try a smaller file.')
      return
    }
    const okTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
    if (!okTypes.includes(file.type)) {
      setBrandLogoMsg('Logo must be a PNG, JPG, WEBP, GIF, or SVG.')
      return
    }
    setBrandLogoFile(file)
    const reader = new FileReader()
    reader.onload = () => setBrandLogoPreview(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  function clearBrandLogo() {
    setBrandLogoFile(null)
    setBrandLogoPreview(null)
    setBrandLogoMsg(null)
    if (brandLogoRef.current) brandLogoRef.current.value = ''
  }

  async function handleTriviaFile(file: File) {
    setTriviaUploadMsg(null)
    setCustomTriviaPack([])
    const ext = file.name.split('.').pop()?.toLowerCase()
    try {
      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text()
        const result = parseTriviaQuestionImport(text)
        if (result.questions.length === 0) {
          setTriviaUploadMsg('No valid rows. Use question, option_a–option_d, and correct (A–D) columns.')
          return
        }
        setCustomTriviaPack(result.questions)
        setTriviaUploadMsg(formatTriviaImportSummary(result) ?? `${result.questions.length} questions ready`)
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const result = await parseExcelTriviaQuestionImport(buffer)
        if (result.questions.length === 0) {
          setTriviaUploadMsg('No valid rows. Use question, option_a–option_d, and correct (A–D) columns.')
          return
        }
        setCustomTriviaPack(result.questions)
        setTriviaUploadMsg(formatTriviaImportSummary(result) ?? `${result.questions.length} questions ready`)
      } else {
        setTriviaUploadMsg('Please upload a .csv or .xlsx file')
      }
    } catch {
      setTriviaUploadMsg('Could not read that file. Try the sample CSV.')
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError('Enter a tournament title')
      return
    }
    if (isRoundRobin && planned && queue.length === 0) {
      setError('Add at least one game to your playlist, or switch to “Decide as you go”')
      return
    }
    if (
      isRoundRobin &&
      planned &&
      triviaSource !== 'platform' &&
      queue.some((e) => e.gameType === 'trivia') &&
      customTriviaPack.length === 0
    ) {
      setError(
        triviaSource === 'custom'
          ? 'Upload a trivia CSV or switch back to the platform pack'
          : 'Generate some trivia questions or switch back to the platform pack'
      )
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

      // Branding colours — logo is uploaded separately below (needs the new
      // tournament id + host token). Attach whatever colours the host picked;
      // an empty colour just doesn't ship.
      if (brandPrimary || brandAccent) {
        body.branding = {
          ...(brandPrimary ? { primaryColor: brandPrimary } : {}),
          ...(brandAccent ? { accentColor: brandAccent } : {}),
        }
      }

      // Scheduled start — convert the datetime-local string (interpreted in
      // the host's timezone) to an ISO-Z timestamp so the server stores UTC.
      if (scheduledLocal) {
        const asDate = new Date(scheduledLocal)
        if (!Number.isNaN(asDate.getTime())) {
          body.scheduledAt = asDate.toISOString()
        }
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
        // Planned mode only takes effect when the host actually added games.
        if (planned && queue.length > 0) {
          body.gameQueue = queue
        }
        // Shared trivia pack (CSV or AI): attach it only if the host picked a
        // non-platform source AND the playlist actually contains any trivia.
        if (
          planned &&
          triviaSource !== 'platform' &&
          queue.some((e) => e.gameType === 'trivia') &&
          customTriviaPack.length > 0
        ) {
          body.customTriviaPack = customTriviaPack
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

      // Optional logo upload — the tournament exists now and we have a host
      // token, so we can call the branding upload route. Non-fatal: on failure
      // we still redirect (the tournament is created and the host can retry
      // from the tournament page later); we don't want a slow / flaky upload
      // to strand the host without a tournament.
      if (brandLogoFile) {
        try {
          const fd = new FormData()
          fd.append('file', brandLogoFile)
          // Host token travels as a header, not a form field, so the route can
          // authorise before it buffers the upload body.
          const logoRes = await fetch(`/api/tournaments/${data.tournamentCode}/branding/logo`, {
            method: 'POST',
            headers: { 'x-host-token': data.hostToken },
            body: fd,
          })
          if (!logoRes.ok) {
            const logoErr = await logoRes.json().catch(() => ({}))
            console.error('Logo upload failed:', logoErr)
          }
        } catch (uploadErr) {
          console.error('Logo upload threw:', uploadErr)
        }
      }

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

      <div
        className="rounded-xl border border-theme px-4 py-3 text-sm text-body"
        style={{ background: 'var(--surface-inset-bg)', borderLeft: '3px solid var(--primary)' }}
      >
        <p>
          <span className="font-semibold">Hosts run the tournament — they don&apos;t play.</span> If you want to play
          too, join separately from another device, or hand off host mid-event with{' '}
          <span className="font-semibold">Transfer host</span>.
        </p>
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
                  : 'Everyone plays each round together — pick a game per round (Trivia, I Call On, Two Truths, Who Said This, or repeat). Placements across all rounds feed one leaderboard.'}
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
          <div>
            <p className="label-caps mb-2.5">How will games be picked?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={planned}
                onClick={() => setPlanned(true)}
                className={`chip ${planned ? 'chip-active' : ''}`}
              >
                Plan the games
              </button>
              <button
                type="button"
                aria-pressed={!planned}
                onClick={() => setPlanned(false)}
                className={`chip ${!planned ? 'chip-active' : ''}`}
              >
                Decide as you go
              </button>
            </div>
            <p className="text-faint text-xs mt-2">
              {planned
                ? 'Set the order now — one tap starts each round on the night. You can still edit the list mid-tournament.'
                : 'Pick each game live from the tournament page — read the room and switch it up.'}
            </p>
          </div>
        )}

        {isRoundRobin && planned && (
          <div className="surface-inset p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="label-caps">Games in this tournament</p>
              {queue.length > 0 && (
                <p className="text-faint text-xs">
                  ≈ {formatEstimatedDuration(estimatePlaylistSeconds(queue, TIMING_PLAYER_FALLBACK))} for{' '}
                  {TIMING_PLAYER_FALLBACK} players
                </p>
              )}
            </div>

            {queue.length === 0 ? (
              <p className="text-faint text-xs">No games yet — add your first below.</p>
            ) : (
              <ol className="space-y-2">
                {queue.map((entry, index) => (
                  <li
                    key={`${entry.gameType}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-theme px-3 py-2"
                    style={{ background: 'var(--surface-inset-bg)' }}
                  >
                    <span
                      className="tabular-nums text-xs font-semibold"
                      style={{ color: 'var(--muted)', minWidth: '1.5rem' }}
                    >
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body text-sm font-medium truncate">
                        {gameTypeLabel(entry.gameType) ?? entry.gameType}
                        <span className="text-faint text-xs font-normal ml-2">
                          {entry.bigScreenMode === 'projector' ? '🖥' : '📱'}
                        </span>
                      </p>
                      <p className="text-faint text-xs">
                        {entry.gameType === 'trivia'
                          ? `${entry.roundsCount ?? 10} questions · ${entry.timerSeconds ?? 30}s each`
                          : entry.gameType === 'two_truths' || entry.gameType === 'who_said_this'
                            ? `${entry.timerSeconds ?? (entry.gameType === 'two_truths' ? 45 : 30)}s per guess`
                            : `${entry.roundsCount ?? 10} rounds · ${entry.timerSeconds ?? 30}s`}
                        {' · ≈ '}
                        {formatEstimatedDuration(estimateGameSeconds(entry, TIMING_PLAYER_FALLBACK))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveQueueEntry(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${gameTypeLabel(entry.gameType) ?? entry.gameType} up`}
                      className="chip"
                      style={{ opacity: index === 0 ? 0.4 : 1 }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQueueEntry(index, 1)}
                      disabled={index === queue.length - 1}
                      aria-label={`Move ${gameTypeLabel(entry.gameType) ?? entry.gameType} down`}
                      className="chip"
                      style={{ opacity: index === queue.length - 1 ? 0.4 : 1 }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQueueEntry(index)}
                      aria-label={`Remove ${gameTypeLabel(entry.gameType) ?? entry.gameType}`}
                      className="chip"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className="divider-soft" />

            <div className="space-y-2">
              <p className="text-body text-sm font-medium">Add a game</p>
              <Field label="Game" htmlFor="queue-draft-type">
                <select
                  id="queue-draft-type"
                  value={draftGameType}
                  onChange={(e) => pickDraftGameType(e.target.value)}
                  className="input-field"
                >
                  {TOURNAMENT_ELIGIBLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {gameTypeLabel(t) ?? t}
                    </option>
                  ))}
                </select>
              </Field>
              <div
                className={
                  draftGameType === 'two_truths' || draftGameType === 'who_said_this' ? '' : 'grid grid-cols-2 gap-3'
                }
              >
                {draftGameType !== 'two_truths' && draftGameType !== 'who_said_this' && (
                  <Field label={draftGameType === 'trivia' ? 'Questions' : 'Rounds'} htmlFor="queue-draft-rounds">
                    <input
                      id="queue-draft-rounds"
                      type="number"
                      value={draftRounds}
                      onChange={(e) => setDraftRounds(e.target.value)}
                      min={1}
                      max={100}
                      className="input-field"
                    />
                  </Field>
                )}
                <Field label="Timer (s)" htmlFor="queue-draft-timer">
                  <input
                    id="queue-draft-timer"
                    type="number"
                    value={draftTimer}
                    onChange={(e) => setDraftTimer(e.target.value)}
                    min={5}
                    max={300}
                    className="input-field"
                  />
                </Field>
              </div>
              <Field label="Big screen">
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={draftBigScreenMode === 'phone_only'}
                    onClick={() => setDraftBigScreenMode('phone_only')}
                    className={`chip flex-1 ${draftBigScreenMode === 'phone_only' ? 'chip-active' : ''}`}
                    title="Big screen shows leaderboard only; players read from their phones"
                  >
                    📱 Phone only
                  </button>
                  <button
                    type="button"
                    aria-pressed={draftBigScreenMode === 'projector'}
                    onClick={() => setDraftBigScreenMode('projector')}
                    className={`chip flex-1 ${draftBigScreenMode === 'projector' ? 'chip-active' : ''}`}
                    title="Big screen shows the current question/letter/etc. — Kahoot style"
                  >
                    🖥 On the projector
                  </button>
                </div>
                <p className="text-faint text-xs mt-1.5">
                  {draftBigScreenMode === 'projector'
                    ? 'Big screen shows the current question or letter; phones become the answer buttons. Best when you have a TV/projector in the room.'
                    : 'Everyone reads on their phone; big screen shows the leaderboard only. Pick this if there’s no screen in the room.'}
                </p>
              </Field>
              <button
                type="button"
                onClick={addQueueEntry}
                disabled={queue.length >= 20}
                className="btn-secondary w-full"
              >
                + Add to playlist
              </button>
              {queue.length >= 20 && (
                <p className="text-faint text-xs text-center">Playlist limit reached (20 games).</p>
              )}
            </div>
          </div>
        )}

        {/* Shared trivia pack — only shown when the playlist actually contains
            a Trivia entry, otherwise there's nothing for it to be used with. */}
        {isRoundRobin && planned && queue.some((e) => e.gameType === 'trivia') && (
          <div className="surface-inset p-4 space-y-3">
            <p className="label-caps">Trivia questions</p>
            <p className="text-faint text-xs">
              Every Trivia round in your playlist shares this pack. Questions don&apos;t repeat between rounds — so a
              pack of 30 works for one 30-question round or three 10-question rounds, not both.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={triviaSource === 'platform'}
                onClick={() => setTriviaSource('platform')}
                className={`chip flex-1 ${triviaSource === 'platform' ? 'chip-active' : ''}`}
              >
                Platform pack
              </button>
              <button
                type="button"
                aria-pressed={triviaSource === 'custom'}
                onClick={() => setTriviaSource('custom')}
                className={`chip flex-1 ${triviaSource === 'custom' ? 'chip-active' : ''}`}
              >
                Upload CSV
              </button>
              <button
                type="button"
                aria-pressed={triviaSource === 'ai'}
                onClick={() => setTriviaSource('ai')}
                className={`chip flex-1 ${triviaSource === 'ai' ? 'chip-active' : ''}`}
              >
                Generate with AI
              </button>
            </div>

            {triviaSource === 'custom' && (
              <div className="space-y-3">
                <input
                  ref={triviaFileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleTriviaFile(f)
                  }}
                  className="hidden"
                />
                {customTriviaPack.length === 0 ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => triviaFileRef.current?.click()}
                      className="btn-secondary w-full"
                    >
                      Choose CSV or Excel file
                    </button>
                    <p className="text-faint text-xs">
                      Columns: question, option_a–option_d, correct (A–D).{' '}
                      <a
                        href={questionSampleFile('trivia').href}
                        download={questionSampleFile('trivia').download}
                        className="underline hover:text-body"
                        style={{ color: 'var(--primary)' }}
                      >
                        Download sample
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-body font-medium">
                      ✓ {customTriviaPack.length} question{customTriviaPack.length === 1 ? '' : 's'} loaded
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomTriviaPack([])
                        setTriviaUploadMsg(null)
                        if (triviaFileRef.current) triviaFileRef.current.value = ''
                      }}
                      className="btn-ghost text-xs"
                    >
                      Clear
                    </button>
                  </div>
                )}
                {triviaUploadMsg && <p className="text-faint text-xs">{triviaUploadMsg}</p>}
              </div>
            )}

            {triviaSource === 'ai' && (
              <AiQuestionsGenerator
                gameType="trivia"
                triviaCategory="general"
                defaultCount={20}
                maxCount={50}
                onGenerated={(questions) => setCustomTriviaPack(questions as TriviaQuestion[])}
              />
            )}

            {triviaSource !== 'platform' &&
              customTriviaPack.length > 0 &&
              (() => {
                const totalTriviaQuestions = queue
                  .filter((e) => e.gameType === 'trivia')
                  .reduce((sum, e) => sum + (e.roundsCount ?? 10), 0)
                const short = customTriviaPack.length < totalTriviaQuestions
                return (
                  <p className={`text-xs ${short ? 'text-amber-400' : 'text-faint'}`}>
                    Pack has {customTriviaPack.length} question{customTriviaPack.length === 1 ? '' : 's'}. Your Trivia
                    rounds ask for {totalTriviaQuestions} across the playlist
                    {short ? ' — add more questions or lower a round count, or a later round won’t start.' : '.'}
                  </p>
                )
              })()}
          </div>
        )}

        {isRoundRobin && !planned && (
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

      {/* Schedule the event for later — optional. Shows a countdown + "Add to
          calendar" (.ics) download to everyone on the invite link, so players
          can pre-register days ahead and get pinged by their own calendar
          when it's time. Host still starts the event manually on the day. */}
      <div className="glass-card-strong p-5 sm:p-6 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="label-caps">Schedule (optional)</p>
          <span className="text-faint text-xs">Pre-register players days ahead</span>
        </div>
        <Field label="Start date & time" htmlFor="tournament-scheduled-at">
          <input
            id="tournament-scheduled-at"
            type="datetime-local"
            value={scheduledLocal}
            onChange={(e) => setScheduledLocal(e.target.value)}
            className="input-field"
          />
          <p className="text-faint text-xs mt-1.5">
            Leave empty for right now. Sets a countdown on the invite link so pre-registered players know when to show
            up.
          </p>
        </Field>
      </div>

      {/* Event branding — optional. Two brand colours + a logo, applied to the
          lobby, in-game header, and results card. Skipping any field leaves the
          default palette in place. */}
      <div className="glass-card-strong p-5 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="label-caps">Event branding (optional)</p>
          <span className="text-faint text-xs">Shown to players in the lobby &amp; game</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary colour" htmlFor="brand-primary">
            <div className="flex items-center gap-2">
              <input
                id="brand-primary"
                type="color"
                value={brandPrimary || '#7c3aed'}
                onChange={(e) => setBrandPrimary(e.target.value)}
                aria-label="Primary brand colour"
                className="h-10 w-14 rounded-lg border border-theme cursor-pointer"
              />
              <input
                type="text"
                value={brandPrimary}
                onChange={(e) => setBrandPrimary(e.target.value)}
                placeholder="#7c3aed"
                maxLength={7}
                className="input-field flex-1 font-mono text-sm"
              />
              {brandPrimary && (
                <button
                  type="button"
                  onClick={() => setBrandPrimary('')}
                  className="btn-ghost text-xs"
                  aria-label="Clear primary colour"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>
          <Field label="Accent colour" htmlFor="brand-accent">
            <div className="flex items-center gap-2">
              <input
                id="brand-accent"
                type="color"
                value={brandAccent || '#f59e0b'}
                onChange={(e) => setBrandAccent(e.target.value)}
                aria-label="Accent brand colour"
                className="h-10 w-14 rounded-lg border border-theme cursor-pointer"
              />
              <input
                type="text"
                value={brandAccent}
                onChange={(e) => setBrandAccent(e.target.value)}
                placeholder="#f59e0b"
                maxLength={7}
                className="input-field flex-1 font-mono text-sm"
              />
              {brandAccent && (
                <button
                  type="button"
                  onClick={() => setBrandAccent('')}
                  className="btn-ghost text-xs"
                  aria-label="Clear accent colour"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>
        </div>

        <Field label="Logo (optional)" htmlFor="brand-logo">
          <input
            ref={brandLogoRef}
            id="brand-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleBrandLogoFile(f)
            }}
            className="hidden"
          />
          {brandLogoPreview ? (
            <div className="surface-inset p-4 flex items-center gap-4">
              {}
              <img
                src={brandLogoPreview}
                alt="Logo preview"
                className="h-16 w-16 object-contain rounded-lg"
                style={{ background: 'var(--surface-inset-bg)' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-body text-sm font-medium truncate">{brandLogoFile?.name}</p>
                <p className="text-faint text-xs">
                  {brandLogoFile ? `${Math.round(brandLogoFile.size / 1024)} KB` : ''} · uploaded when you create
                </p>
              </div>
              <button type="button" onClick={clearBrandLogo} className="btn-ghost text-xs">
                Remove
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => brandLogoRef.current?.click()} className="btn-secondary w-full">
              Choose logo file
            </button>
          )}
          {brandLogoMsg && <p className="text-red-400 text-xs mt-2">{brandLogoMsg}</p>}
          <p className="text-faint text-xs mt-2">PNG / JPG / WEBP / GIF / SVG — 1 MB max. A square logo works best.</p>
        </Field>

        {(brandPrimary || brandAccent || brandLogoPreview) && (
          <div
            className="surface-inset p-4 space-y-2 flex items-center gap-3"
            style={{
              ...(brandPrimary ? ({ '--primary': brandPrimary } as CSSProperties) : {}),
            }}
          >
            {brandLogoPreview && <img src={brandLogoPreview} alt="" className="h-10 w-10 object-contain" />}
            <div className="flex-1">
              <p className="text-body text-sm font-medium">Preview</p>
              <p className="text-faint text-xs">
                Your event will look <span style={{ color: 'var(--primary)', fontWeight: 700 }}>like this</span>
                {brandAccent && (
                  <>
                    {' '}
                    with <span style={{ color: brandAccent, fontWeight: 700 }}>accent bits</span>
                  </>
                )}
                .
              </p>
            </div>
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
