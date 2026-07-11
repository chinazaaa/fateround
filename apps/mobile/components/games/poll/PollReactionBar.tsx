import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Room-wide emoji reactions for poll round results. Mirrors web `ReactionBar` —
 * a fixed supabase broadcast channel (`reactions:<code>`) shared with the web
 * client so reactions pop for everyone. Floaters rise + fade above the bar.
 */

const EMOJI = ['😂', '😱', '🔥', '💀', '👀'] as const
const TEXT_REACTIONS = ['As how?!', 'No way', 'Called it', 'Nahhh', 'FR'] as const
const ALLOWED_EMOJI = new Set<string>(EMOJI)
const ALLOWED_TEXT = new Set<string>(TEXT_REACTIONS)

type Floater = { id: number; kind: 'emoji' | 'text'; content: string; x: number; anim: Animated.Value }

function randomX() {
  return 10 + Math.random() * 80
}

type Props = { gameCode: string; playerId?: string | null }

export function PollReactionBar({ gameCode, playerId }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [floaters, setFloaters] = useState<Floater[]>([])
  const idRef = useRef(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const addFloater = useCallback((kind: 'emoji' | 'text', content: string, x: number) => {
    const id = idRef.current++
    const anim = new Animated.Value(0)
    setFloaters((prev) => [...prev, { id, kind, content, x, anim }])
    Animated.timing(anim, {
      toValue: 1,
      duration: kind === 'text' ? 1100 : 900,
      useNativeDriver: true,
    }).start(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id))
    })
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    const channel = supabase.channel(`reactions:${gameCode}`, {
      config: { broadcast: { self: false } },
    })
    channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const x = typeof payload?.x === 'number' ? payload.x : randomX()
      const text = typeof payload?.text === 'string' ? payload.text : ''
      if (text && ALLOWED_TEXT.has(text)) {
        addFloater('text', text, x)
        return
      }
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji : ''
      if (ALLOWED_EMOJI.has(emoji)) addFloater('emoji', emoji, x)
    })
    channel.subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [gameCode, addFloater])

  const broadcast = useCallback(
    (payload: { emoji?: string; text?: string; x: number }) => {
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { ...payload, playerId: playerId ?? null },
      })
    },
    [playerId]
  )

  const pop = useCallback(
    (kind: 'emoji' | 'text', content: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(content)) next.delete(content)
        else next.add(content)
        return next
      })
      const x = randomX()
      addFloater(kind, content, x)
      broadcast(kind === 'emoji' ? { emoji: content, x } : { text: content, x })
    },
    [addFloater, broadcast]
  )

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.floaterLayer}>
        {floaters.map((f) => {
          const translateY = f.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -130] })
          const opacity = f.anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] })
          const scale = f.anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] })
          return (
            <Animated.View
              key={f.id}
              style={[
                styles.floater,
                { left: `${f.x}%`, opacity, transform: [{ translateY }, { scale }] },
              ]}
            >
              {f.kind === 'emoji' ? (
                <Text style={styles.floaterEmoji}>{f.content}</Text>
              ) : (
                <Text style={styles.floaterText}>{f.content}</Text>
              )}
            </Animated.View>
          )
        })}
      </View>
      <View style={styles.emojiRow}>
        {EMOJI.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => pop('emoji', emoji)}
            style={[styles.emojiBtn, selected.has(emoji) && styles.emojiBtnActive]}
            hitSlop={6}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.textRow}>
        {TEXT_REACTIONS.map((text) => (
          <Pressable
            key={text}
            onPress={() => pop('text', text)}
            style={[styles.textBtn, selected.has(text) && styles.textBtnActive]}
          >
            <Text style={[styles.textBtnLabel, selected.has(text) && styles.textBtnLabelActive]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 10, marginTop: 4 },
    floaterLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: -130,
      height: 160,
      zIndex: 10,
    },
    floater: { position: 'absolute', bottom: 0 },
    floaterEmoji: { fontSize: 30 },
    floaterText: {
      backgroundColor: theme.primary,
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      overflow: 'hidden',
    },
    emojiRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    emojiBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: theme.border,
    },
    emojiBtnActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    emoji: { fontSize: 20 },
    textRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
    textBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    textBtnActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    textBtnLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    textBtnLabelActive: { color: theme.primaryMuted },
  })
