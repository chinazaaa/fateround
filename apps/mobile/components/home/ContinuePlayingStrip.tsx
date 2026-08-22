import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import { gameLabel } from '@/lib/mobile-registry'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import type { GameType } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * "Continue playing" — the games you're in the middle of, started on ANY device.
 *
 * WHY. The Recent list below this is LOCAL: it reads `recent-games` out of SecureStore, so a
 * game started on your phone is invisible on your laptop even though both are signed into the
 * same account. That is the gap this closes — you see it on your phone, your iPad and the web,
 * and pick it up wherever you are.
 *
 * Tapping resumes on THIS device, and where that goes depends on the role the server reports:
 * a host lands on `/host/<code>`, which takes the host token back via `/reclaim-host`; a player
 * lands on `/game/<code>`, which continues their seat. Both paths already exist — this strip is
 * what makes them findable without hunting for the game code.
 *
 * Renders nothing for a guest, or when nothing is live: an empty "Continue playing" heading is
 * worse than no heading.
 */

type ActiveGame = {
  code: string
  gameType: string
  title: string | null
  status: string
  role: 'host' | 'player'
}

export function ContinuePlayingStrip() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const [games, setGames] = useState<ActiveGame[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/profile/active-games'), {
        headers: (await authHeaders()) ?? undefined,
      })
      if (!res.ok) return
      const json = (await res.json()) as { games?: ActiveGame[] }
      setGames(json.games ?? [])
    } catch {
      // Keep whatever is on screen. A failed poll must never blank a list of live games.
    }
  }, [])

  // A game can start, end, or be joined on the other device while this screen sits open, so
  // re-read on focus and on app resume rather than once on mount.
  useRefreshOnFocus(load)

  if (games.length === 0) return null

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>Continue playing</Text>
      <SurfaceCard padding={0} gap={0}>
        {games.map((game, i) => (
          <ListRow
            key={game.code}
            onPress={() => router.push((game.role === 'host' ? `/host/${game.code}` : `/game/${game.code}`) as never)}
            divider={i < games.length - 1}
            left={
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{game.code.slice(0, 2)}</Text>
              </View>
            }
            title={<Text style={styles.code}>{game.title?.trim() || game.code}</Text>}
            subtitle={`${gameLabel(game.gameType as GameType)} · ${
              game.status === 'waiting' ? 'In the lobby' : 'In progress'
            }${game.role === 'host' ? ' · hosting' : ''}`}
            right={<Text style={styles.chevron}>›</Text>}
          />
        ))}
      </SurfaceCard>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { gap: theme.space.sm },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
    },
    badge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primarySoft,
    },
    badgeText: { color: theme.primaryMuted, fontWeight: '800', fontSize: 13 },
    code: { color: theme.text, fontWeight: '800' },
    chevron: { color: theme.textFaint, fontSize: 20 },
  })
