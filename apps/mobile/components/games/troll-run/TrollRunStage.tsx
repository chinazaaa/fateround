/**
 * Troll Run — the on-phone stage.
 *
 * The simulation is the same one the web build runs (`@fateround/shared/troll-run-engine`): same
 * physics constants, same traps, same generated levels, so a phone and a laptop in the same race
 * are running identical geometry and their ghosts line up.
 *
 * What differs is how a frame reaches the screen. Web paints a 320×180 canvas; there is no canvas
 * here, so the stage is split in two:
 *
 *  - **the level** is one `react-native-svg` tree, re-rendered only when the geometry actually
 *    changes (a new level, or a fake floor giving way). That is a handful of renders per round
 *    rather than sixty a second.
 *  - **the actors** — runner, door, ghosts, hazards, particles — are pooled `Animated.View`s
 *    reading Reanimated shared values. The engine writes those values from its own loop and the
 *    styles are recomputed on the UI thread, so nothing about a moving runner passes through
 *    React's reconciler.
 *
 * The pools are fixed size on purpose: allocating views mid-race is exactly the sort of hitch a
 * precision platformer cannot absorb. Overflow is dropped, which for particles is invisible and
 * for ghosts cannot happen (six runners max, five of them ghosts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg'
import {
  getPlayerGhostColor,
  THEMES,
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_PHYSICS,
  TROLL_RUN_TILE_SIZE,
  TrollRunEngine,
  TrollRunTileType,
  type EngineCallbacks,
  type GhostPositionPayload,
  type RenderTheme,
  type TrollRunFrame,
  type TrollRunHudState,
  type TrollRunLevel,
} from '@fateround/shared/troll-run-engine'
import { useThemedStyles } from '@/constants/theme-context'
import type { Theme } from '@/constants/theme'
import { useHaptic } from '@/hooks/useHaptic'

/** Ghost pool size — Troll Run seats six runners, so five of them can be someone else. */
const GHOST_SLOTS = 5
/** Hazard pool. No authored or generated level carries more moving entities than this. */
const ENTITY_SLOTS = 8
/** Particle pool. A death poof emits 16; the rest of the budget covers overlap with dust. */
const PARTICLE_SLOTS = 24

type ThemeName = 'dark' | 'retro' | 'neon'

interface ActorSlot {
  x: number
  y: number
  w: number
  h: number
  color: string
  opacity: number
}

const EMPTY_SLOT: ActorSlot = { x: 0, y: 0, w: 0, h: 0, color: 'transparent', opacity: 0 }
const emptySlots = (count: number): ActorSlot[] => Array.from({ length: count }, () => EMPTY_SLOT)

/**
 * Every write to a shared value is copied across to the UI thread, so a frame that changes nothing
 * should cost nothing. Most frames have no particles, no hazards and a door that has not moved —
 * skipping those writes is the difference between five cross-thread copies a frame and one.
 */
function slotsEqual(a: readonly ActorSlot[], b: readonly ActorSlot[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!
    const right = b[i]!
    if (
      left.x !== right.x ||
      left.y !== right.y ||
      left.w !== right.w ||
      left.h !== right.h ||
      left.opacity !== right.opacity ||
      left.color !== right.color
    ) {
      return false
    }
  }
  return true
}

export interface TrollRunStageProps {
  levels: TrollRunLevel[]
  initialLevelIndex?: number
  playerId?: string
  playerName?: string
  /** False freezes the simulation without discarding round progress (countdown, round finished). */
  active?: boolean
  theme?: ThemeName
  onDeath?: (levelId: string, levelName: string, deaths: number) => void
  onLevelClear?: (levelId: string, levelName: string, timeMs: number, deaths: number) => void
  onAllLevelsCleared?: (totalTimeMs: number, totalDeaths: number) => void
  onPlayerPosition?: (position: GhostPositionPayload) => void
  /**
   * Handed the live engine on mount and `null` on teardown. Peer positions arrive ~20 times a
   * second per runner and are pushed straight in rather than through React state.
   */
  onEngineReady?: (engine: TrollRunEngine | null) => void
}

/**
 * A cheap fingerprint of the level geometry. The engine mutates its tile grid in place when a fake
 * floor collapses and moves the door by tween, so identity comparison sees nothing; this is what
 * tells the static layer it is stale. Reading 220 ints a frame is far cheaper than the alternative,
 * which is re-rendering the SVG tree sixty times a second in case something moved.
 */
function levelSignature(level: TrollRunLevel): string {
  let sum = 0
  let mix = 0
  for (let row = 0; row < level.tiles.length; row++) {
    const cells = level.tiles[row]
    if (!cells) continue
    for (let col = 0; col < cells.length; col++) {
      const tile = cells[col] ?? 0
      sum += tile
      // Position-sensitive so two tiles swapping places is not mistaken for no change at all.
      mix = (mix + tile * (row * 31 + col + 1)) % 2147483647
    }
  }
  return `${level.id}:${sum}:${mix}`
}

/** Which tiles fill their cell, and which of them read as the same material — mirrors the web renderer. */
function massGroup(tile: number | undefined): 0 | 1 | 2 | 3 {
  switch (tile) {
    case TrollRunTileType.SOLID:
    // A collapsing floor has to be indistinguishable from a real one or the trap does not work.
    case TrollRunTileType.FAKE_SOLID:
      return 1
    case TrollRunTileType.ICE:
      return 2
    case TrollRunTileType.BOUNCE:
      return 3
    default:
      return 0
  }
}

function massPalette(group: 1 | 2 | 3, palette: RenderTheme) {
  return group === 2 ? palette.ice : group === 3 ? palette.bounce : palette.solid
}

/** The four spike orientations as a triangle pointing away from the surface it grows out of. */
function spikePoints(tile: number, x: number, y: number, size: number): string {
  const inset = 2
  switch (tile) {
    case TrollRunTileType.SPIKE_DOWN:
      return `${x + inset},${y} ${x + size - inset},${y} ${x + size / 2},${y + size - inset}`
    case TrollRunTileType.SPIKE_LEFT:
      return `${x + size},${y + inset} ${x + size},${y + size - inset} ${x + inset},${y + size / 2}`
    case TrollRunTileType.SPIKE_RIGHT:
      return `${x},${y + inset} ${x},${y + size - inset} ${x + size - inset},${y + size / 2}`
    default:
      return `${x + inset},${y + size} ${x + size - inset},${y + size} ${x + size / 2},${y + inset}`
  }
}

/**
 * The level geometry. Memoized on the signature so a frame that changed nothing structural costs
 * one string comparison instead of an SVG rebuild.
 */
const StaticLevel = ({ level, palette }: { level: TrollRunLevel; palette: RenderTheme }) => {
  const size = TROLL_RUN_TILE_SIZE
  const nodes: React.ReactNode[] = []

  for (let row = 0; row < level.tiles.length; row++) {
    const cells = level.tiles[row]
    if (!cells) continue
    for (let col = 0; col < cells.length; col++) {
      const tile = cells[col]
      const x = col * size
      const y = row * size
      const group = massGroup(tile)

      if (group !== 0) {
        const mat = massPalette(group, palette)
        // Outlines and the lit top face are drawn only where the mass ends, so a run of touching
        // tiles reads as one platform rather than a row of boxes — the same rule as web.
        const openUp = massGroup(level.tiles[row - 1]?.[col]) !== group
        nodes.push(<Rect key={`m${row}.${col}`} x={x} y={y} width={size} height={size} fill={mat.body} />)
        if (openUp) {
          nodes.push(<Rect key={`t${row}.${col}`} x={x} y={y} width={size} height={3} fill={mat.top} />)
        }
        if (massGroup(level.tiles[row + 1]?.[col]) !== group) {
          nodes.push(<Rect key={`b${row}.${col}`} x={x} y={y + size - 2} width={size} height={2} fill={mat.shade} />)
        }
        if (massGroup(cells[col - 1]) !== group) {
          nodes.push(<Rect key={`l${row}.${col}`} x={x} y={y} width={1} height={size} fill={mat.edge} />)
        }
        if (massGroup(cells[col + 1]) !== group) {
          nodes.push(<Rect key={`r${row}.${col}`} x={x + size - 1} y={y} width={1} height={size} fill={mat.edge} />)
        }
        continue
      }

      if (tile === TrollRunTileType.COIN) {
        nodes.push(
          <Circle key={`c${row}.${col}`} cx={x + size / 2} cy={y + size / 2} r={3.5} fill={palette.coin.body} />
        )
        nodes.push(
          <Circle key={`cl${row}.${col}`} cx={x + size / 2 - 1} cy={y + size / 2 - 1} r={1.2} fill={palette.coin.lit} />
        )
        continue
      }

      if (
        tile === TrollRunTileType.SPIKE_UP ||
        tile === TrollRunTileType.SPIKE_DOWN ||
        tile === TrollRunTileType.SPIKE_LEFT ||
        tile === TrollRunTileType.SPIKE_RIGHT
      ) {
        nodes.push(<Polygon key={`s${row}.${col}`} points={spikePoints(tile, x, y, size)} fill={palette.spike.body} />)
      }
    }
  }

  return (
    <Svg
      width={TROLL_RUN_INTERNAL_WIDTH}
      height={TROLL_RUN_INTERNAL_HEIGHT}
      viewBox={`0 0 ${TROLL_RUN_INTERNAL_WIDTH} ${TROLL_RUN_INTERNAL_HEIGHT}`}
      pointerEvents="none"
    >
      {/* Faint grid, so a wide empty room still reads as a room. */}
      {Array.from({ length: TROLL_RUN_INTERNAL_HEIGHT / size }, (_, i) => (
        <Line
          key={`gh${i}`}
          x1={0}
          y1={i * size}
          x2={TROLL_RUN_INTERNAL_WIDTH}
          y2={i * size}
          stroke={palette.bgGrid}
          strokeWidth={0.5}
        />
      ))}
      {nodes}
    </Svg>
  )
}

export function TrollRunStage({
  levels,
  initialLevelIndex = 0,
  playerId = '',
  playerName = '',
  active = true,
  theme = 'dark',
  onDeath,
  onLevelClear,
  onAllLevelsCleared,
  onPlayerPosition,
  onEngineReady,
}: TrollRunStageProps) {
  const styles = useThemedStyles(makeStyles)
  const haptic = useHaptic()
  const palette = THEMES[theme] ?? THEMES.dark!

  const engineRef = useRef<TrollRunEngine | null>(null)
  const [scale, setScale] = useState(1)
  const [hud, setHud] = useState<TrollRunHudState | null>(null)
  const [pressed, setPressed] = useState({ left: false, right: false, jump: false })

  // The level as the engine currently has it — collapsed floors included, which is why this is
  // state rather than the `levels` prop.
  const [liveLevel, setLiveLevel] = useState<TrollRunLevel | null>(null)
  const signatureRef = useRef('')

  const player = useSharedValue<ActorSlot>(EMPTY_SLOT)
  const door = useSharedValue<ActorSlot>(EMPTY_SLOT)
  const ghosts = useSharedValue<ActorSlot[]>(emptySlots(GHOST_SLOTS))
  const entities = useSharedValue<ActorSlot[]>(emptySlots(ENTITY_SLOTS))
  const particles = useSharedValue<ActorSlot[]>(emptySlots(PARTICLE_SLOTS))
  // Ghost name tags are text, so they cannot live in a worklet-driven style. They change only when
  // someone joins, leaves or moves to another level, which is rare enough for React state.
  const [ghostTags, setGhostTags] = useState<{ label: string; color: string }[]>([])
  const ghostTagKeyRef = useRef('')

  // Handlers are read through a ref so the engine — built once, for the life of the round — never
  // has to be torn down because a parent re-rendered with a new closure.
  const handlers = useRef({ onDeath, onLevelClear, onAllLevelsCleared, onPlayerPosition })
  handlers.current = { onDeath, onLevelClear, onAllLevelsCleared, onPlayerPosition }

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width
    if (width > 0) setScale(width / TROLL_RUN_INTERNAL_WIDTH)
  }, [])

  // Keyed on level identity rather than array identity: a realtime row update hands down a fresh
  // array every time, and rebuilding the engine on that would restart the round mid-race.
  const levelsKey = levels.map((level) => level.id).join('|')

  useEffect(() => {
    if (levels.length === 0) return

    const callbacks: EngineCallbacks = {
      onDeath: (levelId, levelName, deaths) => handlers.current.onDeath?.(levelId, levelName, deaths),
      onLevelClear: (levelId, levelName, timeMs, deaths) =>
        handlers.current.onLevelClear?.(levelId, levelName, timeMs, deaths),
      onAllLevelsCleared: (totalMs, deaths) => handlers.current.onAllLevelsCleared?.(totalMs, deaths),
      onPlayerPosition: (position) => handlers.current.onPlayerPosition?.(position),
      onHudChange: (next) =>
        setHud((prev) =>
          prev &&
          prev.levelIndex === next.levelIndex &&
          prev.levelName === next.levelName &&
          prev.controlsInverted === next.controlsInverted &&
          prev.gravityInverted === next.gravityInverted
            ? prev
            : { ...next }
        ),
    }

    const engine = new TrollRunEngine(levels, callbacks)
    engine.setPlayerIdentity(playerId, playerName)
    engine.setRenderTarget({
      render: (frame: TrollRunFrame) => {
        const signature = levelSignature(frame.level)
        if (signature !== signatureRef.current) {
          signatureRef.current = signature
          // Snapshot the grid: the engine keeps mutating its own copy, and a static layer holding
          // that reference would silently show the next frame's geometry without re-rendering.
          setLiveLevel({ ...frame.level, tiles: frame.level.tiles.map((row) => [...row]) })
        }

        const runner = frame.player
        player.value = {
          x: runner.x,
          y: runner.y,
          w: runner.width,
          h: runner.height,
          color: palette.player.body,
          // A cleared runner is walking into the door and dissolving; a dead one is gone.
          opacity: !runner.alive ? 0 : Math.max(0, 1 - runner.doorEntryProgress),
        }

        // The door only moves when a trap drags it, which is a handful of frames per level.
        // `w === 0` is the un-drawn initial slot, which matters for a level whose door happens to
        // sit at the origin: comparing coordinates alone would leave it at zero size forever.
        if (door.value.w === 0 || door.value.x !== frame.level.door.x || door.value.y !== frame.level.door.y) {
          door.value = {
            x: frame.level.door.x,
            y: frame.level.door.y,
            w: TROLL_RUN_DOOR_WIDTH,
            h: TROLL_RUN_DOOR_HEIGHT,
            color: palette.door.body,
            opacity: 1,
          }
        }

        const nextGhosts = emptySlots(GHOST_SLOTS)
        const visible = frame.ghosts.slice(0, GHOST_SLOTS)
        for (let i = 0; i < visible.length; i++) {
          const ghost = visible[i]!
          nextGhosts[i] = {
            x: ghost.x,
            y: ghost.y,
            w: TROLL_RUN_PHYSICS.PLAYER_WIDTH,
            h: TROLL_RUN_PHYSICS.PLAYER_HEIGHT,
            color: ghost.color,
            opacity: ghost.alive ? 0.55 : 0.2,
          }
        }
        if (!slotsEqual(ghosts.value, nextGhosts)) ghosts.value = nextGhosts

        const tagKey = visible.map((ghost) => `${ghost.playerId}:${ghost.color}`).join(',')
        if (tagKey !== ghostTagKeyRef.current) {
          ghostTagKeyRef.current = tagKey
          setGhostTags(
            visible.map((ghost) => ({
              label: (ghost.playerName || '?').slice(0, 2).toUpperCase(),
              color: ghost.color,
            }))
          )
        }

        const nextEntities = emptySlots(ENTITY_SLOTS)
        for (let i = 0; i < Math.min(frame.entities.length, ENTITY_SLOTS); i++) {
          const entity = frame.entities[i]!
          nextEntities[i] = {
            x: entity.x,
            y: entity.y,
            w: entity.w,
            h: entity.h,
            color: entity.killsOnTouch ? palette.hazard.body : palette.block.body,
            opacity: 1,
          }
        }
        if (!slotsEqual(entities.value, nextEntities)) entities.value = nextEntities

        const nextParticles = emptySlots(PARTICLE_SLOTS)
        for (let i = 0; i < Math.min(frame.particles.length, PARTICLE_SLOTS); i++) {
          const particle = frame.particles[i]!
          nextParticles[i] = {
            x: particle.x - particle.size / 2,
            y: particle.y - particle.size / 2,
            w: particle.size,
            h: particle.size,
            color: particle.color,
            opacity: Math.max(0, particle.life / particle.maxLife),
          }
        }
        if (!slotsEqual(particles.value, nextParticles)) particles.value = nextParticles
      },
    })
    engine.start(initialLevelIndex)

    engineRef.current = engine
    onEngineReady?.(engine)

    return () => {
      engine.destroy()
      engineRef.current = null
      signatureRef.current = ''
      ghostTagKeyRef.current = ''
      onEngineReady?.(null)
    }
    // `levelsKey`, not `levels` — see above. `palette` is read inside the render target and is
    // stable for a given theme, so it is keyed by name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelsKey, playerId, playerName, initialLevelIndex, theme])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (active) engine.resume()
    else engine.pause()
  }, [active])

  const setControl = useCallback(
    (control: 'left' | 'right' | 'jump', down: boolean) => {
      engineRef.current?.setVirtualInput(control, down)
      setPressed((prev) => (prev[control] === down ? prev : { ...prev, [control]: down }))
      if (down && control === 'jump') haptic('light')
    },
    [haptic]
  )

  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: player.value.x }, { translateY: player.value.y }],
    width: player.value.w,
    height: player.value.h,
    opacity: player.value.opacity,
  }))

  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: door.value.x }, { translateY: door.value.y }],
    width: door.value.w,
    height: door.value.h,
    opacity: door.value.opacity,
  }))

  const ghostIndexes = useMemo(() => Array.from({ length: GHOST_SLOTS }, (_, i) => i), [])
  const entityIndexes = useMemo(() => Array.from({ length: ENTITY_SLOTS }, (_, i) => i), [])
  const particleIndexes = useMemo(() => Array.from({ length: PARTICLE_SLOTS }, (_, i) => i), [])

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.stageOuter, { height: TROLL_RUN_INTERNAL_HEIGHT * scale, backgroundColor: palette.bgBottom }]}
        onLayout={onStageLayout}
      >
        <View style={[styles.stage, { transform: [{ scale }] }]}>
          {liveLevel ? <StaticLevel level={liveLevel} palette={palette} /> : null}

          {particleIndexes.map((index) => (
            <PooledActor key={`p${index}`} slots={particles} index={index} />
          ))}
          {entityIndexes.map((index) => (
            <PooledActor key={`e${index}`} slots={entities} index={index} radius={1} />
          ))}

          <Animated.View style={[styles.actor, styles.door, { backgroundColor: palette.door.body }, doorStyle]} />

          {ghostIndexes.map((index) => (
            <PooledActor key={`g${index}`} slots={ghosts} index={index} radius={2} />
          ))}

          <Animated.View style={[styles.actor, styles.runner, { borderColor: palette.player.outline }, playerStyle]}>
            <View style={[styles.runnerTop, { backgroundColor: palette.player.top }]} />
          </Animated.View>
        </View>
      </View>

      {/* Trap warnings. These are text, so they live outside the stage where they stay crisp. */}
      <View style={styles.hudRow}>
        {hud?.levelName ? <Text style={styles.levelName}>{hud.levelName}</Text> : <View />}
        <View style={styles.warnings}>
          {hud?.controlsInverted ? <Text style={styles.warning}>↔ Controls flipped</Text> : null}
          {hud?.gravityInverted ? <Text style={styles.warning}>↕ Gravity flipped</Text> : null}
        </View>
      </View>

      {ghostTags.length > 0 ? (
        <View style={styles.ghostLegend}>
          {ghostTags.map((tag, index) => (
            <View key={`${tag.label}-${index}`} style={styles.ghostTag}>
              <View style={[styles.ghostDot, { backgroundColor: tag.color }]} />
              <Text style={styles.ghostTagText}>{tag.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.controls}>
        <ControlButton
          label="◀"
          accessibilityLabel="Move left"
          active={pressed.left}
          onPress={setControl}
          control="left"
        />
        <ControlButton
          label="▶"
          accessibilityLabel="Move right"
          active={pressed.right}
          onPress={setControl}
          control="right"
        />
        <ControlButton
          label="▲"
          accessibilityLabel="Jump"
          accent
          active={pressed.jump}
          onPress={setControl}
          control="jump"
        />
      </View>
    </View>
  )
}

/**
 * One slot of a pooled actor layer. Its own `useAnimatedStyle` reads only its index, so a frame
 * that touches one particle does not recompute the other twenty-three.
 */
function PooledActor({ slots, index, radius = 0 }: { slots: { value: ActorSlot[] }; index: number; radius?: number }) {
  const style = useAnimatedStyle(() => {
    const slot = slots.value[index] ?? EMPTY_SLOT
    return {
      transform: [{ translateX: slot.x }, { translateY: slot.y }],
      width: slot.w,
      height: slot.h,
      opacity: slot.opacity,
      backgroundColor: slot.color,
    }
  })
  return <Animated.View pointerEvents="none" style={[stageActorBase, { borderRadius: radius }, style]} />
}

const stageActorBase = { position: 'absolute' as const, left: 0, top: 0 }

/**
 * A control pad button. Press and release both have to land — a missed release leaves the runner
 * walking into a spike — so cancel and the out-of-bounds release are wired to the same handler.
 */
function ControlButton({
  label,
  accessibilityLabel,
  control,
  active,
  accent = false,
  onPress,
}: {
  label: string
  accessibilityLabel: string
  control: 'left' | 'right' | 'jump'
  active: boolean
  accent?: boolean
  onPress: (control: 'left' | 'right' | 'jump', down: boolean) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={[styles.controlButton, accent && styles.controlButtonAccent, active && styles.controlButtonActive]}
      onPressIn={() => onPress(control, true)}
      onPressOut={() => onPress(control, false)}
      onTouchCancel={() => onPress(control, false)}
    >
      <Text style={[styles.controlLabel, accent && styles.controlLabelAccent]}>{label}</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { width: '100%', gap: theme.space.sm },
    stageOuter: {
      width: '100%',
      overflow: 'hidden',
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
    },
    stage: {
      width: TROLL_RUN_INTERNAL_WIDTH,
      height: TROLL_RUN_INTERNAL_HEIGHT,
      transformOrigin: 'top left',
    },
    actor: { position: 'absolute', left: 0, top: 0 },
    door: { borderRadius: 2 },
    runner: { borderRadius: 2, borderWidth: 1, overflow: 'hidden' },
    runnerTop: { height: 3, width: '100%' },
    hudRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    levelName: {
      color: theme.textMuted,
      fontSize: theme.type.caption.size,
      fontWeight: '700',
      flexShrink: 1,
    },
    warnings: { flexDirection: 'row', gap: theme.space.xs },
    warning: {
      color: theme.error,
      fontSize: theme.type.caption.size,
      fontWeight: '800',
    },
    ghostLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs },
    ghostTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.surface,
    },
    ghostDot: { width: 6, height: 6, borderRadius: 3 },
    ghostTagText: { color: theme.textMuted, fontSize: 10, fontWeight: '700' },
    controls: { flexDirection: 'row', gap: theme.space.sm },
    controlButton: {
      flex: 1,
      height: 62,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    controlButtonAccent: { backgroundColor: theme.primary, borderColor: theme.primary },
    controlButtonActive: { borderColor: theme.primary, opacity: 0.85 },
    controlLabel: { color: theme.text, fontSize: 22, fontWeight: '800' },
    controlLabelAccent: { color: theme.bg },
  })

export { getPlayerGhostColor }
