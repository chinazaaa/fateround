import { useEffect, useRef, useState } from 'react'
import { Animated, PanResponder, StyleSheet, View } from 'react-native'
import { MahjongTileFace } from './MahjongTileFace'

export type PondRect = { x: number; y: number; width: number; height: number }

/**
 * A hand tile that supports both tap-to-discard and drag-to-discard, mirroring
 * the web draggable tile + center drop zone. A short tap discards immediately
 * (same as before); a drag lets the player fling the tile onto the measured
 * center pond ("discard") drop target. Uses a single PanResponder + a shared
 * Animated.ValueXY translate (plus a light scale) — no extra gesture deps.
 */
export function DraggableHandTile({
  tile,
  enabled,
  getPondRect,
  onDiscard,
  onDragStart,
  onDragEnd,
  onDragOverChange,
}: {
  tile: string
  enabled: boolean
  getPondRect: () => PondRect | null
  onDiscard: (tile: string) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverChange: (over: boolean) => void
}) {
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const scale = useRef(new Animated.Value(1)).current
  const [dragging, setDragging] = useState(false)

  // Keep the latest props reachable from the PanResponder closures, which are
  // created once. Without this the responder would capture stale `enabled` /
  // callbacks from the first render.
  const latest = useRef({ enabled, getPondRect, onDiscard, onDragStart, onDragEnd, onDragOverChange })
  useEffect(() => {
    latest.current = { enabled, getPondRect, onDiscard, onDragStart, onDragEnd, onDragOverChange }
  })

  const overRef = useRef(false)
  const movedRef = useRef(false)

  const inPond = (x: number, y: number) => {
    const r = latest.current.getPondRect()
    if (!r) return false
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
  }

  const setOver = (over: boolean) => {
    if (over === overRef.current) return
    overRef.current = over
    latest.current.onDragOverChange(over)
  }

  const reset = () => {
    setDragging(false)
    setOver(false)
    latest.current.onDragEnd()
    Animated.parallel([
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }),
    ]).start()
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.enabled,
      onMoveShouldSetPanResponder: (_e, g) =>
        latest.current.enabled && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
      onPanResponderGrant: () => {
        movedRef.current = false
        setDragging(true)
        latest.current.onDragStart()
        Animated.spring(scale, { toValue: 1.14, useNativeDriver: true, friction: 6 }).start()
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) movedRef.current = true
        pos.setValue({ x: g.dx, y: g.dy })
        setOver(inPond(g.moveX, g.moveY))
      },
      onPanResponderRelease: (_e, g) => {
        const over = inPond(g.moveX, g.moveY)
        const wasTap = !movedRef.current
        reset()
        if (over || wasTap) latest.current.onDiscard(tile)
      },
      onPanResponderTerminate: () => reset(),
    })
  ).current

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        dragging ? styles.dragging : null,
        { transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }] },
      ]}
    >
      <MahjongTileFace tile={tile} selected={enabled} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Raise the actively-dragged tile above its neighbours while it floats.
  dragging: { zIndex: 20, elevation: 8 },
})
