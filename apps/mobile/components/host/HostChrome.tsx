import { ReactNode } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game } from '@fateround/shared'
import { gameWebUrl } from '@/lib/config'
import { gameLabel } from '@/lib/mobile-registry'
import { gameHasMobileVoice } from '@/lib/voice-games'
import { VoiceRail } from '@/components/voice/VoiceRail'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  children: ReactNode
}

export function HostChrome({ gameCode, hostToken, game, children }: Props) {
  const onShare = async () => {
    try {
      await Share.share({
        message: `Join my game on Fate Round — code ${gameCode.toUpperCase()}\n${gameWebUrl(gameCode)}`,
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
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Hosting · {gameLabel(game.game_type)}</Text>
          <Text style={styles.title} numberOfLines={1}>{game.title || gameCode}</Text>
        </View>
        <Pressable style={styles.shareBtn} onPress={() => void onShare()}>
          <Text style={styles.shareText}>Share</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c24',
    gap: 12,
  },
  headerText: { flex: 1 },
  eyebrow: { color: '#f43f5e', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 },
  shareBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  shareText: { color: '#fda4af', fontWeight: '700' },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
})
