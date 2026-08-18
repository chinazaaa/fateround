import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { fetchLibraryPack, fetchLibraryPacks, type LibraryPackSummary } from '@/lib/api'
import { pickCsvText } from '@/lib/file-import'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

/**
 * Mirrors web `WordGroupingLobbySettings` — Platform / Library / Your own. Library picks a
 * community pack; Your own uploads a CSV where every four rows sharing a `puzzle` column form
 * one puzzle (one row per group, difficulty 1–4, 4 words each). Sample CSV can be shared out
 * from here so hosts start from a working template — RN has no browser download, so we surface
 * the sample as inline text + a Share sheet.
 */

export type WordGroupingSource = 'platform' | 'library' | 'custom'

export type WordGroupingLobbyState = {
  source: WordGroupingSource
  customQuestions: unknown[]
  libraryPackTitle: string | null
}

export function isWordGroupingLobbyGame(gameType: GameType): boolean {
  return gameType === 'word_grouping'
}

export function wordGroupingStateFromGame(game: Game): WordGroupingLobbyState {
  const isCustom =
    game.question_source === 'custom' && Array.isArray(game.custom_questions) && game.custom_questions.length > 0
  return {
    source: isCustom ? 'library' : 'platform',
    customQuestions: isCustom ? (game.custom_questions as unknown[]) : [],
    libraryPackTitle: null,
  }
}

const SOURCE_OPTIONS: { value: WordGroupingSource; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'library', label: 'Library' },
  { value: 'custom', label: 'Your own' },
]

/** Sample kept in lockstep with web `WORD_GROUPING_SAMPLE_CSV` and the library submit page. */
const WORD_GROUPING_SAMPLE_CSV = [
  'puzzle,category,difficulty,word1,word2,word3,word4',
  '1,Fruits,1,Apple,Pear,Peach,Plum',
  '1,Colors,2,Red,Blue,Purple,Orange',
  '1,Animals,3,Cat,Dog,Bird,Fish',
  '1,___ ball,4,Foot,Basket,Base,Snow',
  '2,Days of the week,1,Monday,Friday,Sunday,Wednesday',
  '2,Continents,2,Asia,Europe,Africa,Australia',
  '2,Kitchen tools,3,Knife,Fork,Spoon,Plate',
  '2,___ time,4,Bed,Show,Dinner,Prime',
  '',
].join('\n')

/** Minimal quote-aware CSV field splitter (mirrors web `src/lib/csv-parse.ts`). */
function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }
    current += ch
  }
  result.push(current)
  return result
}

/**
 * Accepts either JSON-per-line (each line an object with `groups`) or the WG CSV shape used by
 * the web sample + library submit page. Returns raw entries + row counts; the server
 * (parseStoredWordGroupingPuzzles) runs the final shape validation, so shape drift is caught
 * either here (row-shape floor) or server-side (full validate).
 */
function parseWordGroupingText(text: string): { entries: unknown[]; totalRows: number; skippedRows: number } {
  const trimmed = text.trim()
  if (!trimmed) return { entries: [], totalRows: 0, skippedRows: 0 }
  const firstLine = trimmed.split(/\r?\n/, 1)[0]!.trim()
  if (firstLine.startsWith('{')) {
    const entries: unknown[] = []
    let totalRows = 0
    let skippedRows = 0
    for (const line of trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)) {
      totalRows += 1
      try {
        const obj = JSON.parse(line)
        if (obj && typeof obj === 'object' && Array.isArray((obj as { groups?: unknown }).groups)) {
          entries.push(obj)
          continue
        }
      } catch {
        // Not JSON — count as skipped.
      }
      skippedRows += 1
    }
    return { entries, totalRows, skippedRows }
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return { entries: [], totalRows: 0, skippedRows: 0 }
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const required = ['puzzle', 'category', 'difficulty', 'word1', 'word2', 'word3', 'word4']
  if (!required.every((c) => headers.includes(c))) {
    return { entries: [], totalRows: lines.length - 1, skippedRows: lines.length - 1 }
  }
  const byPuzzle = new Map<string, { category: string; difficulty: number; words: string[] }[]>()
  let totalRows = 0
  let skippedRows = 0
  for (let i = 1; i < lines.length; i += 1) {
    totalRows += 1
    const cols = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j += 1) row[headers[j]] = (cols[j] ?? '').trim()
    const key = row.puzzle
    const category = row.category
    const difficulty = Number(row.difficulty)
    const words = [row.word1, row.word2, row.word3, row.word4].filter(Boolean)
    if (!key || !category || ![1, 2, 3, 4].includes(difficulty) || words.length !== 4) {
      skippedRows += 1
      continue
    }
    const list = byPuzzle.get(key) ?? []
    list.push({ category, difficulty, words })
    byPuzzle.set(key, list)
  }
  const entries: unknown[] = []
  for (const groups of byPuzzle.values()) {
    if (groups.length !== 4) {
      skippedRows += groups.length
      continue
    }
    groups.sort((a, b) => a.difficulty - b.difficulty)
    entries.push({ groups })
  }
  return { entries, totalRows, skippedRows }
}

type Props = {
  value: WordGroupingLobbyState
  onChange: (patch: Partial<WordGroupingLobbyState>) => void
}

export function WordGroupingLobbySection({ value, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [packs, setPacks] = useState<LibraryPackSummary[] | null>(null)
  const [loadingPacks, setLoadingPacks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSummary, setUploadSummary] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (value.source !== 'library') return
    let alive = true
    setLoadingPacks(true)
    setError(null)
    fetchLibraryPacks('word_grouping')
      .then((data) => {
        if (alive) setPacks(data)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load packs')
      })
      .finally(() => {
        if (alive) setLoadingPacks(false)
      })
    return () => {
      alive = false
    }
  }, [value.source])

  const onSourceChange = (next: WordGroupingSource) => {
    if (next === value.source) return
    setUploadError(null)
    setUploadSummary(null)
    if (next === 'platform') {
      onChange({ source: 'platform', customQuestions: [], libraryPackTitle: null })
    } else {
      onChange({ source: next })
    }
  }

  const onPickPack = async (pack: LibraryPackSummary) => {
    if (loadingId) return
    setLoadingId(pack.id)
    setError(null)
    try {
      const full = await fetchLibraryPack(pack.id)
      const questions = Array.isArray(full.questions) ? (full.questions as unknown[]) : []
      if (questions.length < 4) {
        setError('Pack needs at least 4 puzzles')
        return
      }
      onChange({ customQuestions: questions, libraryPackTitle: full.title })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pack')
    } finally {
      setLoadingId(null)
    }
  }

  const onUploadCsv = async () => {
    if (uploading) return
    setUploading(true)
    setUploadError(null)
    setUploadSummary(null)
    try {
      const picked = await pickCsvText()
      if (!picked) return
      const { entries, totalRows, skippedRows } = parseWordGroupingText(picked.text)
      if (entries.length < 4) {
        setUploadError(
          entries.length > 0
            ? `Only ${entries.length} valid puzzle${entries.length === 1 ? '' : 's'} — need at least 4.`
            : `No valid puzzles found (${totalRows - skippedRows}/${totalRows} rows recognised).`
        )
        return
      }
      onChange({ customQuestions: entries, libraryPackTitle: null })
      setUploadSummary(
        `${entries.length} puzzle${entries.length === 1 ? '' : 's'} loaded${
          skippedRows ? ` · ${skippedRows} row${skippedRows === 1 ? '' : 's'} skipped` : ''
        }`
      )
    } catch {
      setUploadError('Could not read that file. Try the sample CSV format.')
    } finally {
      setUploading(false)
    }
  }

  const loadedCount = value.source !== 'platform' ? value.customQuestions.length : 0

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Puzzle source</Text>
        <SegmentedControl
          value={value.source}
          onChange={(next) => onSourceChange(next as WordGroupingSource)}
          options={SOURCE_OPTIONS}
        />
      </View>

      {value.source === 'library' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Library pack</Text>
          {loadingPacks ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !packs || packs.length === 0 ? (
            <Text style={styles.empty}>No community packs for this game yet.</Text>
          ) : (
            <View style={styles.list}>
              {packs.map((pack) => {
                const active = loadingId === pack.id || value.libraryPackTitle === pack.title
                return (
                  <Pressable
                    key={pack.id}
                    style={[styles.card, active && styles.cardActive]}
                    onPress={() => void onPickPack(pack)}
                    disabled={!!loadingId}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {pack.title}
                      </Text>
                      {loadingId === pack.id ? (
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
          {loadedCount > 0 ? (
            <Text style={styles.status}>
              ✓ {loadedCount} puzzle{loadedCount === 1 ? '' : 's'} loaded
            </Text>
          ) : null}
        </View>
      ) : null}

      {value.source === 'custom' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Upload puzzles</Text>
          <Pressable
            onPress={() => void Share.share({ message: WORD_GROUPING_SAMPLE_CSV, title: 'word-grouping-sample.csv' })}
          >
            <Text style={styles.sampleLink}>View / share sample CSV</Text>
          </Pressable>
          <View style={styles.sampleBox}>
            <Text style={styles.sampleText} numberOfLines={5}>
              {WORD_GROUPING_SAMPLE_CSV.split('\n').slice(0, 5).join('\n')}
            </Text>
          </View>
          <Pressable style={styles.uploadBtn} onPress={() => void onUploadCsv()} disabled={uploading}>
            <Text style={styles.uploadText}>{uploading ? 'Reading…' : 'Pick CSV file'}</Text>
          </Pressable>
          <Text style={styles.hint}>
            CSV columns: puzzle, category, difficulty, word1, word2, word3, word4. Four rows per puzzle (one per group,
            difficulties 1–4). Need at least 4 puzzles.
          </Text>
          {uploadSummary ? <Text style={styles.status}>{uploadSummary}</Text> : null}
          {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
          {loadedCount > 0 && !uploadSummary ? (
            <Text style={styles.hint}>
              Currently loaded: {loadedCount} puzzle{loadedCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.xs },
    label: { color: theme.text, fontSize: 14, fontWeight: '600' },
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
  })
