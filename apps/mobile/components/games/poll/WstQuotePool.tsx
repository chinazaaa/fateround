import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { getSupabase } from '@/lib/supabase'
import { uniqueTopic } from '@/lib/realtime'
import { deleteWstQuote, postWstQuote } from '@/components/games/poll/poll-api'
import type { WstQuotePoolEntry } from '@/components/games/poll/poll-types'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'

type Props = {
  gameCode: string
  resumeToken: string
  myPlayerId: string
  /** Deck games (Platform / Library / uploaded CSV): players just wait — no submissions. */
  deckMode: boolean
  /** Whether this player can author questions (a joined, non-spectator player). */
  canSubmit: boolean
}

const LETTERS = ['A', 'B', 'C', 'D']
const emptyOptions = (): string[] => ['', '', '', '']

/**
 * Who Said This lobby question pool (players-submit mode). Each player writes a quote with up to
 * four options and taps the correct one; questions become choice rounds. Mirrors web
 * PollGamePlayerExperience WST waiting block / useWstQuotePool. Deck games show a simple
 * "you're in" state instead.
 */
export function WstQuotePool({ gameCode, resumeToken, myPlayerId, deckMode, canSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [pool, setPool] = useState<WstQuotePoolEntry[]>([])
  const [quoteInput, setQuoteInput] = useState('')
  const [optionInputs, setOptionInputs] = useState<string[]>(emptyOptions)
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const code = gameCode.toUpperCase()

  const fetchPool = useCallback(async () => {
    const { data } = await getSupabase().from('wst_quote_pool').select('*').eq('game_id', code).order('created_at')
    setPool((data as WstQuotePoolEntry[]) ?? [])
  }, [code])

  useEffect(() => {
    if (deckMode) return
    void fetchPool()
    const channel = getSupabase()
      .channel(uniqueTopic(`wst-pool-${code}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${code}` },
        () => void fetchPool()
      )
      .subscribe()
    return () => {
      void getSupabase().removeChannel(channel)
    }
  }, [code, deckMode, fetchPool])

  const myQuotes = useMemo(
    () => pool.filter((e) => e.player_id === myPlayerId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pool, myPlayerId]
  )

  if (deckMode) {
    return (
      <View style={styles.card}>
        <Text style={styles.deckTitle}>You&apos;re in!</Text>
        <Text style={styles.deckSub}>
          The host loaded the questions — wait for them to start, then answer as fast as you can.
        </Text>
      </View>
    )
  }

  const resetForm = () => {
    setQuoteInput('')
    setOptionInputs(emptyOptions())
    setCorrectIndex(null)
    setEditingId(null)
  }

  const filledOptions = optionInputs.filter((o) => o.trim())
  const canSubmitQuestion =
    !!quoteInput.trim() &&
    filledOptions.length >= 2 &&
    correctIndex != null &&
    !!optionInputs[correctIndex]?.trim() &&
    !busy

  const submit = async () => {
    if (!canSubmitQuestion || correctIndex == null) return
    const options = optionInputs.map((o) => o.trim()).filter(Boolean)
    // The correct answer must still be a non-empty option after trimming/blank-filtering.
    const correctText = optionInputs[correctIndex]?.trim()
    const resolvedCorrect = correctText ? options.indexOf(correctText) : -1
    if (resolvedCorrect < 0) return
    setBusy(true)
    setError(null)
    try {
      await postWstQuote(code, resumeToken, quoteInput.trim(), options, resolvedCorrect, editingId ?? undefined)
      resetForm()
      await fetchPool()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit question')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (quoteId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteWstQuote(code, resumeToken, quoteId)
      if (editingId === quoteId) resetForm()
      await fetchPool()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove question')
    } finally {
      setBusy(false)
    }
  }

  const startEditing = (entry: WstQuotePoolEntry) => {
    setEditingId(entry.id)
    setQuoteInput(entry.quote_text)
    const opts = entry.options ?? []
    setOptionInputs([opts[0] ?? '', opts[1] ?? '', opts[2] ?? '', opts[3] ?? ''])
    setCorrectIndex(entry.correct_index ?? null)
  }

  const setOption = (i: number, value: string) => {
    const next = [...optionInputs]
    next[i] = value
    setOptionInputs(next)
    // Clearing the option that was marked correct drops the mark.
    if (correctIndex === i && !value.trim()) setCorrectIndex(null)
  }

  return (
    <View style={styles.container}>
      <View style={styles.poolHeader}>
        <Text style={styles.poolLabel}>Question pool</Text>
        <Text style={styles.poolCount}>{pool.length} submitted</Text>
      </View>
      <Text style={styles.poolHint}>
        Add as many questions as you like — each is a quote with up to four options and one right answer. Fastest
        correct answer wins.
      </Text>

      {!canSubmit ? (
        <Text style={styles.blocked}>Join the game to submit questions.</Text>
      ) : (
        <View style={styles.card}>
          {myQuotes.length > 0 ? (
            <View style={styles.myQuotes}>
              <Text style={styles.myQuotesLabel}>Your questions ({myQuotes.length})</Text>
              {myQuotes.map((entry) => {
                const answer = entry.options?.[entry.correct_index ?? -1] ?? '—'
                return (
                  <View key={entry.id} style={styles.myQuoteRow}>
                    <View style={styles.myQuoteText}>
                      <Text style={styles.quoteBody} numberOfLines={2}>
                        &ldquo;{entry.quote_text}&rdquo;
                      </Text>
                      <Text style={styles.quoteAuthor}>Answer: {answer}</Text>
                    </View>
                    <View style={styles.myQuoteActions}>
                      <Pressable disabled={busy} onPress={() => startEditing(entry)}>
                        <Text style={styles.editBtn}>Edit</Text>
                      </Pressable>
                      <Pressable disabled={busy} onPress={() => void remove(entry.id)}>
                        <Text style={styles.deleteBtn}>×</Text>
                      </Pressable>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}

          <Text style={styles.formTitle}>
            {editingId ? 'Edit question' : myQuotes.length > 0 ? 'Add another question' : 'Add a question'}
          </Text>
          <TextInput
            style={styles.textarea}
            placeholder="The quote — e.g. “I am your father.”"
            placeholderTextColor={theme.textFaint}
            value={quoteInput}
            onChangeText={setQuoteInput}
            multiline
            maxLength={500}
            editable={!busy}
          />

          <Text style={styles.pickerLabel}>Options — tap the correct one</Text>
          {optionInputs.map((opt, i) => {
            const isCorrect = correctIndex === i
            const disabledMark = busy || !opt.trim()
            return (
              <View key={i} style={styles.optionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark option ${LETTERS[i]} correct`}
                  accessibilityState={{ selected: isCorrect }}
                  disabled={disabledMark}
                  onPress={() => setCorrectIndex(i)}
                  style={[styles.mark, isCorrect && styles.markOn, disabledMark && !isCorrect && styles.markDisabled]}
                >
                  <Text style={[styles.markText, isCorrect && styles.markTextOn]}>{isCorrect ? '✓' : LETTERS[i]}</Text>
                </Pressable>
                <TextInput
                  style={styles.optionInput}
                  placeholder={`Option ${LETTERS[i]}`}
                  placeholderTextColor={theme.textFaint}
                  value={opt}
                  onChangeText={(t) => setOption(i, t)}
                  maxLength={200}
                  editable={!busy}
                />
              </View>
            )
          })}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.submit, !canSubmitQuestion && styles.submitDisabled]}
            disabled={!canSubmitQuestion}
            onPress={() => void submit()}
          >
            <Text style={styles.submitText}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add to pool →'}</Text>
          </Pressable>
          {editingId ? (
            <Pressable style={styles.cancel} disabled={busy} onPress={resetForm}>
              <Text style={styles.cancelText}>Cancel edit</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { gap: 12 },
    poolHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    poolLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    poolCount: { color: theme.text, fontSize: 14, fontWeight: '700' },
    poolHint: { color: theme.textFaint, fontSize: 12, lineHeight: 18 },
    blocked: { color: theme.textFaint, fontSize: 13, textAlign: 'center', marginTop: 8 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 14,
    },
    deckTitle: { color: theme.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
    deckSub: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
    myQuotes: { gap: 8 },
    myQuotesLabel: {
      color: theme.textFaint,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    myQuoteRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    myQuoteText: { flex: 1, gap: 2 },
    quoteBody: { color: theme.textMuted, fontSize: 14 },
    quoteAuthor: { color: theme.textFaint, fontSize: 11 },
    myQuoteActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    editBtn: { color: theme.primaryMuted, fontSize: 13, fontWeight: '600' },
    deleteBtn: { color: '#fca5a5', fontSize: 20, fontWeight: '700' },
    formTitle: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    textarea: {
      backgroundColor: theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      color: theme.text,
      fontSize: 15,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    pickerLabel: {
      color: theme.textFaint,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    mark: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markOn: { borderColor: theme.primary, backgroundColor: theme.primary },
    markDisabled: { opacity: 0.4 },
    markText: { color: theme.textMuted, fontSize: 13, fontWeight: '800' },
    markTextOn: { color: '#fff' },
    optionInput: {
      flex: 1,
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      fontSize: 15,
    },
    error: { color: '#fca5a5', fontSize: 13, textAlign: 'center' },
    submit: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitDisabled: { opacity: 0.45 },
    submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    cancel: { alignItems: 'center', paddingVertical: 8 },
    cancelText: { color: theme.textMuted, fontSize: 14 },
  })
