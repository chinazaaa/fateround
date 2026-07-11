import { ReactNode } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game } from '@fateround/shared'
import { gameWebUrl } from '@/lib/config'
import { gameLabel } from '@/lib/mobile-registry'
import { gameHasMobileVoice } from '@/lib/voice-games'
import { VoiceRail } from '@/components/voice/VoiceRail'
import { HeaderAction } from '@/components/ui/HeaderAction'
import { theme } from '@/constants/theme'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  children: ReactNode
}

export function HostChrome({ gameCode, hostToken, game, children }: Props) {
  const router = useRouter()
  const code = gameCode.toUpperCase()
  const typeLabel = gameLabel(game.game_type)

  const onShare = async () => {
    try {
      await Share.share({
        message: `Join my game on Fate Round — code ${code}\n${gameWebUrl(gameCode)}`,
      })
    } catch {
      // dismissed
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {gameHasMobileVoice(game.game_type) ? (
        <VoiceRail gameCode={gameCode} mode="host" hostToken={hostToken} />
      ) : null}

      <View style={styles.header}>
        <View style={styles.toolbar}>
          <Pressable
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={8}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <HeaderAction label="Share code" accent onPress={() => void onShare()} />
        </View>

        <View style={styles.meta}>
          <Text style={styles.kicker}>Hosting</Text>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{code}</Text>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{typeLabel}</Text>
            </View>
          </View>
          {game.title ? (
            <Text style={styles.title} numberOfLines={2}>
              {game.title}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: theme.surfaceHover,
    paddingBottom: theme.space.md,
    gap: theme.space.md,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.xs,
    gap: theme.space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { color: theme.text, fontSize: 20, fontWeight: '600' },
  meta: {
    paddingHorizontal: theme.space.lg,
    gap: 6,
  },
  kicker: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    flexWrap: 'wrap',
  },
  code: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
  },
  typePill: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderAccent,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typePillText: {
    color: theme.primaryMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  content: { padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40 },
})
