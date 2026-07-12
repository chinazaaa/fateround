import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { LibraryPackPicker } from '@/components/create/LibraryPackPicker'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { isWordSearchGame } from '@fateround/shared/game-type-checks'
import { parseListCsv, parsePuzzleCsv, parseTriviaCsv, parseWyrCsv, pickCsvText } from '@/lib/file-import'
import {
  MAX_TRIVIA_CHOICES,
  customContentCopy,
  customContentCount,
  customContentKind,
  customContentMinimum,
  customContentNoun,
  emptyTriviaDraft,
  puzzleRequiresHint,
  supportsCustomContent,
  supportsLibrary,
  type CustomContentState,
  type CustomQuestionSource,
  type PuzzleEntryDraft,
  type TriviaDraft,
  type WyrPairDraft,
} from '@/lib/create-settings/custom-content'

type Props = {
  gameType: GameType
  custom: CustomContentState
  roundsCount: number
  onChange: (patch: Partial<CustomContentState>) => void
}

export function CustomContentPanel({ gameType, custom, roundsCount, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  if (!supportsCustomContent(gameType)) return null

  const kind = customContentKind(gameType)
  const copy = customContentCopy(gameType)
  const noun = customContentNoun(gameType)
  const heading =
    kind === 'puzzle'
      ? gameType === 'crossword'
        ? 'Answers & clues'
        : gameType === 'word_scramble'
          ? 'Words & hints'
          : 'Words'
      : noun === 'words'
        ? 'Words'
        : 'Questions'
  const count = customContentCount(gameType, custom)
  const min = customContentMinimum(gameType, roundsCount)
  const enough = count >= min
  const hasLibrary = supportsLibrary(gameType)

  const options: { value: CustomQuestionSource; label: string; hint: string }[] = [
    { value: 'platform', label: 'Platform', hint: 'Use our built-in pool.' },
    ...(hasLibrary ? [{ value: 'library' as const, label: 'Library', hint: 'Pick a community pack.' }] : []),
    { value: 'custom', label: 'Your own', hint: copy.sourceHint },
  ]

  const onSourceChange = (source: CustomQuestionSource) => {
    // Leaving library clears the picked pack; switching in shows the picker.
    onChange(source === 'library' ? { source } : { source, libraryPackTitle: null })
  }

  const onImportFile = async () => {
    if (importing) return
    setImporting(true)
    setImportError(null)
    try {
      const picked = await pickCsvText()
      if (!picked) return
      if (kind === 'binary') {
        const rows = parseWyrCsv(picked.text)
        if (rows.length === 0) return setImportError('No option_a / option_b rows found')
        const existing = custom.pairs.filter((p) => p.optionA.trim() && p.optionB.trim())
        onChange({ pairs: [...existing, ...rows] })
      } else if (kind === 'trivia') {
        const rows = parseTriviaCsv(picked.text)
        if (rows.length === 0) return setImportError('No question rows found (question, answers, correct)')
        const existing = custom.trivia.filter((t) => t.question.trim() && t.choices.filter(Boolean).length >= 2)
        onChange({ trivia: [...existing, ...rows] })
      } else if (kind === 'puzzle') {
        const rows = parsePuzzleCsv(picked.text)
        if (rows.length === 0) return setImportError('No word rows found in that file')
        const existing = custom.puzzle.filter((p) => p.word.trim())
        onChange({ puzzle: [...existing, ...rows] })
      } else {
        const rows = parseListCsv(gameType, picked.text)
        if (rows.length === 0) return setImportError('No rows found in that file')
        const existing = custom.prompts.map((p) => p.trim()).filter(Boolean)
        onChange({ prompts: [...existing, ...rows] })
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file')
    } finally {
      setImporting(false)
    }
  }

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>{heading}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Source</Text>
          <SegmentedControl value={custom.source} options={options} onChange={onSourceChange} />
        </View>

        {custom.source === 'library' ? (
          <>
            <LibraryPackPicker gameType={gameType} custom={custom} onChange={onChange} />
            {custom.libraryPackTitle ? (
              <Text style={[styles.count, enough ? styles.countOk : styles.countLow]}>
                {count} / {min} {noun}
                {enough ? ' ✓' : ' needed'}
              </Text>
            ) : null}
          </>
        ) : custom.source === 'custom' ? (
          <>
            <Text style={styles.hint}>{copy.hint}</Text>

            {kind === 'binary' ? (
              <PairEditor custom={custom} onChange={onChange} />
            ) : kind === 'trivia' ? (
              <TriviaEditor custom={custom} onChange={onChange} />
            ) : kind === 'puzzle' ? (
              <PuzzleEditor gameType={gameType} custom={custom} onChange={onChange} />
            ) : (
              <ListEditor custom={custom} placeholder={copy.placeholder} onChange={onChange} />
            )}

            <View style={styles.actionRow}>
              <Pressable style={styles.addButton} onPress={() => addItem(kind, custom, onChange)}>
                <Text style={styles.addButtonText}>＋ {copy.addLabel}</Text>
              </Pressable>
              <Pressable style={styles.importButton} onPress={() => void onImportFile()} disabled={importing}>
                <Text style={styles.importButtonText}>{importing ? 'Reading…' : '⭱ Import CSV'}</Text>
              </Pressable>
            </View>

            {importError ? <Text style={styles.importError}>{importError}</Text> : null}

            <Text style={[styles.count, enough ? styles.countOk : styles.countLow]}>
              {count} / {min} {noun}
              {enough ? ' ✓' : ' needed'}
            </Text>
          </>
        ) : null}
      </View>
    </SurfaceCard>
  )
}

function addItem(kind: ReturnType<typeof customContentKind>, custom: CustomContentState, onChange: Props['onChange']) {
  if (kind === 'binary') onChange({ pairs: [...custom.pairs, { optionA: '', optionB: '' }] })
  else if (kind === 'trivia') onChange({ trivia: [...custom.trivia, emptyTriviaDraft()] })
  else if (kind === 'puzzle') onChange({ puzzle: [...custom.puzzle, { word: '', hint: '' }] })
  else onChange({ prompts: [...custom.prompts, ''] })
}

function PuzzleEditor({
  gameType,
  custom,
  onChange,
}: {
  gameType: GameType
  custom: CustomContentState
  onChange: Props['onChange']
}) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const showHint = !isWordSearchGame(gameType)
  const hintRequired = puzzleRequiresHint(gameType)
  const wordLabel = gameType === 'crossword' ? 'Answer' : 'Word'
  const hintLabel = gameType === 'crossword' ? 'Clue' : 'Hint'

  const setEntry = (idx: number, patch: Partial<PuzzleEntryDraft>) =>
    onChange({ puzzle: custom.puzzle.map((e, i) => (i === idx ? { ...e, ...patch } : e)) })
  const removeEntry = (idx: number) => onChange({ puzzle: custom.puzzle.filter((_, i) => i !== idx) })

  const entries = custom.puzzle.length > 0 ? custom.puzzle : [{ word: '', hint: '' }]

  return (
    <View style={styles.list}>
      {custom.puzzle.length > 1 ? (
        <View style={styles.listHeader}>
          <Text style={styles.listCount}>{custom.puzzle.filter((e) => e.word.trim()).length} words</Text>
          <Pressable onPress={() => onChange({ puzzle: [] })} hitSlop={8}>
            <Text style={styles.clearAll}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}
      {entries.map((entry, idx) => (
        <View key={idx} style={styles.row}>
          <TextInput
            style={styles.rowInput}
            value={entry.word}
            onChangeText={(word) => setEntry(idx, { word })}
            placeholder={wordLabel}
            placeholderTextColor={theme.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {showHint ? (
            <TextInput
              style={styles.rowInput}
              value={entry.hint}
              onChangeText={(hint) => setEntry(idx, { hint })}
              placeholder={hintRequired ? hintLabel : `${hintLabel} (optional)`}
              placeholderTextColor={theme.textFaint}
              autoCapitalize="sentences"
            />
          ) : null}
          {custom.puzzle.length > 1 ? <RemoveButton onPress={() => removeEntry(idx)} /> : null}
        </View>
      ))}
    </View>
  )
}

function ListEditor({
  custom,
  placeholder,
  onChange,
}: {
  custom: CustomContentState
  placeholder: string
  onChange: Props['onChange']
}) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const setItem = (idx: number, value: string) =>
    onChange({ prompts: custom.prompts.map((p, i) => (i === idx ? value : p)) })
  const removeItem = (idx: number) => onChange({ prompts: custom.prompts.filter((_, i) => i !== idx) })

  const filledCount = custom.prompts.filter((p) => p.trim()).length

  return (
    <View style={styles.list}>
      {custom.prompts.length > 1 ? (
        <View style={styles.listHeader}>
          <Text style={styles.listCount}>
            {filledCount} {filledCount === 1 ? 'word' : 'words'}
          </Text>
          <Pressable onPress={() => onChange({ prompts: [''] })} hitSlop={8}>
            <Text style={styles.clearAll}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}
      {custom.prompts.map((value, idx) => (
        <View key={idx} style={styles.row}>
          <TextInput
            style={styles.rowInput}
            value={value}
            onChangeText={(t) => setItem(idx, t)}
            placeholder={placeholder}
            placeholderTextColor={theme.textFaint}
            autoCapitalize="sentences"
            autoCorrect
          />
          {custom.prompts.length > 1 ? <RemoveButton onPress={() => removeItem(idx)} /> : null}
        </View>
      ))}
    </View>
  )
}

function PairEditor({ custom, onChange }: { custom: CustomContentState; onChange: Props['onChange'] }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const setPair = (idx: number, patch: Partial<WyrPairDraft>) =>
    onChange({ pairs: custom.pairs.map((p, i) => (i === idx ? { ...p, ...patch } : p)) })
  const removePair = (idx: number) => onChange({ pairs: custom.pairs.filter((_, i) => i !== idx) })

  return (
    <View style={styles.list}>
      {custom.pairs.map((pair, idx) => (
        <View key={idx} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemLabel}>Prompt {idx + 1}</Text>
            {custom.pairs.length > 1 ? <RemoveButton onPress={() => removePair(idx)} /> : null}
          </View>
          <TextInput
            style={styles.rowInput}
            value={pair.optionA}
            onChangeText={(optionA) => setPair(idx, { optionA })}
            placeholder="Option A"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="sentences"
          />
          <TextInput
            style={styles.rowInput}
            value={pair.optionB}
            onChangeText={(optionB) => setPair(idx, { optionB })}
            placeholder="Option B"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="sentences"
          />
        </View>
      ))}
    </View>
  )
}

function TriviaEditor({ custom, onChange }: { custom: CustomContentState; onChange: Props['onChange'] }) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const setQ = (idx: number, patch: Partial<TriviaDraft>) =>
    onChange({ trivia: custom.trivia.map((q, i) => (i === idx ? { ...q, ...patch } : q)) })
  const removeQ = (idx: number) => onChange({ trivia: custom.trivia.filter((_, i) => i !== idx) })

  const setChoice = (qIdx: number, cIdx: number, value: string) => {
    const q = custom.trivia[qIdx]
    setQ(qIdx, { choices: q.choices.map((c, i) => (i === cIdx ? value : c)) })
  }
  const addChoice = (qIdx: number) => {
    const q = custom.trivia[qIdx]
    if (q.choices.length >= MAX_TRIVIA_CHOICES) return
    setQ(qIdx, { choices: [...q.choices, ''] })
  }
  const removeChoice = (qIdx: number, cIdx: number) => {
    const q = custom.trivia[qIdx]
    if (q.choices.length <= 2) return
    const choices = q.choices.filter((_, i) => i !== cIdx)
    let correctIndex = q.correctIndex
    if (cIdx === correctIndex) correctIndex = 0
    else if (cIdx < correctIndex) correctIndex -= 1
    setQ(qIdx, { choices, correctIndex })
  }

  return (
    <View style={styles.list}>
      {custom.trivia.map((q, qIdx) => (
        <View key={qIdx} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemLabel}>Question {qIdx + 1}</Text>
            {custom.trivia.length > 1 ? <RemoveButton onPress={() => removeQ(qIdx)} /> : null}
          </View>
          <TextInput
            style={styles.rowInput}
            value={q.question}
            onChangeText={(question) => setQ(qIdx, { question })}
            placeholder="Question"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="sentences"
            multiline
          />
          <Text style={styles.choiceHint}>Tap the circle to mark the correct answer.</Text>
          {q.choices.map((choice, cIdx) => {
            const correct = cIdx === q.correctIndex
            return (
              <View key={cIdx} style={styles.row}>
                <Pressable
                  style={[styles.radio, correct && styles.radioOn]}
                  onPress={() => setQ(qIdx, { correctIndex: cIdx })}
                  hitSlop={8}
                >
                  {correct ? <View style={styles.radioDot} /> : null}
                </Pressable>
                <TextInput
                  style={styles.rowInput}
                  value={choice}
                  onChangeText={(t) => setChoice(qIdx, cIdx, t)}
                  placeholder={`Answer ${cIdx + 1}`}
                  placeholderTextColor={theme.textFaint}
                  autoCapitalize="sentences"
                />
                {q.choices.length > 2 ? <RemoveButton onPress={() => removeChoice(qIdx, cIdx)} /> : null}
              </View>
            )
          })}
          {q.choices.length < MAX_TRIVIA_CHOICES ? (
            <Pressable style={styles.addChoice} onPress={() => addChoice(qIdx)}>
              <Text style={styles.addChoiceText}>＋ Add answer</Text>
            </Pressable>
          ) : null}
          <SegmentedControl
            value={q.category}
            options={[
              { value: 'general', label: 'General' },
              { value: 'tech', label: 'Tech' },
            ]}
            onChange={(category) => setQ(qIdx, { category: category as TriviaDraft['category'] })}
          />
        </View>
      ))}
    </View>
  )
}

function RemoveButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable style={styles.remove} onPress={onPress} hitSlop={8}>
      <Text style={styles.removeText}>✕</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    heading: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    field: { gap: theme.space.sm },
    label: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    hint: {
      color: theme.textFaint,
      fontSize: 13,
      lineHeight: 18,
    },
    list: { gap: theme.space.sm },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 2,
    },
    listCount: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    clearAll: { color: theme.primary, fontSize: 13, fontWeight: '800' },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    rowInput: {
      flex: 1,
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 16,
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
    },
    itemCard: {
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    choiceHint: {
      color: theme.textFaint,
      fontSize: 12,
    },
    remove: {
      width: 34,
      height: 34,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    removeText: {
      color: theme.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: {
      borderColor: theme.success,
    },
    radioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.success,
    },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
    addButton: {
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    addButtonText: {
      color: theme.primaryMuted,
      fontSize: 14,
      fontWeight: '800',
    },
    importButton: {
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    importButtonText: { color: theme.textSecondary, fontSize: 14, fontWeight: '700' },
    importError: { color: theme.error, fontSize: 13 },
    addChoice: {
      alignSelf: 'flex-start',
      paddingVertical: 6,
    },
    addChoiceText: {
      color: theme.primaryMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    count: {
      fontSize: 13,
      fontWeight: '700',
    },
    countOk: { color: theme.success },
    countLow: { color: theme.textMuted },
  })
