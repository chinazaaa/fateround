import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { fetchLibraryPack, fetchLibraryPacks, type LibraryPackSummary } from '@/lib/api'
import { pickCsvText, parseWstDeckCsv } from '@/lib/file-import'
import { WST_PLATFORM_DECK, parseStoredWstDeck } from '@/lib/who-said-this-deck'
import type { WstCreateState, WstSource } from '@/lib/create-settings/who-said-this'

type Props = {
  wst: WstCreateState
  onChange: (patch: Partial<WstCreateState>) => void
}

const SOURCE_OPTIONS: { value: WstSource; label: string; hint: string }[] = [
  { value: 'player', label: 'Players submit', hint: 'Everyone writes a quote + options in the lobby.' },
  { value: 'platform', label: 'Platform', hint: 'Our built-in pack of famous quotes.' },
  { value: 'library', label: 'Library', hint: 'Pick a community quote pack (e.g. anime).' },
  { value: 'custom', label: 'Your own', hint: 'Upload a CSV of quotes, options, and answers.' },
]

/**
 * Who Said This "Questions" source picker (mobile parallel of the web create WST block).
 * Players submit, or a host deck (Platform / Library / uploaded CSV). Players just join and
 * answer — fastest correct wins.
 */
export function WhoSaidThisCreatePanel({ wst, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  const setSource = (source: WstSource) => {
    if (source === wst.source) return
    // Switching source resets any loaded/uploaded deck (Platform uses the built-in constant).
    onChange({ source, deck: [], libraryPackTitle: null })
  }

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Questions</Text>
        <SegmentedControl
          value={wst.source}
          options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
          onChange={(value) => setSource(value as WstSource)}
        />

        {wst.source === 'player' ? (
          <Text style={styles.hint}>
            Players join and each submits a quote with up to four options, marking the answer. When you start, everyone
            answers the pooled questions — fastest correct wins.
          </Text>
        ) : wst.source === 'platform' ? (
          <Text style={styles.hint}>
            {WST_PLATFORM_DECK.length} famous quotes are built in — players just join and answer like trivia, fastest
            correct wins. No setup needed.
          </Text>
        ) : wst.source === 'library' ? (
          <WstLibraryPicker wst={wst} onChange={onChange} />
        ) : (
          <WstDeckUpload wst={wst} onChange={onChange} />
        )}
      </View>
    </SurfaceCard>
  )
}

function WstLibraryPicker({ wst, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [packs, setPacks] = useState<LibraryPackSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPacks(null)
    setError(null)
    fetchLibraryPacks('who_said_this')
      .then((data) => {
        if (alive) setPacks(data)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load packs')
      })
    return () => {
      alive = false
    }
  }, [])

  const selectPack = async (pack: LibraryPackSummary) => {
    if (loadingId) return
    setLoadingId(pack.id)
    setError(null)
    try {
      const full = await fetchLibraryPack(pack.id)
      onChange({ deck: parseStoredWstDeck(full.questions), libraryPackTitle: full.title })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pack')
    } finally {
      setLoadingId(null)
    }
  }

  if (packs === null && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  if (error) return <Text style={styles.error}>{error}</Text>
  if (!packs || packs.length === 0) {
    return <Text style={styles.hint}>No community packs for Who Said This yet — try “Your own” or “Platform”.</Text>
  }

  return (
    <View style={styles.list}>
      {wst.libraryPackTitle ? (
        <Text style={styles.loaded}>
          Loaded: {wst.libraryPackTitle} ({wst.deck.length} questions)
        </Text>
      ) : null}
      {packs.map((pack) => {
        const active = wst.libraryPackTitle === pack.title
        return (
          <Pressable
            key={pack.id}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => void selectPack(pack)}
            disabled={!!loadingId}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {pack.title}
              </Text>
              {loadingId === pack.id ? (
                <ActivityIndicator size="small" />
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
  )
}

function WstDeckUpload({ wst, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const onUpload = async () => {
    if (importing) return
    setImporting(true)
    setError(null)
    try {
      const picked = await pickCsvText()
      if (!picked) return
      const deck = parseWstDeckCsv(picked.text)
      if (deck.length < 2) {
        onChange({ deck: [] })
        setError('Need at least 2 questions — each row is a quote, its options, and which is correct.')
        return
      }
      onChange({ deck })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file')
    } finally {
      setImporting(false)
    }
  }

  return (
    <View style={styles.uploadWrap}>
      <Pressable style={styles.uploadButton} onPress={() => void onUpload()} disabled={importing}>
        <Text style={styles.uploadButtonText}>
          {importing
            ? 'Reading…'
            : wst.deck.length > 0
              ? `Replace deck (${wst.deck.length} questions)`
              : 'Upload deck (CSV)'}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        Columns: quote, option_a, option_b, option_c, option_d, correct. The “correct” column is the answer letter
        (A–D). Players just join and answer — fastest correct wins.
      </Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    heading: { color: theme.text, fontSize: 18, fontWeight: '800' },
    hint: { color: theme.textFaint, fontSize: 13, lineHeight: 18 },
    centered: { paddingVertical: theme.space.lg, alignItems: 'center' },
    error: { color: theme.error, fontSize: 13 },
    list: { gap: theme.space.sm },
    loaded: { color: theme.success, fontSize: 13, fontWeight: '700' },
    card: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      gap: 4,
    },
    cardActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
    cardTitle: { color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 },
    cardCount: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    cardDesc: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
    cardAuthor: { color: theme.textFaint, fontSize: 12 },
    uploadWrap: { gap: theme.space.sm },
    uploadButton: {
      paddingVertical: theme.space.md,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
    },
    uploadButtonText: { color: theme.primaryMuted, fontSize: 15, fontWeight: '800' },
  })
