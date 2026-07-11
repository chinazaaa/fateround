import { StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function CardTableArea({
  topCard,
  pileCount,
  hint,
  /** Deck-back accent colour (defaults to a neutral slate). */
  drawAccent = '#2563eb',
}: {
  topCard: ReactNode
  pileCount?: number
  hint?: string | null
  drawAccent?: string
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <View style={styles.felt}>
        <View style={styles.pileCol}>
          <View style={styles.drawStack}>
            {/* stacked backs for depth */}
            <View style={[styles.cardBack, styles.stackBack2, { borderColor: drawAccent }]} />
            <View style={[styles.cardBack, styles.stackBack1, { borderColor: drawAccent }]} />
            <View style={[styles.cardBack, { backgroundColor: drawAccent }]}>
              <View style={styles.cardBackInner} />
            </View>
            {pileCount != null ? (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{pileCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.pileLabel}>Draw</Text>
        </View>

        <View style={styles.pileCol}>
          <View style={styles.discard}>{topCard}</View>
          <Text style={styles.pileLabel}>Discard</Text>
        </View>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const CARD_W = 60
const CARD_H = 86

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  felt: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 44,
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  pileCol: { alignItems: 'center', gap: 8 },
  drawStack: {
    width: CARD_W,
    height: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBack: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackBack1: { transform: [{ translateX: 3 }, { translateY: -3 }], opacity: 0.55 },
  stackBack2: { transform: [{ translateX: 6 }, { translateY: -6 }], opacity: 0.3 },
  cardBackInner: {
    width: '62%',
    height: '68%',
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  countBadge: {
    position: 'absolute',
    bottom: -8,
    backgroundColor: '#000',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 26,
    alignItems: 'center',
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  discard: { width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' },
  pileLabel: {
    color: theme.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: {
    color: '#fcd34d',
    fontWeight: '700',
    textAlign: 'center',
  },
})
