import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import type { ProfileGameRow } from '@/lib/profile-api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

/**
 * Stats & History — mobile port of web's `src/components/profile/StatsTab.tsx`.
 *
 * WHY IT EXISTS. Web's profile has three tabs; mobile had no stats or match-history surface
 * anywhere, so a third of what the profile screen is for simply wasn't there — while the one
 * screen it did have was carrying trophies AND account settings in a single scroll. Adding this
 * alongside a tab bar fixes both at once. See `docs/mobile-ia-audit-2026-08.md`.
 *
 * Reads the same `/api/profile/history` endpoint web does, so the two platforms cannot disagree
 * about what a player played. `label` comes off the API row rather than a local registry lookup,
 * for the same reason.
 */

type HistoryEntry = {
  id: string
  gameType: string
  finishedAt: string
  playerCount: number
  sessionsPlayed: number
  won: boolean | null
  winnerName: string | null
  allWinnerNames: string[]
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function ProfileStatsTab({ games }: { games: ProfileGameRow[] }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const totalPlayed = games.reduce((sum, g) => sum + (g.gamesPlayed ?? 0), 0)
  const totalWon = games.reduce((sum, g) => sum + (g.gamesWon ?? 0), 0)
  const winRate = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0
  const topGames = [...games].sort((a, b) => (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0)).slice(0, 5)
  const labelFor = (gameType: string) => games.find((g) => g.gameType === gameType)?.label ?? gameType

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [cursor, setCursor] = useState<{ at: string; id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchHistory = useCallback(async (next?: { at: string; id: string }) => {
    try {
      const params = new URLSearchParams()
      if (next) {
        params.set('cursor', next.at)
        params.set('cursorId', next.id)
      }
      const qs = params.toString()
      const res = await fetch(apiUrl(`/api/profile/history${qs ? `?${qs}` : ''}`), {
        headers: (await authHeaders()) ?? undefined,
      })
      if (!res.ok) return
      const json = (await res.json()) as {
        games: HistoryEntry[]
        nextCursor: string | null
        nextCursorId: string | null
      }
      // Append on "load more", replace on a fresh read.
      setHistory((prev) => (next ? [...prev, ...(json.games ?? [])] : (json.games ?? [])))
      setCursor(json.nextCursor && json.nextCursorId ? { at: json.nextCursor, id: json.nextCursorId } : null)
    } catch {
      // Keep whatever is already on screen rather than blanking the list on a blip.
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory])

  return (
    <View style={styles.wrap}>
      <View style={styles.totalsRow}>
        <Stat label="Games played" value={totalPlayed} />
        <Stat label="Games won" value={totalWon} />
        <Stat label="Win rate" value={`${winRate}%`} />
      </View>

      {topGames.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Most played</Text>
          <SurfaceCard>
            {topGames.map((game) => {
              const played = game.gamesPlayed ?? 0
              const rate = played > 0 ? Math.round(((game.gamesWon ?? 0) / played) * 100) : 0
              return (
                <View key={game.gameType} style={styles.row}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {game.label}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {played} played · {rate}% won
                  </Text>
                </View>
              )
            })}
          </SurfaceCard>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent games</Text>
        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : history.length === 0 ? (
          <SurfaceCard>
            <Text style={styles.empty}>No finished games yet. Play one and it&apos;ll show up here.</Text>
          </SurfaceCard>
        ) : (
          <>
            <SurfaceCard>
              {history.map((entry) => (
                <View key={entry.id} style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {labelFor(entry.gameType)}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                      {timeAgo(entry.finishedAt)} · {entry.playerCount} player
                      {entry.playerCount === 1 ? '' : 's'}
                      {entry.sessionsPlayed > 1 ? ` · ${entry.sessionsPlayed} rounds` : ''}
                      {entry.allWinnerNames.length > 0 ? ` · ${entry.allWinnerNames.join(', ')}` : ''}
                    </Text>
                  </View>
                  {/* `won` is null when the server could not attribute a winner, which is not
                      the same as losing — so it gets no badge rather than a wrong one. */}
                  {entry.won === true ? <Text style={styles.wonBadge}>WON</Text> : null}
                </View>
              ))}
            </SurfaceCard>
            {cursor ? (
              <AppButton
                label={loadingMore ? 'Loading…' : 'Load more'}
                tone="secondary"
                fullWidth
                disabled={loadingMore}
                onPress={() => {
                  setLoadingMore(true)
                  void fetchHistory(cursor)
                }}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <SurfaceCard style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    totalsRow: { flexDirection: 'row', gap: theme.space.sm },
    tile: { flex: 1, alignItems: 'center' },
    tileValue: { color: theme.text, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
    tileLabel: { color: theme.textMuted, fontSize: 11, textAlign: 'center', marginTop: 2 },
    section: { gap: theme.space.sm },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
      marginTop: theme.space.sm,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingVertical: 6 },
    rowBody: { flex: 1, minWidth: 0 },
    rowName: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', flex: 1, minWidth: 0 },
    rowMeta: { color: theme.textMuted, fontSize: theme.type.caption.size, marginTop: 1 },
    wonBadge: { color: theme.success, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    loading: { marginVertical: theme.space.lg },
    empty: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center' },
  })
