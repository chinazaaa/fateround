'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ParticipantGender, ParticipantMode, GameType } from '@/types'
import {
  type ParticipantInput,
  parseParticipantRows,
  parseExcelParticipants,
  mergeParticipants,
  countByGender,
  hasEnoughForRounds,
  genderLabel,
  participantModeOptions,
  participantImportStepHint,
} from '@/lib/participants'
import {
  roundPoolSize,
  isLobbyGame,
  isMostLikelyTo,
  isWouldYouRather,
  isAnonymousGame,
  parseGameType,
} from '@/lib/game-types'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { GameTypeModal } from '@/components/GameTypeModal'
import { GameTypeCard } from '@/components/GameTypeCard'
import { PageShell, BackBtn, Field, Chip, Toggle, PrimaryBtn } from '@/components/ui/PageShell'
import { StepIndicator, SettingsGroup, StickyActionBar, SegmentedControl, ChipGrid } from '@/components/ui/CreateWizard'

interface Settings {
  title: string
  rounds_count: number
  timer_seconds: number
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: 'random' | 'no_answer'
  participant_mode: ParticipantMode
  game_type: GameType
}

type Step = 'settings' | 'participants' | 'done'
type ParticipantTab = 'upload' | 'manual'

function CreateGameInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>('settings')
  const [showGameTypes, setShowGameTypes] = useState(false)
  const [participantTab, setParticipantTab] = useState<ParticipantTab>('upload')
  const [settings, setSettings] = useState<Settings>({
    title: '',
    rounds_count: 3,
    timer_seconds: 30,
    anonymous: false,
    auto_reveal: true,
    auto_submit_behavior: 'random',
    participant_mode: 'import',
    game_type: 'smash_marry_kill',
  })
  const [participants, setParticipants] = useState<ParticipantInput[]>([])
  const [nameInput, setNameInput] = useState('')
  const [defaultGender, setDefaultGender] = useState<ParticipantGender>('female')
  const [loading, setLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [result, setResult] = useState<{ gameCode: string; hostToken: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [bulkPaste, setBulkPaste] = useState('')

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam) {
      const type = parseGameType(typeParam)
      setSettings((prev) => ({
        ...prev,
        game_type: type,
        ...(isLobbyGame(type) ? { participant_mode: 'joiners', anonymous: true } : {}),
      }))
    }
  }, [searchParams])

  const genderCounts = countByGender(participants)
  const isJoinersMode = settings.participant_mode === 'joiners'
  const isWyr = isWouldYouRather(settings.game_type)
  const isMlt = isMostLikelyTo(settings.game_type)
  const minPool = roundPoolSize(settings.game_type)
  const canCreateImport = participants.length >= minPool && hasEnoughForRounds(participants, settings.game_type)
  const canCreateJoiners = !!settings.title.trim()
  const canCreateQuickLobby = !!settings.title.trim()
  const needsParticipantStep = !isWyr && !(isMlt && isJoinersMode) && !isJoinersMode
  const wizardSteps = needsParticipantStep ? ['Setup', 'People'] : ['Setup']
  const stepIndex = step === 'participants' ? 2 : 1

  const mltRoundOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= MLT_QUESTION_COUNT)
  const wyrRoundOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= WYR_QUESTION_COUNT)
  const roundOptions = isWyr ? wyrRoundOptions : isMlt ? mltRoundOptions : [2, 3, 4, 5, 6, 8, 10]

  const selectGameType = (type: GameType) => {
    setSettings({
      ...settings,
      game_type: type,
      ...(isLobbyGame(type) ? { participant_mode: 'joiners', anonymous: true } : {}),
    })
  }

  const addParticipantsFromRows = (rows: ParticipantInput[]) => {
    if (rows.length === 0) return 0
    setParticipants((prev) => mergeParticipants(prev, rows))
    return rows.length
  }

  const addParticipant = () => {
    const name = nameInput.trim()
    if (!name) return
    addParticipantsFromRows([{ name, gender: defaultGender }])
    setNameInput('')
    inputRef.current?.focus()
  }

  const addBulkParticipants = () => {
    if (!bulkPaste.trim()) return
    setUploadError(null)
    const rows = parseParticipantRows(bulkPaste)
    if (rows.length === 0) {
      setUploadError('Use two columns: name and gender (e.g. Sarah,female)')
      return
    }
    addParticipantsFromRows(rows)
    setBulkPaste('')
  }

  const handleNamePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/[\n\r\t,;]/.test(text)) return
    e.preventDefault()
    const rows = parseParticipantRows(text)
    if (rows.length > 0) {
      addParticipantsFromRows(rows)
      setNameInput('')
    } else {
      const names = text.split(/[\n\r\t,;]+/).map((s) => s.trim()).filter(Boolean)
      addParticipantsFromRows(names.map((name) => ({ name, gender: defaultGender })))
      setNameInput('')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      if (ext === 'csv') {
        const text = await file.text()
        const rows = parseParticipantRows(text)
        if (rows.length === 0) {
          setUploadError('No valid rows found. First column: name. Second column: gender (male/female).')
          return
        }
        addParticipantsFromRows(rows)
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const rows = await parseExcelParticipants(buffer)
        if (rows.length === 0) {
          setUploadError('No valid rows found. First column: name. Second column: gender (male/female).')
          return
        }
        addParticipantsFromRows(rows)
        return
      }

      setUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setUploadError('Could not read that file. Try the sample CSV format.')
    }
  }

  const removeParticipant = (i: number) => setParticipants((prev) => prev.filter((_, idx) => idx !== i))

  const createGame = async () => {
    if (loading) return
    if (isJoinersMode ? !canCreateJoiners : !canCreateImport) return
    setLoading(true)
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          participants: isJoinersMode ? [] : participants,
        }),
      })
      const data = await res.json()
      if (data.gameCode) {
        setResult(data)
        setStep('done')
      } else {
        alert(data.error || 'Failed to create game')
      }
    } finally {
      setLoading(false)
    }
  }

  if (step === 'settings') {
    return (
      <>
        <PageShell>
          <BackBtn onClick={() => router.push('/')} label="Home" />

          {needsParticipantStep && (
            <StepIndicator steps={wizardSteps} current={stepIndex} />
          )}

          <div>
            <p className="label-caps mb-1">New game</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title-subtle">Create Game</h1>
          </div>

          {/* Essentials */}
          <div className="glass-card-strong p-5 space-y-4">
            <Field label="Game name">
              <input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Friday Night KMS"
                autoFocus
                className="input-field"
              />
            </Field>

            <Field label="Game mode">
              <GameTypeCard
                type={settings.game_type}
                compact
                selected
                onClick={() => setShowGameTypes(true)}
              />
            </Field>
          </div>

          {/* Rules */}
          <div className="glass-card p-5 space-y-5">
            <SettingsGroup title="Round settings">
              <Field label="Rounds">
                <ChipGrid>
                  {roundOptions.map((n) => (
                    <Chip
                      key={n}
                      active={settings.rounds_count === n}
                      onClick={() => setSettings({ ...settings, rounds_count: n })}
                      className="!px-0 w-full"
                    >
                      {n}
                    </Chip>
                  ))}
                </ChipGrid>
              </Field>

              <Field label="Time per round">
                <SegmentedControl
                  value={String(settings.timer_seconds) as '15' | '30' | '60'}
                  onChange={(v) => setSettings({ ...settings, timer_seconds: Number(v) })}
                  options={[
                    { value: '15', label: '15s' },
                    { value: '30', label: '30s' },
                    { value: '60', label: '60s' },
                  ]}
                />
              </Field>
            </SettingsGroup>

            {!isWyr && (
              <SettingsGroup title="Who's in the poll">
                <SegmentedControl
                  value={settings.participant_mode}
                  onChange={(mode) => setSettings({ ...settings, participant_mode: mode })}
                  options={participantModeOptions(settings.game_type)}
                />
              </SettingsGroup>
            )}

            <SettingsGroup
              title="Advanced"
              description="Timer behavior & privacy"
              collapsible
              defaultOpen={false}
            >
              <Field label="When timer runs out">
                <SegmentedControl
                  value={settings.auto_submit_behavior}
                  onChange={(v) => setSettings({ ...settings, auto_submit_behavior: v })}
                  options={[
                    { value: 'random', label: 'Random fill', hint: 'Incomplete votes get random choices.' },
                    { value: 'no_answer', label: 'No answer', hint: 'Incomplete votes count as no vote.' },
                  ]}
                />
              </Field>

              <div className="space-y-2">
                {!isAnonymousGame(settings.game_type) && (
                  <Toggle
                    label="Anonymous responses"
                    description="Hide who voted for what"
                    value={settings.anonymous}
                    onChange={(v) => setSettings({ ...settings, anonymous: v })}
                  />
                )}
                {isAnonymousGame(settings.game_type) && (
                  <p className="text-faint text-xs px-1">
                    Would You Rather and Most Likely To are always anonymous.
                  </p>
                )}
                <Toggle
                  label="Auto-reveal results"
                  description="Show results after the last round automatically"
                  value={settings.auto_reveal}
                  onChange={(v) => setSettings({ ...settings, auto_reveal: v })}
                />
              </div>
            </SettingsGroup>
          </div>

          <StickyActionBar>
            {isWyr || (isMlt && isJoinersMode) ? (
              <PrimaryBtn onClick={createGame} disabled={!canCreateQuickLobby || loading}>
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : isJoinersMode ? (
              <PrimaryBtn onClick={createGame} disabled={!canCreateJoiners || loading}>
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : (
              <PrimaryBtn onClick={() => setStep('participants')} disabled={!settings.title.trim()}>
                Next: Add People →
              </PrimaryBtn>
            )}
          </StickyActionBar>
        </PageShell>

        <GameTypeModal
          open={showGameTypes}
          onClose={() => setShowGameTypes(false)}
          selected={settings.game_type}
          onSelect={selectGameType}
        />
      </>
    )
  }

  if (step === 'participants') {
    return (
      <PageShell>
        <BackBtn onClick={() => setStep('settings')} />
        <StepIndicator steps={wizardSteps} current={stepIndex} />

        <div>
          <p className="label-caps mb-1">Step 2</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title-subtle">Add People</h1>
          <p className="text-muted text-sm mt-1.5">
            {participantImportStepHint(settings.game_type)}
          </p>
        </div>

        <div className="glass-card p-5 space-y-4">
          <SegmentedControl
            value={participantTab}
            onChange={setParticipantTab}
            options={[
              { value: 'upload', label: 'Upload file', hint: 'CSV or Excel with name and gender columns.' },
              { value: 'manual', label: 'Add manually', hint: 'Type names one at a time or paste a list.' },
            ]}
          />

          {participantTab === 'upload' ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-secondary w-full !py-4 border-dashed"
              >
                Choose .csv or .xlsx
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFileUpload}
              />
              <a
                href="/participants-sample.csv"
                download="participants-sample.csv"
                className="block text-center text-faint text-xs hover:text-[var(--foreground)] transition-colors"
              >
                Download sample CSV →
              </a>
              {uploadError && <p className="text-red-400 text-sm">{uploadError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Default gender">
                <div className="flex gap-2">
                  <Chip active={defaultGender === 'female'} onClick={() => setDefaultGender('female')} wide>
                    Female
                  </Chip>
                  <Chip active={defaultGender === 'male'} onClick={() => setDefaultGender('male')} wide>
                    Male
                  </Chip>
                </div>
              </Field>

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
                  onPaste={handleNamePaste}
                  placeholder="Enter name..."
                  autoFocus
                  className="input-field"
                />
                <button type="button" onClick={addParticipant} className="btn-secondary shrink-0 px-5">
                  Add
                </button>
              </div>

              <textarea
                value={bulkPaste}
                onChange={(e) => setBulkPaste(e.target.value)}
                placeholder={'Paste from Excel:\nSarah,female\nJames,male'}
                rows={3}
                className="input-field resize-none font-medium"
              />
              <button
                type="button"
                onClick={addBulkParticipants}
                disabled={!bulkPaste.trim()}
                className="btn-secondary w-full disabled:opacity-40"
              >
                Add all from paste
              </button>
            </div>
          )}

          {/* Participant list */}
          {participants.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <p className="label-caps !text-[10px]">{participants.length} added</p>
                <p className="text-faint text-xs">
                  {genderCounts.female}F · {genderCounts.male}M
                </p>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {participants.map((p, i) => (
                  <div key={`${p.name}-${p.gender}-${i}`} className="surface-inset flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={p.name} />
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      <GenderBadge gender={p.gender} />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeParticipant(i)}
                      className="text-faint hover:text-[var(--kill)] text-xl leading-none transition-colors shrink-0 ml-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-faint text-sm border-t border-[var(--border)]">
              No people added yet
            </div>
          )}

          {!isMlt && !hasEnoughForRounds(participants, settings.game_type) && participants.length > 0 && (
            <p className="text-amber-500 text-xs text-center">
              Need at least {minPool} people of the same gender to run rounds
            </p>
          )}
        </div>

        <StickyActionBar>
          <PrimaryBtn onClick={createGame} disabled={!canCreateImport || loading}>
            {loading ? 'Creating...' : `Create Game · ${participants.length} people`}
          </PrimaryBtn>
        </StickyActionBar>
      </PageShell>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const gameUrl = `${origin}/game/${result?.gameCode}`
  const hostUrl = `${origin}/host/${result?.gameCode}?token=${result?.hostToken}`

  return (
    <PageShell centered>
      <div className="text-center space-y-2">
        <div
          className="inline-flex h-20 w-20 items-center justify-center rounded-3xl text-4xl mx-auto"
          style={{ background: 'var(--chip-active-bg)' }}
        >
          🎉
        </div>
        <h1 className="text-3xl font-black tracking-tight gradient-title-subtle">You&apos;re live!</h1>
        <p className="text-muted text-sm">Share the code with players — save your host link.</p>
      </div>

      <div className="glass-card-strong p-6 text-center space-y-2">
        <span className="label-caps">Game code</span>
        <p className="font-mono text-5xl font-black tracking-[0.2em]">{result?.gameCode}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(result?.gameCode ?? '').catch(() => null)}
          className="text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity"
        >
          Copy code
        </button>
      </div>

      <CopyCard label="Player link" value={gameUrl} />
      <CopyCard label="Host link — save this" value={hostUrl} accent />

      <PrimaryBtn onClick={() => router.push(`/host/${result?.gameCode}?token=${result?.hostToken}`)}>
        Open Host Panel →
      </PrimaryBtn>

      <p className="text-faint text-xs text-center">The host link won&apos;t be shown again</p>
    </PageShell>
  )
}

export default function CreateGame() {
  return (
    <Suspense fallback={
      <PageShell centered>
        <div className="text-center text-muted">Loading...</div>
      </PageShell>
    }>
      <CreateGameInner />
    </Suspense>
  )
}

function GenderBadge({ gender }: { gender: ParticipantGender }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shrink-0 ${
        gender === 'male'
          ? 'bg-sky-500/15 text-sky-600 border border-sky-400/25 dark:text-sky-300'
          : 'bg-pink-500/15 text-pink-600 border border-pink-400/25 dark:text-pink-300'
      }`}
    >
      {genderLabel(gender)}
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="avatar w-7 h-7 text-xs shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function CopyCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const copy = () => navigator.clipboard.writeText(value).catch(() => null)
  return (
    <div className={`glass-card p-4 space-y-2 ${accent ? 'border-[var(--primary)]/35' : ''}`}>
      <p className={`label-caps ${accent ? 'text-[var(--primary)]' : ''}`}>{label}</p>
      <p className="font-mono text-xs break-all text-muted">{value}</p>
      <button
        type="button"
        onClick={copy}
        className={`text-sm font-semibold transition-colors ${accent ? 'text-[var(--primary)] hover:opacity-80' : 'text-muted hover:text-[var(--foreground)]'}`}
      >
        Copy link →
      </button>
    </div>
  )
}
