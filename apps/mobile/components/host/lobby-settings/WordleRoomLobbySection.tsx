import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  WORDLE_ROOM_TIMER_OPTIONS,
  WORDLE_ROOM_WORD_COUNT_OPTIONS,
  WORDLE_ROOM_CATEGORY_LABELS,
  WORDLE_ROOM_SAMPLE_CSV,
  type WordleCategoryId,
  type WordleRoomWordCount,
} from '@fateround/shared/wordle-room'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import { fetchLibraryPack, fetchLibraryPacks, type LibraryPackSummary } from '@/lib/api'
import { pickCsvText, parsePuzzleCsv } from '@/lib/file-import'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

export type WordleRoomWordEntry = { word: string; hint?: string }
export type WordleRoomSource = 'platform' | 'library' | 'custom'

export type WordleRoomLobbyState = {
  category: WordleCategoryId
  wordCount: WordleRoomWordCount
  timerSeconds: number
  source: WordleRoomSource
  customWords: WordleRoomWordEntry[]
  categoryLabel: string
}

export function isWordleRoomLobbyGame(gameType: GameType): boolean {
  return gameType === 'wordle_room'
}

const CATEGORY_OPTIONS: { value: WordleCategoryId; label: string }[] = (
  Object.keys(WORDLE_ROOM_CATEGORY_LABELS) as WordleCategoryId[]
).map((id) => ({ value: id, label: WORDLE_ROOM_CATEGORY_LABELS[id] }))

const SOURCE_OPTIONS: { value: WordleRoomSource; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'library', label: 'Library' },
  { value: 'custom', label: 'Your own' },
]

function timerLabel(seconds: number): string {
  if (seconds === 0) return 'Untimed'
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)} min`
}

function normalizeEntries(raw: { word?: string; hint?: string }[]): WordleRoomWordEntry[] {
  return raw
    .map((e) => {
      const word = (e.word ?? '').toLowerCase().replace(/[^a-z]/g, '')
      return e.hint ? { word, hint: e.hint } : { word }
    })
    .filter((e) => e.word.length >= 3 && e.word.length <= 8)
}

type Props = {
  value: WordleRoomLobbyState
  onChange: (patch: Partial<WordleRoomLobbyState>) => void
}

export function WordleRoomLobbySection({ value, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [packs, setPacks] = useState<LibraryPackSummary[] | null>(null)
  const [loadingPacks, setLoadingPacks] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [loadingPackId, setLoadingPackId] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (value.source !== 'library') return
    let alive = true
    setLoadingPacks(true)
    setPackError(null)
    fetchLibraryPacks('wordle_room')
      .then((data) => {
        if (alive) setPacks(data)
      })
      .catch((err) => {
        if (alive) setPackError(err instanceof Error ? err.message : 'Could not load packs')
      })
      .finally(() => {
        if (alive) setLoadingPacks(false)
      })
    return () => {
      alive = false
    }
  }, [value.source])

  const onSourceChange = (next: WordleRoomSource) => {
    if (next === value.source) return
    if (next === 'platform') {
      onChange({ source: 'platform', customWords: [] })
    } else {
      onChange({ source: next })
    }
  }

  const onPickPack = async (pack: LibraryPackSummary) => {
    if (loadingPackId) return
    setLoadingPackId(pack.id)
    setPackError(null)
    try {
      const full = await fetchLibraryPack(pack.id)
      const entries = normalizeEntries(full.questions as { word?: string; hint?: string }[])
      const patch: Partial<WordleRoomLobbyState> = { customWords: entries }
      if (!value.categoryLabel.trim()) patch.categoryLabel = full.title
      onChange(patch)
    } catch (err) {
      setPackError(err instanceof Error ? err.message : 'Could not load pack')
    } finally {
      setLoadingPackId(null)
    }
  }

  const onUploadCsv = async () => {
    if (uploading) return
    setUploading(true)
    setCsvError(null)
    try {
      const picked = await pickCsvText()
      if (!picked) return
      const parsed = parsePuzzleCsv(picked.text)
      const entries = normalizeEntries(parsed)
      if (entries.length === 0) {
        setCsvError('No valid 3–8 letter words found in that file.')
        return
      }
      onChange({ customWords: entries })
    } catch {
      setCsvError('Could not read that file. Expect CSV with word,hint columns.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Word source</Text>
        <SegmentedControl
          value={value.source}
          onChange={(next) => onSourceChange(next as WordleRoomSource)}
          options={SOURCE_OPTIONS}
        />
      </View>

      {value.source === 'platform' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <SegmentedControl
            value={value.category}
            onChange={(category) => onChange({ category: category as WordleCategoryId })}
            options={CATEGORY_OPTIONS}
          />
        </View>
      ) : null}

      {value.source === 'library' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Library pack</Text>
          {loadingPacks ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : packError ? (
            <Text style={styles.error}>{packError}</Text>
          ) : !packs || packs.length === 0 ? (
            <Text style={styles.empty}>No community packs yet — try “Your own”.</Text>
          ) : (
            <View style={styles.list}>
              {packs.map((pack) => {
                const active = loadingPackId === pack.id
                return (
                  <Pressable
                    key={pack.id}
                    style={[styles.card, active && styles.cardActive]}
                    onPress={() => void onPickPack(pack)}
                    disabled={!!loadingPackId}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {pack.title}
                      </Text>
                      {active ? (
                        <ActivityIndicator color={theme.primaryMuted} size="small" />
                      ) : (
                        <Text style={styles.cardCount}>{pack.question_count}</Text>
                      )}
                    </View>
                    {pack.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {pack.description}
                      </Text>
                    ) : null}
                    <Text style={styles.cardAuthor}>by {pack.author_name}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}
          {value.customWords.length > 0 ? (
            <Text style={styles.status}>
              Loaded {value.customWords.length} valid word{value.customWords.length === 1 ? '' : 's'}
              {value.customWords.length < value.wordCount
                ? ` — need at least ${value.wordCount} for a ${value.wordCount}-word race`
                : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      {value.source === 'custom' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Upload word list</Text>
          <Pressable onPress={() => void Share.share({ message: WORDLE_ROOM_SAMPLE_CSV, title: 'wordle-sample.csv' })}>
            <Text style={styles.sampleLink}>View / share sample CSV</Text>
          </Pressable>
          <View style={styles.sampleBox}>
            <Text style={styles.sampleText} numberOfLines={4}>
              {WORDLE_ROOM_SAMPLE_CSV.split('\n').slice(0, 4).join('\n')}
            </Text>
          </View>
          <Pressable style={styles.uploadBtn} onPress={() => void onUploadCsv()} disabled={uploading}>
            <Text style={styles.uploadText}>{uploading ? 'Reading…' : 'Pick CSV file'}</Text>
          </Pressable>
          <Text style={styles.hint}>
            {value.customWords.length > 0
              ? `Loaded ${value.customWords.length} valid 3–8 letter word${value.customWords.length === 1 ? '' : 's'}${
                  value.customWords.length < value.wordCount ? ` — need at least ${value.wordCount}` : ''
                }.`
              : 'CSV with word,hint per line (hint optional). Words must be 3–8 letters.'}
          </Text>
          {csvError ? <Text style={styles.error}>{csvError}</Text> : null}
        </View>
      ) : null}

      {value.source !== 'platform' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Category name (badge)</Text>
          <TextInput
            value={value.categoryLabel}
            onChangeText={(t) => onChange({ categoryLabel: t })}
            placeholder="e.g. Fruits, Slang"
            placeholderTextColor={theme.textFaint}
            style={styles.input}
            maxLength={40}
          />
        </View>
      ) : null}

      <TimerPicker
        label="Words in the race"
        value={value.wordCount}
        options={WORDLE_ROOM_WORD_COUNT_OPTIONS as readonly number[]}
        format={(n) => `${n} words`}
        onChange={(n) => onChange({ wordCount: n as WordleRoomWordCount })}
      />
      <TimerPicker
        label="Whole-game timer"
        value={value.timerSeconds}
        options={WORDLE_ROOM_TIMER_OPTIONS as readonly number[]}
        format={timerLabel}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.xs },
    label: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    centered: { paddingVertical: theme.space.lg, alignItems: 'center' },
    list: { gap: theme.space.sm },
    empty: { color: theme.textFaint, fontSize: 14, lineHeight: 20 },
    error: { color: theme.error, fontSize: 13 },
    status: { color: theme.success, fontSize: 12, fontWeight: '600' },
    hint: { color: theme.textFaint, fontSize: 12, lineHeight: 16 },
    card: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      gap: 4,
    },
    cardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    cardTitle: { color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 },
    cardCount: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    cardDesc: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
    cardAuthor: { color: theme.textFaint, fontSize: 12 },
    uploadBtn: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    uploadText: { color: theme.text, fontWeight: '700', fontSize: 14 },
    sampleLink: { color: theme.primary, fontSize: 13, textDecorationLine: 'underline', fontWeight: '600' },
    sampleBox: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.sm,
      padding: theme.space.sm,
    },
    sampleText: { color: theme.textMuted, fontSize: 11, fontFamily: 'monospace' },
    input: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      fontSize: 14,
    },
  })
