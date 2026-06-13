'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ParticipantGender, ParticipantMode, GameType } from '@/types'
import {
  type ParticipantInput,
  parseParticipantRows,
  parseExcelParticipants,
  mergeParticipants,
  countByGender,
  hasEnoughForRounds,
  genderLabel,
} from '@/lib/participants'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'

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

export default function CreateGame() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('settings')
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

  const genderCounts = countByGender(participants)
  const isJoinersMode = settings.participant_mode === 'joiners'
  const canCreateImport = participants.length >= 3 && hasEnoughForRounds(participants)
  const canCreateJoiners = !!settings.title.trim()

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
      <PageShell>
        <BackBtn onClick={() => router.push('/')} />
        <div>
          <p className="label-caps mb-2">New game</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Create Game</h1>
        </div>

        <div className="glass-card p-5 space-y-5">
          <Field label="Game Name">
            <input
              value={settings.title}
              onChange={(e) => setSettings({ ...settings, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && settings.title.trim() && setStep('participants')}
              placeholder="Friday Night KMS"
              autoFocus
              className="input-field"
            />
          </Field>

          <Field label="Game Type">
            <div className="grid gap-2">
              {GAME_TYPE_OPTIONS.map((type) => {
                const cfg = gameTypeConfig(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSettings({ ...settings, game_type: type })}
                    className={`text-left rounded-2xl border p-4 transition-all ${
                      settings.game_type === type
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                        : 'border-white/10 surface-inset hover:border-white/20'
                    }`}
                  >
                    <p className="font-semibold text-white">
                      {cfg.headerEmoji} {cfg.label}
                    </p>
                    <p className="text-faint text-xs mt-1">{cfg.tagline}</p>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Who Joins">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, participant_mode: 'joiners' })}
                className={`text-left rounded-2xl border p-4 transition-all ${
                  settings.participant_mode === 'joiners'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-white/10 surface-inset hover:border-white/20'
                }`}
              >
                <p className="font-semibold text-white">Join &amp; play</p>
                <p className="text-faint text-xs mt-1">
                  Everyone who joins is in the poll — no list to upload first
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, participant_mode: 'import' })}
                className={`text-left rounded-2xl border p-4 transition-all ${
                  settings.participant_mode === 'import'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-white/10 surface-inset hover:border-white/20'
                }`}
              >
                <p className="font-semibold text-white">Import list</p>
                <p className="text-faint text-xs mt-1">
                  Upload names before the game — joiners only vote, they are not on the list
                </p>
              </button>
            </div>
          </Field>

          <Field label="Number of Rounds">
            <div className="flex gap-2 flex-wrap">
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <Chip
                  key={n}
                  active={settings.rounds_count === n}
                  onClick={() => setSettings({ ...settings, rounds_count: n })}
                >
                  {n}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Time Per Round">
            <div className="flex gap-2">
              {[15, 30, 60].map((t) => (
                <Chip
                  key={t}
                  active={settings.timer_seconds === t}
                  onClick={() => setSettings({ ...settings, timer_seconds: t })}
                  wide
                >
                  {t}s
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="When Timer Runs Out (incomplete votes)">
            <div className="flex gap-2">
              <Chip
                active={settings.auto_submit_behavior === 'random'}
                onClick={() => setSettings({ ...settings, auto_submit_behavior: 'random' })}
                wide
              >
                Random Fill
              </Chip>
              <Chip
                active={settings.auto_submit_behavior === 'no_answer'}
                onClick={() => setSettings({ ...settings, auto_submit_behavior: 'no_answer' })}
                wide
              >
                No Answer
              </Chip>
            </div>
          </Field>

          <div className="space-y-2 pt-1">
            <Toggle
              label="Anonymous Responses"
              description="Hide who voted for what"
              value={settings.anonymous}
              onChange={(v) => setSettings({ ...settings, anonymous: v })}
            />
            <Toggle
              label="Auto-Reveal Results"
              description="Show results after the last round automatically"
              value={settings.auto_reveal}
              onChange={(v) => setSettings({ ...settings, auto_reveal: v })}
            />
          </div>
        </div>

        {isJoinersMode ? (
          <PrimaryBtn onClick={createGame} disabled={!canCreateJoiners || loading}>
            {loading ? 'Creating...' : 'Create Game'}
          </PrimaryBtn>
        ) : (
          <PrimaryBtn
            onClick={() => setStep('participants')}
            disabled={!settings.title.trim()}
          >
            Next: Add Participants →
          </PrimaryBtn>
        )}
      </PageShell>
    )
  }

  if (step === 'participants') {
    return (
      <PageShell>
        <BackBtn onClick={() => setStep('settings')} />
        <div>
          <p className="label-caps mb-2">Almost there</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Add Participants</h1>
          <p className="text-muted text-sm mt-2">
            Each round picks 3 people of the <strong className="text-white/90">same gender</strong> — upload a sheet with name + gender, or add manually.
          </p>
        </div>

        <div className="glass-card p-5 space-y-4">
          <Field label="Upload CSV or Excel">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-secondary flex-1"
              >
                Choose file (.csv / .xlsx)
              </button>
              <a
                href="/participants-sample.csv"
                download="participants-sample.csv"
                className="btn-secondary flex-1 text-center no-underline"
              >
                Download sample
              </a>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFileUpload}
            />
            <p className="text-faint text-xs mt-2">
              Column 1: name · Column 2: gender (<span className="text-white/50">male</span> or <span className="text-white/50">female</span>)
            </p>
          </Field>

          {uploadError && (
            <p className="text-red-300 text-sm">{uploadError}</p>
          )}

          <div className="flex items-center gap-3">
            <div className="divider-soft" />
            <span className="text-faint text-xs shrink-0">or add manually</span>
            <div className="divider-soft" />
          </div>

          <Field label="Gender for single names">
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
            <button
              onClick={addParticipant}
              className="btn-secondary shrink-0 px-5 whitespace-nowrap"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            <textarea
              value={bulkPaste}
              onChange={(e) => setBulkPaste(e.target.value)}
              placeholder={'name,gender\nSarah,female\nJames,male\n…or paste from Excel'}
              rows={4}
              className="input-field resize-y min-h-[96px] font-medium"
            />
            <button
              onClick={addBulkParticipants}
              disabled={!bulkPaste.trim()}
              className="btn-secondary w-full disabled:opacity-40"
            >
              Add all from paste
            </button>
          </div>

          {participants.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {participants.map((p, i) => (
                <div key={`${p.name}-${p.gender}-${i}`} className="surface-inset flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={p.name} />
                    <span className="font-medium truncate">{p.name}</span>
                    <GenderBadge gender={p.gender} />
                  </div>
                  <button
                    onClick={() => removeParticipant(i)}
                    className="text-faint hover:text-[var(--kill)] text-2xl leading-none transition-colors shrink-0 ml-2"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-faint">No participants yet</div>
          )}

          {participants.length > 0 && (
            <p className="text-faint text-sm text-center">
              {genderCounts.female} female · {genderCounts.male} male
            </p>
          )}

          {!hasEnoughForRounds(participants) && participants.length > 0 && (
            <p className="text-amber-200/90 text-sm text-center">
              Need at least 3 people of the same gender to run rounds
            </p>
          )}
          {participants.length < 3 && participants.length > 0 && (
            <p className="text-faint text-sm text-center">
              Add {3 - participants.length} more to continue
            </p>
          )}
        </div>

        <PrimaryBtn onClick={createGame} disabled={!canCreateImport || loading}>
          {loading ? 'Creating...' : `Create Game (${participants.length} participants)`}
        </PrimaryBtn>
      </PageShell>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const gameUrl = `${origin}/game/${result?.gameCode}`
  const hostUrl = `${origin}/host/${result?.gameCode}?token=${result?.hostToken}`

  return (
    <PageShell>
      <div className="text-center space-y-2">
        <div className="text-6xl">🎉</div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Game Created!</h1>
        <p className="text-muted">Share the link or code below</p>
      </div>

      <CopyCard label="Share this with players" value={gameUrl}>
        <div className="mt-3 text-center glass-card px-4 py-3">
          <span className="label-caps">Game Code</span>
          <p className="font-mono text-4xl font-black tracking-[0.28em] mt-1">{result?.gameCode}</p>
        </div>
      </CopyCard>

      <CopyCard label="Your host link (save this!)" value={hostUrl} accent />

      <PrimaryBtn onClick={() => router.push(`/host/${result?.gameCode}?token=${result?.hostToken}`)}>
        Open Host Panel →
      </PrimaryBtn>

      <p className="text-faint text-xs text-center">The host link won&apos;t be shown again — save it now</p>
    </PageShell>
  )
}

function GenderBadge({ gender }: { gender: ParticipantGender }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shrink-0 ${
        gender === 'male'
          ? 'bg-sky-500/15 text-sky-200 border border-sky-400/25'
          : 'bg-pink-500/15 text-pink-200 border border-pink-400/25'
      }`}
    >
      {genderLabel(gender)}
    </span>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wrap flex flex-col items-center justify-start px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-lg space-y-6">{children}</div>
    </div>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-muted hover:text-white text-sm transition-colors">
      ← Back
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-muted text-sm font-medium block mb-2">{label}</label>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children, wide }: { active: boolean; onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${wide ? 'flex-1' : 'px-4'} chip active:scale-95 ${active ? 'chip-active' : ''}`}
    >
      {children}
    </button>
  )
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className="surface-inset flex items-center justify-between px-4 py-3 cursor-pointer hover:border-white/12 transition-colors"
      onClick={() => onChange(!value)}
    >
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-faint text-xs mt-0.5">{description}</p>
      </div>
      <div className={`ml-3 shrink-0 w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-[var(--primary-strong)]' : 'bg-white/10'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-primary">
      {children}
    </button>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="avatar w-8 h-8 text-sm shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function CopyCard({ label, value, children, accent }: { label: string; value: string; children?: React.ReactNode; accent?: boolean }) {
  const copy = () => navigator.clipboard.writeText(value).catch(() => null)
  return (
    <div className={`glass-card p-5 space-y-3 ${accent ? 'border-[rgba(192,132,252,0.35)]' : ''}`}>
      <p className={`label-caps ${accent ? 'text-[var(--primary)]' : ''}`}>{label}</p>
      <p className="font-mono text-sm break-all text-white/90">{value}</p>
      {children}
      <button
        onClick={copy}
        className={`text-sm font-semibold transition-colors ${accent ? 'text-[var(--primary)] hover:text-white' : 'text-muted hover:text-white'}`}
      >
        Copy →
      </button>
    </div>
  )
}
