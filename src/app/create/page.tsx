'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  ParticipantGender,
  ParticipantMode,
  GameType,
  PairVoteMode,
  QuestionSource,
  ThemeId,
  WstQuoteSource,
} from '@/types'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import {
  type ParticipantInput,
  parseParticipantsForGame,
  parseExcelParticipants,
  mergeParticipants,
  countByGender,
  hasEnoughForRounds,
  genderLabel,
  participantModeOptions,
  participantImportStepHint,
  participantUploadHint,
  participantsNeedGender,
  participantSampleFile,
} from '@/lib/participants'
import {
  roundPoolSize,
  isLobbyGame,
  isMostLikelyTo,
  isWouldYouRather,
  isWhoSaidThis,
  isHotSeat,
  isAnonymousGame,
  parseGameType,
  isPairGame,
  isCustomGame,
  pairVoteModeOptions,
  gameHowItWorks,
} from '@/lib/game-types'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import {
  parseWyrQuestionRows,
  parseMltQuestionRows,
  parseExcelWyrQuestions,
  parseExcelMltQuestions,
  mergeWyrQuestions,
  mergeMltQuestions,
  questionSampleFile,
  questionUploadHint,
  questionSourceOptions,
} from '@/lib/custom-questions'
import { CustomSlotBuilder } from '@/components/CustomSlotBuilder'
import type { CustomSlotsConfig } from '@/types'
import { GameTypeModal } from '@/components/GameTypeModal'
import { GameTypeCard } from '@/components/GameTypeCard'
import { PageShell, BackBtn, Field, Chip, Toggle, PrimaryBtn } from '@/components/ui/PageShell'
import { StepIndicator, SettingsGroup, StickyActionBar, SegmentedControl, ChipGrid } from '@/components/ui/CreateWizard'
import { clampHotSeatMaxCap, hotSeatMaxCapUpperBound, HOT_SEAT_MIN_PLAYERS } from '@/lib/hot-seat'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { useToast } from '@/components/ui/Toast'

interface Settings {
  title: string
  rounds_count: number
  timer_seconds: number
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: 'random' | 'no_answer'
  participant_mode: ParticipantMode
  pair_vote_mode: PairVoteMode
  game_type: GameType
  theme: ThemeId
  participant_filter: 'all' | 'joined'
}

type Step = 'settings' | 'participants' | 'done'
type ParticipantTab = 'upload' | 'manual'
type QuestionTab = 'upload' | 'manual'

function CreateGameInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [step, setStep] = useState<Step>('settings')
  const [showGameTypes, setShowGameTypes] = useState(false)
  const [participantTab, setParticipantTab] = useState<ParticipantTab>('upload')
  const [settings, setSettings] = useState<Settings>({
    title: '',
    rounds_count: 3,
    timer_seconds: 30,
    anonymous: true,
    auto_reveal: true,
    auto_submit_behavior: 'no_answer',
    participant_mode: 'import',
    pair_vote_mode: 'any',
    game_type: 'smash_marry_kill',
    theme: 'default',
    participant_filter: 'all' as 'all' | 'joined',
  })
  const [participants, setParticipants] = useState<ParticipantInput[]>([])
  const [nameInput, setNameInput] = useState('')
  const [defaultGender, setDefaultGender] = useState<ParticipantGender>('female')
  const [loading, setLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [result, setResult] = useState<{ gameCode: string; hostToken: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const questionsFileRef = useRef<HTMLInputElement>(null)
  const [bulkPaste, setBulkPaste] = useState('')
  const [questionSource, setQuestionSource] = useState<QuestionSource>('platform')
  const [questionTab, setQuestionTab] = useState<QuestionTab>('upload')
  const [customWyrQuestions, setCustomWyrQuestions] = useState<WyrQuestion[]>([])
  const [customMltQuestions, setCustomMltQuestions] = useState<string[]>([])
  const [questionsUploadError, setQuestionsUploadError] = useState<string | null>(null)
  const [wyrOptionA, setWyrOptionA] = useState('')
  const [wyrOptionB, setWyrOptionB] = useState('')
  const [mltQuestionInput, setMltQuestionInput] = useState('')
  const [questionsBulkPaste, setQuestionsBulkPaste] = useState('')
  const [wstQuoteSource, setWstQuoteSource] = useState<WstQuoteSource>('player')
  const [customSlots, setCustomSlots] = useState<CustomSlotsConfig | null>(null)

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam) {
      const type = parseGameType(typeParam)
      setSettings((prev) => ({
        ...prev,
        game_type: type,
        ...(isLobbyGame(type) ? { participant_mode: 'joiners', anonymous: true } : {}),
        ...(isWhoSaidThis(type) || isHotSeat(type)
          ? {
              participant_mode: 'import' as const,
              anonymous: true,
              participant_filter: 'joined' as const,
              ...(isHotSeat(type) ? { rounds_count: HOT_SEAT_MIN_PLAYERS } : {}),
            }
          : {}),
      }))
    }
  }, [searchParams])

  const genderCounts = countByGender(participants)
  const isJoinersMode = settings.participant_mode === 'joiners'
  const isWyr = isWouldYouRather(settings.game_type)
  const isMlt = isMostLikelyTo(settings.game_type)
  const isWst = isWhoSaidThis(settings.game_type)
  const isHotSeatGame = isHotSeat(settings.game_type)
  const hotSeatCreateCapUpper = isHotSeatGame ? hotSeatMaxCapUpperBound(0, participants.length) : 20
  const isPair = isPairGame(settings.game_type)
  const needsGender = participantsNeedGender(settings.game_type)
  const minPool = roundPoolSize(settings.game_type)
  const canCreateImport = participants.length >= minPool && hasEnoughForRounds(participants, settings.game_type)
  const canCreateJoiners = !!settings.title.trim()
  const isLobbyQuestions = isWyr || isMlt
  const customQuestionCount = isWyr ? customWyrQuestions.length : customMltQuestions.length
  const questionCap =
    questionSource === 'custom' && customQuestionCount > 0
      ? customQuestionCount
      : isWyr
        ? WYR_QUESTION_COUNT
        : isMlt
          ? MLT_QUESTION_COUNT
          : 10
  const mltRoundOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= questionCap)
  const wyrRoundOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= questionCap)
  const wstRoundOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= Math.max(participants.length, 2))
  const roundOptions = isWyr
    ? wyrRoundOptions
    : isMlt
      ? mltRoundOptions
      : isWst
        ? wstRoundOptions
        : [2, 3, 4, 5, 6, 8, 10]
  const hasEnoughCustomQuestions =
    questionSource === 'platform' ||
    (isLobbyQuestions && customQuestionCount >= settings.rounds_count && customQuestionCount > 0)
  const canCreateQuickLobby = !!settings.title.trim() && hasEnoughCustomQuestions

  const isCustom = isCustomGame(settings.game_type)
  const customSlotsValid =
    !isCustom || (customSlots && customSlots.slots.length >= 2 && customSlots.slots.every((s) => s.label.trim()))

  const needsParticipantStep = !isWyr && !(isMlt && isJoinersMode) && !isJoinersMode
  const wizardSteps = needsParticipantStep ? ['Setup', 'People'] : ['Setup']
  const stepIndex = step === 'participants' ? 2 : 1

  useEffect(() => {
    if (questionSource === 'custom' && customQuestionCount > 0 && settings.rounds_count > customQuestionCount) {
      setSettings((prev) => ({ ...prev, rounds_count: customQuestionCount }))
    }
  }, [customQuestionCount, questionSource, settings.rounds_count])

  const selectGameType = (type: GameType) => {
    setCustomSlots(null)
    setWstQuoteSource('player')
    setQuestionSource('platform')
    setCustomWyrQuestions([])
    setCustomMltQuestions([])
    setQuestionsUploadError(null)
    setSettings({
      ...settings,
      game_type: type,
      ...(isLobbyGame(type) ? { participant_mode: 'joiners', anonymous: true } : {}),
      ...(isWhoSaidThis(type) || isHotSeat(type)
        ? {
            participant_mode: 'import' as const,
            anonymous: true,
            participant_filter: 'joined' as const,
            ...(isHotSeat(type) ? { rounds_count: HOT_SEAT_MIN_PLAYERS } : {}),
          }
        : {}),
      ...(isCustomGame(type) ? { participant_mode: 'import' as const } : {}),
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
    const rows = parseParticipantsForGame(bulkPaste, settings.game_type)
    if (rows.length === 0) {
      setUploadError(needsGender ? 'Use two columns: name and gender (e.g. Sarah,female)' : 'Add one name per line')
      return
    }
    addParticipantsFromRows(rows)
    setBulkPaste('')
  }

  const handleNamePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/[\n\r\t,;]/.test(text)) return
    e.preventDefault()
    const rows = parseParticipantsForGame(text, settings.game_type)
    if (rows.length > 0) {
      addParticipantsFromRows(rows)
      setNameInput('')
    } else if (needsGender) {
      const names = text
        .split(/[\n\r\t,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
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
        const rows = parseParticipantsForGame(text, settings.game_type)
        if (rows.length === 0) {
          setUploadError(
            needsGender
              ? 'No valid rows found. First column: name. Second column: gender (male/female).'
              : 'No valid rows found. Add one name per line.'
          )
          return
        }
        addParticipantsFromRows(rows)
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const rows = await parseExcelParticipants(buffer, settings.game_type)
        if (rows.length === 0) {
          setUploadError(
            needsGender
              ? 'No valid rows found. First column: name. Second column: gender (male/female).'
              : 'No valid rows found. Add one name per line.'
          )
          return
        }
        addParticipantsFromRows(rows)
        return
      }

      setUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setUploadError(
        needsGender
          ? 'Could not read that file. Try the sample CSV (name + gender).'
          : 'Could not read that file. Try the sample CSV (names only).'
      )
    }
  }

  const removeParticipant = (i: number) => setParticipants((prev) => prev.filter((_, idx) => idx !== i))

  const addCustomQuestionsFromRows = (wyrRows: WyrQuestion[], mltRows: string[]) => {
    if (isWyr && wyrRows.length > 0) {
      setCustomWyrQuestions((prev) => mergeWyrQuestions(prev, wyrRows))
    }
    if (isMlt && mltRows.length > 0) {
      setCustomMltQuestions((prev) => mergeMltQuestions(prev, mltRows))
    }
  }

  const addManualQuestion = () => {
    setQuestionsUploadError(null)
    if (isWyr) {
      const optionA = wyrOptionA.trim()
      const optionB = wyrOptionB.trim()
      if (!optionA || !optionB) return
      addCustomQuestionsFromRows([{ optionA, optionB }], [])
      setWyrOptionA('')
      setWyrOptionB('')
      return
    }
    if (isMlt) {
      const question = mltQuestionInput.trim()
      if (!question) return
      addCustomQuestionsFromRows([], [question])
      setMltQuestionInput('')
    }
  }

  const addBulkQuestions = () => {
    if (!questionsBulkPaste.trim()) return
    setQuestionsUploadError(null)
    if (isWyr) {
      const rows = parseWyrQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('Use two columns: option_a and option_b')
        return
      }
      addCustomQuestionsFromRows(rows, [])
    } else if (isMlt) {
      const rows = parseMltQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('Add one question per line')
        return
      }
      addCustomQuestionsFromRows([], rows)
    }
    setQuestionsBulkPaste('')
  }

  const handleQuestionsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setQuestionsUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      if (ext === 'csv') {
        const text = await file.text()
        if (isWyr) {
          const rows = parseWyrQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use option_a and option_b columns.')
            return
          }
          addCustomQuestionsFromRows(rows, [])
        } else if (isMlt) {
          const rows = parseMltQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one question per line.')
            return
          }
          addCustomQuestionsFromRows([], rows)
        }
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        if (isWyr) {
          const rows = await parseExcelWyrQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use option_a and option_b columns.')
            return
          }
          addCustomQuestionsFromRows(rows, [])
        } else if (isMlt) {
          const rows = await parseExcelMltQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one question per line.')
            return
          }
          addCustomQuestionsFromRows([], rows)
        }
        return
      }

      setQuestionsUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setQuestionsUploadError('Could not read that file. Try the sample CSV.')
    }
  }

  const removeCustomQuestion = (index: number) => {
    if (isWyr) setCustomWyrQuestions((prev) => prev.filter((_, i) => i !== index))
    if (isMlt) setCustomMltQuestions((prev) => prev.filter((_, i) => i !== index))
  }

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
          rounds_count: isWst ? Math.max(participants.length, 2) : settings.rounds_count,
          question_source: isLobbyQuestions ? questionSource : 'platform',
          custom_questions:
            isLobbyQuestions && questionSource === 'custom' ? (isWyr ? customWyrQuestions : customMltQuestions) : null,
          participants: isJoinersMode ? [] : participants,
          wst_quote_source: isWst ? wstQuoteSource : undefined,
          custom_slots: isCustom ? customSlots : null,
        }),
      })
      const data = await res.json()
      if (data.gameCode) {
        setResult(data)
        setStep('done')
      } else {
        toast.error(data.error || 'Failed to create game')
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

          {needsParticipantStep && <StepIndicator steps={wizardSteps} current={stepIndex} />}

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
              <GameTypeCard type={settings.game_type} compact selected onClick={() => setShowGameTypes(true)} />
            </Field>
          </div>

          {/* Theme */}
          <div className="glass-card p-5 space-y-3">
            <p className="label-caps">Theme</p>
            <div className="flex gap-2 flex-wrap">
              {THEMES.map((t) => (
                <ThemePreviewCard
                  key={t.id}
                  theme={t}
                  selected={settings.theme === t.id}
                  onClick={() => setSettings({ ...settings, theme: t.id })}
                />
              ))}
            </div>
          </div>

          {/* Rules */}
          <div className="glass-card p-5 space-y-5">
            <SettingsGroup title="Round settings">
              {isWst ? (
                <div className="space-y-4">
                  <Field label="Quote source">
                    <SegmentedControl
                      value={wstQuoteSource}
                      onChange={(v) => setWstQuoteSource(v)}
                      options={[
                        {
                          value: 'player' as WstQuoteSource,
                          label: 'Player Quotes',
                          hint: 'Players submit quotes in the lobby',
                        },
                        {
                          value: 'anime' as WstQuoteSource,
                          label: 'Anime Quotes',
                          hint: 'Quotes from anime characters',
                        },
                        { value: 'both' as WstQuoteSource, label: 'Both', hint: 'Mix player + anime quotes' },
                      ]}
                    />
                  </Field>
                  <p className="text-faint text-sm leading-relaxed">
                    {wstQuoteSource === 'anime'
                      ? 'Anime quotes are fetched in the lobby — no player submissions needed.'
                      : wstQuoteSource === 'both'
                        ? 'Players submit quotes and anime quotes are fetched — both are shuffled together.'
                        : 'Rounds are automatic — one turn per player who joins and claims their name. The count updates in the host lobby as people join.'}
                  </p>
                </div>
              ) : isHotSeatGame ? (
                <Field label="Max rounds">
                  <p className="text-faint text-xs mb-2">
                    One hot seat turn per player who joins and claims a name. The actual round count is set
                    automatically in the lobby — enter the max cap ({HOT_SEAT_MIN_PLAYERS}–{hotSeatCreateCapUpper}).
                  </p>
                  <input
                    type="number"
                    min={HOT_SEAT_MIN_PLAYERS}
                    max={hotSeatCreateCapUpper}
                    step={1}
                    value={settings.rounds_count}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10)
                      if (!Number.isNaN(n)) {
                        setSettings((prev) => ({ ...prev, rounds_count: n }))
                      }
                    }}
                    onBlur={(e) => {
                      setSettings((prev) => ({
                        ...prev,
                        rounds_count: clampHotSeatMaxCap(e.target.value, hotSeatCreateCapUpper),
                      }))
                    }}
                    className="input-field w-28"
                  />
                </Field>
              ) : (
                <Field label="Rounds">
                  {isLobbyQuestions && questionSource === 'custom' && customQuestionCount === 0 && (
                    <p className="text-faint text-xs mb-2">
                      Upload questions below to set how many rounds you can play.
                    </p>
                  )}
                  {isLobbyQuestions && questionSource === 'custom' && customQuestionCount > 0 && (
                    <p className="text-faint text-xs mb-2">
                      {customQuestionCount} custom questions loaded — up to {customQuestionCount} rounds.
                    </p>
                  )}
                  <ChipGrid>
                    {roundOptions.map((n) => (
                      <Chip
                        key={n}
                        active={settings.rounds_count === n}
                        onClick={() => setSettings((prev) => ({ ...prev, rounds_count: n }))}
                        className="!px-0 w-full"
                      >
                        {n}
                      </Chip>
                    ))}
                  </ChipGrid>
                </Field>
              )}

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

              {isCustom && <CustomSlotBuilder value={customSlots} onChange={setCustomSlots} />}

              {isPair && (
                <Field label="Pair voting">
                  <SegmentedControl
                    value={settings.pair_vote_mode}
                    onChange={(v) => setSettings({ ...settings, pair_vote_mode: v })}
                    options={pairVoteModeOptions(settings.game_type)}
                  />
                </Field>
              )}
            </SettingsGroup>

            {isLobbyQuestions && (
              <SettingsGroup title="Questions">
                <SegmentedControl
                  value={questionSource}
                  onChange={(v) => {
                    setQuestionSource(v)
                    if (v === 'platform') {
                      setCustomWyrQuestions([])
                      setCustomMltQuestions([])
                      setQuestionsUploadError(null)
                    }
                  }}
                  options={questionSourceOptions(settings.game_type)}
                />

                {questionSource === 'custom' && (
                  <div className="space-y-4 pt-1">
                    <SegmentedControl
                      value={questionTab}
                      onChange={setQuestionTab}
                      options={[
                        {
                          value: 'upload',
                          label: 'Upload file',
                          hint: questionUploadHint(settings.game_type),
                        },
                        {
                          value: 'manual',
                          label: 'Add manually',
                          hint: isWyr ? 'Type or paste option pairs.' : 'Type or paste one question per line.',
                        },
                      ]}
                    />

                    {questionTab === 'upload' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => questionsFileRef.current?.click()}
                            className="btn-secondary !py-3"
                          >
                            Choose file
                          </button>
                          <a
                            href={questionSampleFile(settings.game_type).href}
                            download={questionSampleFile(settings.game_type).download}
                            className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                          >
                            Sample CSV
                          </a>
                        </div>
                        <input
                          ref={questionsFileRef}
                          type="file"
                          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="hidden"
                          onChange={handleQuestionsFileUpload}
                        />
                        <p className="text-faint text-xs text-center">{questionUploadHint(settings.game_type)}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {isWyr ? (
                          <div className="space-y-2">
                            <input
                              value={wyrOptionA}
                              onChange={(e) => setWyrOptionA(e.target.value)}
                              placeholder="Option A"
                              className="input-field py-2.5 text-sm"
                            />
                            <input
                              value={wyrOptionB}
                              onChange={(e) => setWyrOptionB(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addManualQuestion()}
                              placeholder="Option B"
                              className="input-field py-2.5 text-sm"
                            />
                          </div>
                        ) : (
                          <input
                            value={mltQuestionInput}
                            onChange={(e) => setMltQuestionInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addManualQuestion()}
                            placeholder="Who is most likely to…"
                            className="input-field py-2.5 text-sm"
                          />
                        )}
                        <button
                          type="button"
                          onClick={addManualQuestion}
                          className="btn-secondary w-full text-sm py-2.5"
                        >
                          Add question
                        </button>
                        <textarea
                          value={questionsBulkPaste}
                          onChange={(e) => setQuestionsBulkPaste(e.target.value)}
                          placeholder={
                            isWyr
                              ? 'Paste from Excel:\nNever have pizza,Never have tacos\nLive without music,Live without movies'
                              : 'Paste questions:\nWho is most likely to become famous?\nWho is most likely to win a dance-off?'
                          }
                          rows={4}
                          className="input-field resize-none font-medium text-sm"
                        />
                        {questionsBulkPaste.trim() && (
                          <button
                            type="button"
                            onClick={addBulkQuestions}
                            className="btn-secondary w-full text-sm py-2.5"
                          >
                            Import pasted list
                          </button>
                        )}
                      </div>
                    )}

                    {questionsUploadError && <p className="text-red-400 text-sm">{questionsUploadError}</p>}

                    {customQuestionCount > 0 && (
                      <div className="surface-inset border border-theme rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
                        <p className="text-muted text-xs uppercase tracking-wider">Loaded ({customQuestionCount})</p>
                        {isWyr
                          ? customWyrQuestions.map((q, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <p className="text-body flex-1 min-w-0">
                                  <span className="text-violet-300">A:</span> {q.optionA}
                                  <span className="text-faint mx-1">·</span>
                                  <span className="text-sky-300">B:</span> {q.optionB}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => removeCustomQuestion(i)}
                                  className="text-faint hover:text-red-300 text-xs shrink-0"
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          : customMltQuestions.map((q, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <p className="text-body flex-1 min-w-0">{q}</p>
                                <button
                                  type="button"
                                  onClick={() => removeCustomQuestion(i)}
                                  className="text-faint hover:text-red-300 text-xs shrink-0"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                      </div>
                    )}

                    {questionSource === 'custom' &&
                      customQuestionCount > 0 &&
                      customQuestionCount < settings.rounds_count && (
                        <p className="text-amber-200/90 text-xs">
                          Need at least {settings.rounds_count} questions for {settings.rounds_count} rounds.
                        </p>
                      )}
                  </div>
                )}
              </SettingsGroup>
            )}

            <SettingsGroup title="How it works">
              <p className="text-faint text-sm leading-relaxed">
                {gameHowItWorks(settings.game_type, settings.participant_mode)}
              </p>
            </SettingsGroup>

            {!isWyr && !isWst && !isHotSeatGame && (
              <SettingsGroup title="Who's in the poll">
                <SegmentedControl
                  value={settings.participant_mode}
                  onChange={(mode) => setSettings({ ...settings, participant_mode: mode })}
                  options={participantModeOptions(settings.game_type)}
                />
              </SettingsGroup>
            )}

            {settings.participant_mode === 'import' && !isWyr && !isWst && !isHotSeatGame && (
              <SettingsGroup title="Who appears in rounds">
                <SegmentedControl
                  value={settings.participant_filter}
                  onChange={(v) => setSettings({ ...settings, participant_filter: v })}
                  options={[
                    { value: 'all', label: 'Everyone on the list' },
                    { value: 'joined', label: 'Only people who join' },
                  ]}
                />
              </SettingsGroup>
            )}

            <SettingsGroup title="Advanced" description="Timer behavior & privacy" collapsible defaultOpen={false}>
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
                    Would You Rather, Most Likely To, and Who Said This are always anonymous.
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
              <PrimaryBtn onClick={createGame} disabled={!canCreateQuickLobby || loading || !customSlotsValid}>
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : isJoinersMode ? (
              <PrimaryBtn onClick={createGame} disabled={!canCreateJoiners || loading || !customSlotsValid}>
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : (
              <PrimaryBtn
                onClick={() => setStep('participants')}
                disabled={!settings.title.trim() || !customSlotsValid}
              >
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
    const sampleFile = participantSampleFile(settings.game_type)
    return (
      <PageShell>
        <BackBtn onClick={() => setStep('settings')} />
        <StepIndicator steps={wizardSteps} current={stepIndex} />

        <div>
          <p className="label-caps mb-1">Step 2</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title-subtle">Add People</h1>
          <p className="text-muted text-sm mt-1.5">{participantImportStepHint(settings.game_type)}</p>
        </div>

        <div className="glass-card p-5 space-y-4">
          <SegmentedControl
            value={participantTab}
            onChange={setParticipantTab}
            options={[
              {
                value: 'upload',
                label: 'Upload file',
                hint: needsGender
                  ? 'CSV or Excel with name and gender columns.'
                  : 'CSV or Excel with one name per row.',
              },
              {
                value: 'manual',
                label: 'Add manually',
                hint: needsGender
                  ? 'Type names one at a time or paste a list with genders.'
                  : 'Type names one at a time or paste a list.',
              },
            ]}
          />

          {participantTab === 'upload' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !py-3">
                  Choose file
                </button>
                <a
                  href={sampleFile.href}
                  download={sampleFile.download}
                  className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                >
                  Sample CSV
                </a>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFileUpload}
              />
              <p className="text-faint text-xs text-center">{participantUploadHint(settings.game_type)}</p>
              {uploadError && <p className="text-red-400 text-sm">{uploadError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {needsGender && (
                <Field label="Default gender">
                  <SegmentedControl
                    value={defaultGender}
                    onChange={setDefaultGender}
                    options={[
                      { value: 'female', label: 'Female' },
                      { value: 'male', label: 'Male' },
                    ]}
                  />
                </Field>
              )}

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
                placeholder={
                  needsGender ? 'Paste from Excel:\nSarah,female\nJames,male' : 'Paste names:\nSarah\nJames\nAlex'
                }
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
                {needsGender && (
                  <p className="text-faint text-xs">
                    {genderCounts.female}F · {genderCounts.male}M
                  </p>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {participants.map((p, i) => (
                  <div
                    key={`${p.name}-${p.gender}-${i}`}
                    className="surface-inset flex items-center justify-between px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={p.name} />
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {needsGender && <GenderBadge gender={p.gender} />}
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

          {!needsGender && participants.length < minPool && participants.length > 0 && (
            <p className="text-faint text-sm text-center">
              Add {minPool - participants.length} more name{minPool - participants.length === 1 ? '' : 's'} to continue
            </p>
          )}
          {needsGender &&
            !isMlt &&
            !hasEnoughForRounds(participants, settings.game_type) &&
            participants.length > 0 && (
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
        <h1 className="text-3xl font-black tracking-tight gradient-title-subtle">You're live!</h1>
        <p className="text-muted text-sm">Share the code with players — save your host link.</p>
      </div>

      <div className="glass-card-strong p-6 text-center space-y-2">
        <span className="label-caps">Game code</span>
        <p className="font-mono text-5xl font-black tracking-[0.2em]">{result?.gameCode}</p>
        <CopyLinkButton
          value={result?.gameCode ?? ''}
          label="Copy code"
          copiedLabel="Copied ✓"
          successMessage="Game code copied"
        />
      </div>

      <CopyCard label="Player link" value={gameUrl} />
      <CopyCard label="Host link — save this" value={hostUrl} accent />

      <PrimaryBtn onClick={() => router.push(`/host/${result?.gameCode}?token=${result?.hostToken}`)}>
        Open Host Panel →
      </PrimaryBtn>

      <p className="text-faint text-xs text-center">The host link won't be shown again</p>
    </PageShell>
  )
}

export default function CreateGame() {
  return (
    <Suspense
      fallback={
        <PageShell centered>
          <div className="text-center text-muted">Loading...</div>
        </PageShell>
      }
    >
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
  return <div className="avatar w-7 h-7 text-xs shrink-0">{name.charAt(0).toUpperCase()}</div>
}

function ThemePreviewCard({
  theme,
  selected,
  onClick,
}: {
  theme: ThemeConfig
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 transition-all ${
        selected
          ? 'border-[var(--primary)] shadow-[0_0_0_1px_var(--primary)]'
          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
      }`}
      style={{ minWidth: '4.5rem' }}
    >
      <div className="flex gap-1">
        <span className="block w-4 h-4 rounded-full border border-black/10" style={{ background: theme.preview.bg }} />
        <span
          className="block w-4 h-4 rounded-full border border-black/10"
          style={{ background: theme.preview.accent }}
        />
        <span
          className="block w-4 h-4 rounded-full border border-black/10"
          style={{ background: theme.preview.text }}
        />
      </div>
      <span className="text-xs font-medium text-body">
        {theme.emoji} {theme.label}
      </span>
    </button>
  )
}

function CopyCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`glass-card p-4 space-y-2 ${accent ? 'border-[var(--primary)]/35' : ''}`}>
      <p className={`label-caps ${accent ? 'text-[var(--primary)]' : ''}`}>{label}</p>
      <p className="font-mono text-xs break-all text-muted">{value}</p>
      <CopyLinkButton value={value} successMessage={accent ? 'Host link copied' : 'Player link copied'} />
    </div>
  )
}
