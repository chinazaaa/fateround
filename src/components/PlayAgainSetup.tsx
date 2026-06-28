'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Game, Participant, ParticipantGender } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/PageShell'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import { Avatar } from '@/components/Avatar'
import {
  parseParticipantsForGame,
  parseExcelParticipants,
  participantSampleFile,
  participantUploadHint,
  participantsNeedGenderForGame,
  type ParticipantInput,
} from '@/lib/participants'
import {
  parseWyrQuestionRows,
  parseThisOrThatQuestionRows,
  parseMltQuestionRows,
  parseExcelWyrQuestions,
  parseExcelThisOrThatQuestions,
  parseExcelMltQuestions,
  parseCodewordsWordRows,
  parseExcelCodewordsWords,
  mergeWyrQuestions,
  mergeMltQuestions,
  mergeCodewordsWords,
  questionSampleFile,
  questionUploadHint,
  parseQuestionSource,
  parseStoredWyrQuestions,
  parseStoredMltQuestions,
  parseStoredCodewordsWords,
  parseOrSplitQuestion,
  CODEWORDS_MIN_CUSTOM_POOL,
} from '@/lib/custom-questions'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isThisOrThat,
  isWouldYouRather,
  parseGameType,
  isAnonymousMessagesGame,
  isCodewordsGame,
} from '@/lib/game-types'
import { supportsHostListPlayAgain, hostListPlayAgainHint } from '@/lib/participant-mode'
import { isGameGenderBased } from '@/lib/gender-based'

export type PlayAgainPayload = {
  custom_questions?: WyrQuestion[] | string[]
  participants?: ParticipantInput[]
}

type PoolTab = 'upload' | 'manual'
type PoolMode = 'same' | 'change'
export type PoolSetupVariant = 'play-again' | 'lobby'

interface PlayAgainSetupProps {
  open: boolean
  onClose: () => void
  game: Game
  participants: Participant[]
  onConfirm: (payload: PlayAgainPayload) => void | Promise<void>
  loading?: boolean
  variant?: PoolSetupVariant
  /** When set, pre-selects the questions/words tab on open (lobby edits default to change). */
  defaultQuestionMode?: PoolMode
}

function hostParticipants(participants: Participant[]): ParticipantInput[] {
  return participants
    .filter((p) => !p.submitted_by_player_id)
    .map((p) => ({ name: p.name, gender: (p.gender as ParticipantGender) ?? 'female' }))
}

export function playAgainNeedsSetup(game: Game): boolean {
  return hostPoolSetupAvailable(game)
}

export function hostPoolSetupAvailable(game: Game): boolean {
  const type = parseGameType(game.game_type)
  if (
    isAnonymousMessagesGame(type) ||
    type === 'secret_message' ||
    type === 'bingo' ||
    type === 'monopoly' ||
    type === 'yahtzee' ||
    type === 'whot' ||
    type === 'crazy_eights' ||
    type === 'ludo'
  )
    return false
  return hasQuestionPool(game) || hasParticipantPool(game)
}

export function hostPoolSetupLabels(game: Game): { title: string; hasQuestions: boolean; hasParticipants: boolean } {
  const hasQuestions = hasQuestionPool(game)
  const hasParticipants = hasParticipantPool(game)
  const isCodewords = isCodewordsGame(game.game_type)
  const title =
    hasQuestions && hasParticipants
      ? isCodewords
        ? 'Words & name list'
        : 'Questions & name list'
      : hasQuestions
        ? isCodewords
          ? 'Word list'
          : 'Questions'
        : 'Name list'
  return { title, hasQuestions, hasParticipants }
}

function hasQuestionPool(game: Game): boolean {
  const type = parseGameType(game.game_type)
  if (isCodewordsGame(type) && parseQuestionSource(game.question_source, type) === 'custom') return true
  if (isThisOrThat(type)) return true
  if (isWouldYouRather(type) && parseQuestionSource(game.question_source, type) === 'custom') return true
  if (isNeverHaveIEver(type) && parseQuestionSource(game.question_source, type) === 'custom') return true
  if (isMostLikelyTo(type) && parseQuestionSource(game.question_source, type) === 'custom') return true
  return false
}

function hasParticipantPool(game: Game): boolean {
  return supportsHostListPlayAgain(game)
}

export function PlayAgainSetup({
  open,
  onClose,
  game,
  participants,
  onConfirm,
  loading,
  variant = 'play-again',
  defaultQuestionMode,
}: PlayAgainSetupProps) {
  const gameType = parseGameType(game.game_type)
  const showQuestions = hasQuestionPool(game)
  const showParticipants = hasParticipantPool(game)
  const isTot = isThisOrThat(gameType)
  const isWyr = isWouldYouRather(gameType)
  const isNhie = isNeverHaveIEver(gameType)
  const isMlt = isMostLikelyTo(gameType)
  const isCodewords = isCodewordsGame(gameType)
  const isBinaryLobby = isBinaryChoiceGame(gameType)
  const needsGender = participantsNeedGenderForGame(gameType, { game, genderBased: isGameGenderBased(game) })
  const participantOpts = { game, genderBased: isGameGenderBased(game) }

  const [questionMode, setQuestionMode] = useState<PoolMode>('same')
  const [participantMode, setParticipantMode] = useState<PoolMode>('same')
  const [questionTab, setQuestionTab] = useState<PoolTab>('upload')
  const [participantTab, setParticipantTab] = useState<PoolTab>('upload')

  const [customWyrQuestions, setCustomWyrQuestions] = useState<WyrQuestion[]>([])
  const [customMltQuestions, setCustomMltQuestions] = useState<string[]>([])
  const [customCodewordsWords, setCustomCodewordsWords] = useState<string[]>([])
  const [draftParticipants, setDraftParticipants] = useState<ParticipantInput[]>([])

  const [questionsUploadError, setQuestionsUploadError] = useState<string | null>(null)
  const [participantUploadError, setParticipantUploadError] = useState<string | null>(null)
  const [wyrOptionA, setWyrOptionA] = useState('')
  const [wyrOptionB, setWyrOptionB] = useState('')
  const [mltQuestionInput, setMltQuestionInput] = useState('')
  const [questionsBulkPaste, setQuestionsBulkPaste] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [defaultGender, setDefaultGender] = useState<ParticipantGender>('female')
  const [bulkPaste, setBulkPaste] = useState('')

  const questionsFileRef = useRef<HTMLInputElement>(null)
  const participantFileRef = useRef<HTMLInputElement>(null)
  const draftInitializedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      draftInitializedRef.current = false
      return
    }
    if (draftInitializedRef.current) return
    draftInitializedRef.current = true

    setQuestionMode(defaultQuestionMode ?? (variant === 'lobby' ? 'change' : 'same'))
    setParticipantMode('same')
    setQuestionsUploadError(null)
    setParticipantUploadError(null)
    setCustomWyrQuestions(parseStoredWyrQuestions(game.custom_questions))
    setCustomMltQuestions(parseStoredMltQuestions(game.custom_questions))
    setCustomCodewordsWords(parseStoredCodewordsWords(game.custom_questions))
    setDraftParticipants(hostParticipants(participants))
  }, [open, game.custom_questions, participants, variant, defaultQuestionMode])

  const customQuestionCount = isCodewords
    ? customCodewordsWords.length
    : isBinaryLobby
      ? customWyrQuestions.length
      : customMltQuestions.length

  const unusedHint = useMemo(() => {
    const hints: string[] = []
    if (showQuestions) {
      hints.push(
        isCodewords
          ? 'Words that did not appear on the last board are picked first for the next round.'
          : 'Uploaded questions that did not appear last game are picked first.'
      )
    }
    if (showParticipants) hints.push(hostListPlayAgainHint(game))
    if (hints.length === 0) return null
    return hints.join(' ')
  }, [showQuestions, showParticipants, game, isCodewords])

  const addCustomQuestionsFromRows = (
    wyrRows: WyrQuestion[],
    mltRows: string[],
    codewordsRows: string[] = [],
    replace = false
  ) => {
    if (wyrRows.length > 0) {
      setCustomWyrQuestions(replace ? wyrRows : (prev) => mergeWyrQuestions(prev, wyrRows))
    }
    if (mltRows.length > 0) {
      setCustomMltQuestions(replace ? mltRows : (prev) => mergeMltQuestions(prev, mltRows))
    }
    if (codewordsRows.length > 0) {
      setCustomCodewordsWords(replace ? codewordsRows : (prev) => mergeCodewordsWords(prev, codewordsRows))
    }
  }

  const clearAllQuestions = () => {
    setCustomWyrQuestions([])
    setCustomMltQuestions([])
    setCustomCodewordsWords([])
    setQuestionsUploadError(null)
  }

  const handleQuestionsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setQuestionsUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    const replace = questionMode === 'change'

    try {
      if (ext === 'csv') {
        const text = await file.text()
        if (isWyr) {
          const rows = parseWyrQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use option_a and option_b columns.')
            return
          }
          addCustomQuestionsFromRows(rows, [], [], replace)
        } else if (isTot) {
          const rows = parseThisOrThatQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use one question per line (e.g. Coffee or Tea?).')
            return
          }
          addCustomQuestionsFromRows(rows, [], [], replace)
        } else if (isMlt || isNhie) {
          const rows = parseMltQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one question per line.')
            return
          }
          addCustomQuestionsFromRows([], rows, [], replace)
        } else if (isCodewords) {
          const rows = parseCodewordsWordRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one single word per line.')
            return
          }
          setCustomCodewordsWords(rows)
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
          addCustomQuestionsFromRows(rows, [], [], replace)
        } else if (isTot) {
          const rows = await parseExcelThisOrThatQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use one question per line (e.g. Coffee or Tea?).')
            return
          }
          addCustomQuestionsFromRows(rows, [], [], replace)
        } else if (isMlt || isNhie) {
          const rows = await parseExcelMltQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one question per line.')
            return
          }
          addCustomQuestionsFromRows([], rows, [], replace)
        } else if (isCodewords) {
          const rows = await parseExcelCodewordsWords(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one single word per line.')
            return
          }
          setCustomCodewordsWords(rows)
        }
        return
      }

      setQuestionsUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setQuestionsUploadError('Could not read that file. Try the sample CSV.')
    }
  }

  const addManualQuestion = () => {
    if (isBinaryLobby) {
      const a = wyrOptionA.trim()
      const b = wyrOptionB.trim()
      if (!a || !b) return
      addCustomQuestionsFromRows([{ optionA: a, optionB: b }], [])
      setWyrOptionA('')
      setWyrOptionB('')
      return
    }
    const q = mltQuestionInput.trim()
    if (!q) return
    if (isCodewords) {
      const rows = parseCodewordsWordRows(q)
      if (rows.length === 0) {
        setQuestionsUploadError('Use a single word with no spaces.')
        return
      }
      setCustomCodewordsWords((prev) => mergeCodewordsWords(prev, rows))
      setMltQuestionInput('')
      return
    }
    if (isTot) {
      const parsed = parseOrSplitQuestion(q)
      if (!parsed) {
        setQuestionsUploadError('Use “Coffee or Tea?” style, or two columns for A and B.')
        return
      }
      addCustomQuestionsFromRows([parsed], [])
    } else {
      addCustomQuestionsFromRows([], [q])
    }
    setMltQuestionInput('')
  }

  const addBulkQuestions = () => {
    if (!questionsBulkPaste.trim()) return
    const replace = questionMode === 'change'
    if (isBinaryLobby) {
      const rows = parseWyrQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('No valid rows found.')
        return
      }
      addCustomQuestionsFromRows(rows, [], [], replace)
    } else if (isTot) {
      const rows = parseThisOrThatQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('No valid questions found.')
        return
      }
      addCustomQuestionsFromRows(rows, [], [], replace)
    } else if (isCodewords) {
      const rows = parseCodewordsWordRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('No valid words found.')
        return
      }
      setCustomCodewordsWords(questionMode === 'change' ? rows : (prev) => mergeCodewordsWords(prev, rows))
    } else {
      const rows = parseMltQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('No valid questions found.')
        return
      }
      addCustomQuestionsFromRows([], rows, [], replace)
    }
    setQuestionsBulkPaste('')
  }

  const addParticipantsFromRows = (rows: ParticipantInput[]) => {
    setDraftParticipants((prev) => {
      const seen = new Set(prev.map((p) => p.name.toLowerCase()))
      const next = [...prev]
      for (const row of rows) {
        const key = row.name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        next.push(row)
      }
      return next
    })
  }

  const handleParticipantFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setParticipantUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      if (ext === 'csv') {
        const text = await file.text()
        const rows = parseParticipantsForGame(text, gameType, participantOpts)
        if (rows.length === 0) {
          setParticipantUploadError(
            needsGender
              ? 'No valid rows found. First column: name. Second column: gender (male/female).'
              : 'No valid rows found. Add one name per line.'
          )
          return
        }
        if (participantMode === 'change') setDraftParticipants(rows)
        else addParticipantsFromRows(rows)
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const rows = await parseExcelParticipants(buffer, gameType, participantOpts)
        if (rows.length === 0) {
          setParticipantUploadError(
            needsGender
              ? 'No valid rows found. First column: name. Second column: gender (male/female).'
              : 'No valid rows found. Add one name per line.'
          )
          return
        }
        if (participantMode === 'change') setDraftParticipants(rows)
        else addParticipantsFromRows(rows)
        return
      }

      setParticipantUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setParticipantUploadError('Could not read that file. Try the sample CSV.')
    }
  }

  const addParticipant = () => {
    const name = nameInput.trim()
    if (!name) return
    addParticipantsFromRows([{ name, gender: defaultGender }])
    setNameInput('')
  }

  const addBulkParticipants = () => {
    if (!bulkPaste.trim()) return
    const rows = parseParticipantsForGame(bulkPaste, gameType, participantOpts)
    if (rows.length === 0) {
      setParticipantUploadError(needsGender ? 'Use two columns: name and gender' : 'Add one name per line')
      return
    }
    if (participantMode === 'change') setDraftParticipants(rows)
    else addParticipantsFromRows(rows)
    setBulkPaste('')
  }

  const handleConfirm = () => {
    const payload: PlayAgainPayload = {}

    if (showQuestions && questionMode === 'change') {
      const questions = isCodewords ? customCodewordsWords : isBinaryLobby ? customWyrQuestions : customMltQuestions
      if (questions.length === 0) {
        setQuestionsUploadError(isCodewords ? 'Add at least one word' : 'Add at least one question')
        return
      }
      if (isCodewords && questions.length < CODEWORDS_MIN_CUSTOM_POOL) {
        setQuestionsUploadError(`Need at least ${CODEWORDS_MIN_CUSTOM_POOL} words for a full board`)
        return
      }
      payload.custom_questions = questions
    }

    if (showParticipants && participantMode === 'change') {
      if (draftParticipants.length === 0) {
        setParticipantUploadError('Add at least one name')
        return
      }
      payload.participants = draftParticipants
    }

    void onConfirm(payload)
  }

  const questionSample = questionSampleFile(gameType)
  const participantSample = participantSampleFile(gameType, participantOpts)
  const isLobby = variant === 'lobby'

  const confirmDisabled =
    loading ||
    (isLobby &&
      showQuestions &&
      questionMode === 'change' &&
      (isCodewords
        ? customCodewordsWords.length < CODEWORDS_MIN_CUSTOM_POOL
        : (isBinaryLobby ? customWyrQuestions : customMltQuestions).length === 0))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isLobby ? hostPoolSetupLabels(game).title : 'Play again'}
      subtitle={
        isLobby
          ? 'Keep your current list or upload a new CSV before you start'
          : 'Same room and link — players stay connected'
      }
      size="lg"
    >
      <div className="space-y-6">
        {unusedHint && <p className="text-faint text-sm leading-relaxed">{unusedHint}</p>}

        {showQuestions && (
          <div className="space-y-3">
            <p className="label-caps">{isCodewords ? 'Words' : 'Questions'}</p>
            <SegmentedControl
              value={questionMode}
              onChange={setQuestionMode}
              options={[
                {
                  value: 'same',
                  label: 'Same list',
                  hint: `${customQuestionCount || parseStoredCodewordsWords(game.custom_questions).length || parseStoredWyrQuestions(game.custom_questions).length || parseStoredMltQuestions(game.custom_questions).length} loaded — unused ones first`,
                },
                {
                  value: 'change',
                  label: 'Upload or edit',
                  hint: 'Upload replaces the list — or clear and build a new one',
                },
              ]}
            />

            {questionMode === 'change' && (
              <div className="surface-inset border border-theme rounded-xl p-4 space-y-3">
                <SegmentedControl
                  value={questionTab}
                  onChange={setQuestionTab}
                  options={[
                    { value: 'upload', label: 'Upload file' },
                    { value: 'manual', label: 'Add manually' },
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
                        href={questionSample.href}
                        download={questionSample.download}
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
                    <p className="text-faint text-xs text-center">{questionUploadHint(gameType)}</p>
                    <p className="text-faint text-xs text-center">Uploading a file replaces the current list.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isBinaryLobby ? (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={wyrOptionA}
                          onChange={(e) => setWyrOptionA(e.target.value)}
                          placeholder="Option A"
                          className="input-field py-2.5 text-sm"
                        />
                        <input
                          value={wyrOptionB}
                          onChange={(e) => setWyrOptionB(e.target.value)}
                          placeholder="Option B"
                          className="input-field py-2.5 text-sm"
                        />
                      </div>
                    ) : (
                      <input
                        value={mltQuestionInput}
                        onChange={(e) => setMltQuestionInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addManualQuestion()}
                        placeholder={isCodewords ? 'Ocean' : isTot ? 'Coffee or Tea?' : 'Who is most likely to…'}
                        className="input-field py-2.5 text-sm"
                      />
                    )}
                    <button type="button" onClick={addManualQuestion} className="btn-secondary w-full text-sm py-2.5">
                      {isCodewords ? 'Add word' : 'Add question'}
                    </button>
                    <textarea
                      value={questionsBulkPaste}
                      onChange={(e) => setQuestionsBulkPaste(e.target.value)}
                      placeholder={
                        isWyr
                          ? 'Paste from Excel:\nNever have pizza,Never have tacos'
                          : isTot
                            ? 'Coffee or Tea?\nBeach or Mountains?'
                            : isCodewords
                              ? 'Ocean\nMountain\nCastle'
                              : 'Who is most likely to become famous?'
                      }
                      rows={3}
                      className="input-field resize-none font-medium text-sm"
                    />
                    {questionsBulkPaste.trim() && (
                      <button type="button" onClick={addBulkQuestions} className="btn-secondary w-full text-sm py-2.5">
                        Import pasted list
                      </button>
                    )}
                  </div>
                )}

                {questionsUploadError && <p className="text-red-400 text-sm">{questionsUploadError}</p>}

                {customQuestionCount > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted text-xs uppercase tracking-wider">Loaded ({customQuestionCount})</p>
                      <button
                        type="button"
                        onClick={clearAllQuestions}
                        className="text-faint hover:text-red-300 text-xs shrink-0"
                      >
                        Clear all
                      </button>
                    </div>
                    {isBinaryLobby
                      ? customWyrQuestions.map((q, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <p className="text-body flex-1 min-w-0">
                              {q.optionA} · {q.optionB}
                            </p>
                            <button
                              type="button"
                              onClick={() => setCustomWyrQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                              className="text-faint hover:text-red-300 text-xs shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      : isCodewords
                        ? customCodewordsWords.map((q, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <p className="text-body flex-1 min-w-0">{q}</p>
                              <button
                                type="button"
                                onClick={() => setCustomCodewordsWords((prev) => prev.filter((_, idx) => idx !== i))}
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
                                onClick={() => setCustomMltQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                                className="text-faint hover:text-red-300 text-xs shrink-0"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showParticipants && (
          <div className="space-y-3">
            <p className="label-caps">Name list</p>
            <SegmentedControl
              value={participantMode}
              onChange={setParticipantMode}
              options={[
                {
                  value: 'same',
                  label: 'Same CSV',
                  hint: `${hostParticipants(participants).length} names — unused from last game go first`,
                },
                { value: 'change', label: 'Upload or edit', hint: 'New CSV or add names manually' },
              ]}
            />

            {participantMode === 'change' && (
              <div className="surface-inset border border-theme rounded-xl p-4 space-y-3">
                <SegmentedControl
                  value={participantTab}
                  onChange={setParticipantTab}
                  options={[
                    { value: 'upload', label: 'Upload file' },
                    { value: 'manual', label: 'Add manually' },
                  ]}
                />

                {participantTab === 'upload' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => participantFileRef.current?.click()}
                        className="btn-secondary !py-3"
                      >
                        Choose file
                      </button>
                      <a
                        href={participantSample.href}
                        download={participantSample.download}
                        className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                      >
                        Sample CSV
                      </a>
                    </div>
                    <input
                      ref={participantFileRef}
                      type="file"
                      accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={handleParticipantFileUpload}
                    />
                    <p className="text-faint text-xs text-center">{participantUploadHint(gameType, participantOpts)}</p>
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
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
                        placeholder="Enter name..."
                        className="input-field"
                      />
                      <button type="button" onClick={addParticipant} className="btn-secondary shrink-0 px-5">
                        Add
                      </button>
                    </div>
                    <textarea
                      value={bulkPaste}
                      onChange={(e) => setBulkPaste(e.target.value)}
                      placeholder={needsGender ? 'Sarah,female\nJames,male' : 'Sarah\nJames\nAlex'}
                      rows={3}
                      className="input-field resize-none font-medium"
                    />
                    {bulkPaste.trim() && (
                      <button type="button" onClick={addBulkParticipants} className="btn-secondary w-full">
                        Import pasted list
                      </button>
                    )}
                  </div>
                )}

                {participantUploadError && <p className="text-red-400 text-sm">{participantUploadError}</p>}

                {draftParticipants.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    <p className="text-muted text-xs uppercase tracking-wider">{draftParticipants.length} names</p>
                    {draftParticipants.map((p, i) => (
                      <div key={`${p.name}-${i}`} className="surface-inset flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={p.name} />
                          <span className="text-sm truncate">{p.name}</span>
                          {needsGender && <GenderBadge gender={p.gender} />}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDraftParticipants((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-faint hover:text-red-300 text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={loading} className="btn-secondary flex-1 py-3">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={confirmDisabled} className="btn-primary flex-1 py-3">
            {loading ? (isLobby ? 'Saving…' : 'Resetting…') : isLobby ? 'Save changes' : 'Start lobby'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function GenderBadge({ gender }: { gender: ParticipantGender }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
        gender === 'male' ? 'bg-sky-500/20 text-sky-300' : 'bg-pink-500/20 text-pink-300'
      }`}
    >
      {gender === 'male' ? 'M' : 'F'}
    </span>
  )
}
