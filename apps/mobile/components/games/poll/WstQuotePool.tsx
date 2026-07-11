import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Participant } from '@fateround/shared'
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
  myParticipantId: string | null
  participants: Participant[]
  animeMode: boolean
}

/**
 * Who Said This lobby quote-pool submission. Each player adds their own quotes,
 * tags who said each one, and can edit/delete their submissions. Mirrors web
 * PollGamePlayerExperience WST waiting block.
 */
export function WstQuotePool({ gameCode, resumeToken, myPlayerId, myParticipantId, participants, animeMode }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [pool, setPool] = useState<WstQuotePoolEntry[]>([])
  const [quoteInput, setQuoteInput] = useState('')
  const [authorId, setAuthorId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const code = gameCode.toUpperCase()

  const fetchPool = useCallback(async () => {
    const { data } = await getSupabase()
      .from('wst_quote_pool')
      .select('*')
      .eq('game_id', code)
      .order('created_at')
    setPool((data as WstQuotePoolEntry[]) ?? [])
  }, [code])

  useEffect(() => {
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
  }, [code, fetchPool])

  const targets = useMemo(
    () =>
      [...participants]
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, name: p.name })),
    [participants]
  )

  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return targets
    return targets.filter((t) => t.name.toLowerCase().includes(q))
  }, [search, targets])

  const myQuotes = useMemo(
    () =>
      pool
        .filter((e) => e.player_id === myPlayerId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pool, myPlayerId]
  )

  const nameById = useMemo(() => new Map(participants.map((p) => [p.id, p.name])), [participants])

  if (animeMode) {
    return (
      <View style={styles.card}>
        <Text style={styles.animeTitle}>Anime Quote Mode</Text>
        <Text style={styles.animeSub}>The host is loading anime quotes — sit tight!</Text>
      </View>
    )
  }

  const resetForm = () => {
    setQuoteInput('')
    setAuthorId(null)
    setEditingId(null)
    setSearch('')
  }

  const submit = async () => {
    const text = quoteInput.trim()
    if (!text || !authorId || busy) return
    setBusy(true)
    setError(null)
    try {
      await postWstQuote(code, resumeToken, text, authorId, editingId ?? undefined)
      resetForm()
      await fetchPool()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quote')
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
      setError(err instanceof Error ? err.message : 'Failed to remove quote')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = !!quoteInput.trim() && !!authorId && !busy

  return (
    <View style={styles.container}>
      <View style={styles.poolHeader}>
        <Text style={styles.poolLabel}>Quote pool</Text>
        <Text style={styles.poolCount}>{pool.length} submitted</Text>
      </View>
      <Text style={styles.poolHint}>
        Add as many quotes as you like — each one becomes a round. Pick who said each quote before the host starts.
      </Text>

      {!myParticipantId ? (
        <Text style={styles.blocked}>Claim your name when joining to submit a quote.</Text>
      ) : (
        <View style={styles.card}>
          {myQuotes.length > 0 ? (
            <View style={styles.myQuotes}>
              <Text style={styles.myQuotesLabel}>Your quotes ({myQuotes.length})</Text>
              {myQuotes.map((entry) => (
                <View key={entry.id} style={styles.myQuoteRow}>
                  <View style={styles.myQuoteText}>
                    <Text style={styles.quoteBody} numberOfLines={2}>
                      &ldquo;{entry.quote_text}&rdquo;
                    </Text>
                    <Text style={styles.quoteAuthor}>— {nameById.get(entry.author_participant_id) ?? 'Unknown'}</Text>
                  </View>
                  <View style={styles.myQuoteActions}>
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        setEditingId(entry.id)
                        setQuoteInput(entry.quote_text)
                        setAuthorId(entry.author_participant_id)
                      }}
                    >
                      <Text style={styles.editBtn}>Edit</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => void remove(entry.id)}>
                      <Text style={styles.deleteBtn}>×</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.formTitle}>
            {editingId ? 'Edit quote' : myQuotes.length > 0 ? 'Add another quote' : 'Add your quote to the pool'}
          </Text>
          <TextInput
            style={styles.textarea}
            placeholder="e.g. Roses are red"
            placeholderTextColor={theme.textFaint}
            value={quoteInput}
            onChangeText={setQuoteInput}
            multiline
            maxLength={500}
            editable={!busy}
          />

          <Text style={styles.pickerLabel}>Who said this?</Text>
          <TextInput
            style={styles.search}
            placeholder="Search names…"
            placeholderTextColor={theme.textFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            editable={!busy}
          />
          <View style={styles.nameList}>
            {filteredTargets.length === 0 ? (
              <Text style={styles.emptyNames}>No names match</Text>
            ) : (
              filteredTargets.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.namePill, authorId === t.id && styles.namePillSelected]}
                  disabled={busy}
                  onPress={() => setAuthorId(t.id)}
                >
                  <Text style={[styles.namePillText, authorId === t.id && styles.namePillTextSelected]}>{t.name}</Text>
                </Pressable>
              ))
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.submit, !canSubmit && styles.submitDisabled]} disabled={!canSubmit} onPress={() => void submit()}>
            <Text style={styles.submitText}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add to Pool →'}</Text>
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
    animeTitle: { color: theme.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
    animeSub: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
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
      minHeight: 72,
      textAlignVertical: 'top',
    },
    pickerLabel: {
      color: theme.textFaint,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
    },
    search: {
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      fontSize: 14,
    },
    nameList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    emptyNames: { color: theme.textFaint, fontSize: 13 },
    namePill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
    },
    namePillSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    namePillText: { color: theme.text, fontSize: 14 },
    namePillTextSelected: { color: theme.primaryMuted, fontWeight: '700' },
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
