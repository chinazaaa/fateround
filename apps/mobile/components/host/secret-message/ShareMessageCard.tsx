import { StyleSheet, Text, View } from 'react-native'
import { shareDomain } from '@/lib/config'

/**
 * Branded 1:1 story card for a single secret message, captured to a PNG via
 * react-native-view-shot and native-shared. Mirrors the web ShareMessageCard
 * (src/lib/share-message-image.tsx): dark background, rose glow accents,
 * game title, the message with dynamic font sizing, and the brand footer.
 * Rendered off-screen at CARD_SIZE and snapshotted.
 */

export const CARD_SIZE = 540

function messageFontSize(text: string): number {
  const len = text.trim().length
  // Web sizes are for a 1080px card; halved here for the 540px render.
  if (len > 200) return 17
  if (len > 120) return 20
  if (len > 60) return 23
  if (len > 30) return 26
  return 29
}

export function ShareMessageCard({
  messageText,
  gameTitle,
  headerEmoji = '💌✨',
}: {
  messageText: string
  gameTitle: string
  headerEmoji?: string
}) {
  const fontSize = messageFontSize(messageText)

  return (
    <View style={styles.card}>
      {/* Approximate the web radial glows with translucent accent blobs. */}
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <View style={styles.center}>
        <View style={styles.panel}>
          <Text style={styles.headerEmoji}>{headerEmoji}</Text>
          <Text style={styles.gameTitle} numberOfLines={2}>
            {gameTitle}
          </Text>
          <View style={styles.divider} />
          <Text style={[styles.message, { fontSize }]}>{messageText.trim()}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Text style={styles.brand}>{shareDomain()}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    backgroundColor: '#08080f',
    overflow: 'hidden',
    paddingHorizontal: 40,
    paddingTop: 40,
    paddingBottom: 40,
  },
  glowTop: {
    position: 'absolute',
    top: -140,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(244, 63, 94, 0.16)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(22, 22, 34, 0.94)',
    paddingHorizontal: 28,
    paddingVertical: 34,
    alignItems: 'center',
  },
  headerEmoji: { fontSize: 34, marginBottom: 12 },
  gameTitle: {
    color: '#f43f5e',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  divider: {
    height: 1,
    width: 64,
    backgroundColor: 'rgba(244, 63, 94, 0.45)',
    marginVertical: 20,
  },
  message: {
    color: '#f2f2f8',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: undefined,
  },
  footer: { alignItems: 'center', gap: 14 },
  footerLine: {
    height: 1,
    width: 88,
    backgroundColor: 'rgba(244, 63, 94, 0.5)',
  },
  brand: {
    color: '#5c5c78',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
})
