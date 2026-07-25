import { useCallback, useEffect, useRef, useState } from 'react'
import { Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Rect } from 'react-native-svg'
import Animated, { runOnJS, useAnimatedProps, useFrameCallback, useSharedValue } from 'react-native-reanimated'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Player, PingPongSession } from '@fateround/shared'
import { pingPongServingSide } from '@fateround/shared/ping-pong'
import { getSupabase } from '@/lib/supabase'
import { postPingPongPoint } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedRect = Animated.createAnimatedComponent(Rect)

// Table proportions mirror web's PingPongBoard.tsx exactly (400x600 logical units),
// scaled to fit the device width so the physics constants below stay in the same
// ratio as web's pixel-space math (paddle/ball size, bounce angles, speeds).
const screenWidth = Dimensions.get('window').width
const TABLE_WIDTH = Math.min(screenWidth - 32, 400)
const SCALE = TABLE_WIDTH / 400
const TABLE_HEIGHT = 600 * SCALE
const PADDLE_WIDTH = 80 * SCALE
const PADDLE_HEIGHT = 14 * SCALE
const BALL_RADIUS = 8 * SCALE
const PADDLE_MARGIN = 10 * SCALE
const INITIAL_BALL_SPEED = 4.5 * SCALE * 60 // px/sec (web's per-frame-at-60fps speed, scaled to px/sec)
const MAX_BALL_SPEED = 9 * SCALE * 60

type Ball = { x: number; y: number; vx: number; vy: number; inPlay: boolean }

function randomSign() {
  return Math.random() > 0.5 ? 1 : -1
}

function freshBall(): Ball {
  return {
    x: TABLE_WIDTH / 2,
    y: TABLE_HEIGHT / 2,
    vx: randomSign() * INITIAL_BALL_SPEED * 0.5,
    vy: randomSign() * INITIAL_BALL_SPEED,
    inPlay: false,
  }
}

type Props = {
  gameCode: string
  session: PingPongSession
  players: Player[]
  myPlayerId: string | null
  myResumeToken: string | null
  isViewer: boolean
  onPointScored?: () => void
}

/**
 * Real networked Ping Pong board — extends the physics validated in
 * PingPongPhysicsSpike.tsx (table/paddle/ball proportions, bounce-angle math)
 * with the realtime sync protocol mirrored from web's PingPongBoard.tsx:
 *
 *  - `paddle_move`: each side broadcasts its OWN paddle x, sequenced (`seq`) so a
 *    stale/out-of-order packet arriving late never rewinds the paddle.
 *  - `ball_sync`: broadcast only by whichever side currently holds "physics
 *    authority" — before a serve, the server side is authoritative; once the
 *    ball is in play, authority follows the half of the table the ball is in
 *    (bottom half → X, top half → O), i.e. whoever's paddle it's approaching
 *    computes the bounce and tells the other side what happened.
 *  - `serve`: the server posts the fresh ball state when they serve.
 *  - `point_scored` / `request_sync` / `full_sync`: point acks + late-join catch-up.
 *
 * Unlike web, this view has no WebRTC data-channel fast path (react-native-webrtc
 * isn't part of this app's dependency graph) — every event goes over the Supabase
 * broadcast channel, which is exactly web's own fallback path, so behavior matches,
 * just without the sub-frame latency win WebRTC gives web on a good connection.
 */
export function PingPongBoardView({ gameCode, session, players, myPlayerId, myResumeToken, isViewer, onPointScored }: Props) {
  const styles = useThemedStyles(makeStyles)

  const playerX = players.find((p) => p.id === session.player_x_id)
  const playerO = players.find((p) => p.id === session.player_o_id)
  const mySide: 'X' | 'O' | null =
    myPlayerId === session.player_x_id ? 'X' : myPlayerId === session.player_o_id ? 'O' : null
  const flipBoard = mySide === 'O'

  const ballX = useSharedValue(TABLE_WIDTH / 2)
  const ballY = useSharedValue(TABLE_HEIGHT / 2)
  const ballVX = useSharedValue(0)
  const ballVY = useSharedValue(0)
  const ballInPlay = useSharedValue(false)
  const paddleX = useSharedValue(TABLE_WIDTH / 2)
  const paddleO = useSharedValue(TABLE_WIDTH / 2)

  const lastTimestamp = useRef<number | null>(null)
  const rallyRef = useRef(0)
  const [rallyCount, setRallyCount] = useState(0)
  const [servingSide, setServingSide] = useState<'X' | 'O'>(
    pingPongServingSide(session.score_x, session.score_o, session.points_to_win)
  )
  const servingSideRef = useRef(servingSide)
  servingSideRef.current = servingSide
  const [lastPointScorer, setLastPointScorer] = useState<'X' | 'O' | null>(null)
  const lastPointScorerRef = useRef<'X' | 'O' | null>(null)
  lastPointScorerRef.current = lastPointScorer

  const mySideRef = useRef(mySide)
  mySideRef.current = mySide
  const isViewerRef = useRef(isViewer)
  isViewerRef.current = isViewer
  const hasOpponentRef = useRef(false)
  hasOpponentRef.current = (mySide === 'X' && !!playerO) || (mySide === 'O' && !!playerX)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const scoringRef = useRef(false)
  const broadcastSeqRef = useRef(0)
  const paddleXSeqRef = useRef(0)
  const paddleOSeqRef = useRef(0)
  const ballSyncSeqXRef = useRef(0)
  const ballSyncSeqORef = useRef(0)
  const lastPaddleBroadcastRef = useRef(0)
  const lastBallSyncRef = useRef(0)

  const sendGameEvent = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      channelRef.current?.send({ type: 'broadcast', event, payload })
    },
    []
  )

  const triggerPoint = useCallback(
    (scorer: 'X' | 'O', rally: number) => {
      if (scoringRef.current || !myResumeToken) return
      scoringRef.current = true
      ballInPlay.value = false
      setLastPointScorer(scorer)
      sendGameEvent('point_scored', { scorer })
      void postPingPongPoint(gameCode, myResumeToken, scorer, rally)
        .catch(() => undefined)
        .finally(() => {
          onPointScored?.()
          setTimeout(() => {
            scoringRef.current = false
          }, 1500)
        })
    },
    [gameCode, myResumeToken, sendGameEvent, onPointScored, ballInPlay]
  )

  const broadcastBallSync = useCallback(
    (ball: Ball, rally: number, side: 'X' | 'O') => {
      broadcastSeqRef.current += 1
      sendGameEvent('ball_sync', { ...ball, rally, seq: broadcastSeqRef.current, side })
    },
    [sendGameEvent]
  )

  // --- Handle incoming realtime events ---
  const handleGameEvent = useCallback(
    (event: string, payload: any) => {
      if (event === 'paddle_move') {
        const { side, x, seq } = payload as { side: 'X' | 'O'; x: number; seq?: number }
        if ((side !== 'X' && side !== 'O') || !Number.isFinite(x)) return
        if (typeof seq === 'number') {
          if (side === 'X') {
            if (seq <= paddleXSeqRef.current) return
            paddleXSeqRef.current = seq
          } else {
            if (seq <= paddleOSeqRef.current) return
            paddleOSeqRef.current = seq
          }
        }
        const clamped = Math.max(-PADDLE_WIDTH, Math.min(TABLE_WIDTH + PADDLE_WIDTH, x))
        if (side === 'X') paddleX.value = clamped
        else paddleO.value = clamped
      } else if (event === 'ball_sync' || event === 'full_sync') {
        const { x, y, vx, vy, inPlay, rally, seq, side } = payload as {
          x: number
          y: number
          vx: number
          vy: number
          inPlay: boolean
          rally: number
          seq?: number
          side?: string
        }
        if (typeof rally === 'number' && Number.isFinite(rally) && rally < rallyRef.current) return
        if (typeof seq === 'number' && side) {
          if (side === 'X') {
            if (seq <= ballSyncSeqXRef.current) return
            ballSyncSeqXRef.current = seq
          } else if (side === 'O') {
            if (seq <= ballSyncSeqORef.current) return
            ballSyncSeqORef.current = seq
          }
        }
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(vx) ||
          !Number.isFinite(vy) ||
          typeof inPlay !== 'boolean'
        )
          return
        ballX.value = x
        ballY.value = y
        ballVX.value = vx
        ballVY.value = vy
        ballInPlay.value = inPlay
        if (typeof rally === 'number' && Number.isFinite(rally) && rally !== rallyRef.current) {
          rallyRef.current = rally
          setRallyCount(rally)
        }
      } else if (event === 'serve') {
        const { x, y, vx, vy, inPlay } = payload as Ball
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx) || !Number.isFinite(vy)) return
        ballX.value = x
        ballY.value = y
        ballVX.value = vx
        ballVY.value = vy
        ballInPlay.value = inPlay
        rallyRef.current = 0
        setRallyCount(0)
        setLastPointScorer(null)
      } else if (event === 'request_serve') {
        if (mySideRef.current === servingSideRef.current && !ballInPlay.value && !lastPointScorerRef.current && !isViewerRef.current) {
          serveBallRef.current()
        }
      } else if (event === 'point_scored') {
        const { scorer } = payload as { scorer: 'X' | 'O' }
        if (scorer !== 'X' && scorer !== 'O') return
        ballInPlay.value = false
        setLastPointScorer(scorer)
      } else if (event === 'request_sync') {
        const { side } = payload as { side: 'X' | 'O' | 'viewer' }
        if (mySideRef.current && mySideRef.current !== side && !isViewerRef.current && session.status === 'active') {
          broadcastSeqRef.current += 1
          sendGameEvent('full_sync', {
            x: ballX.value,
            y: ballY.value,
            vx: ballVX.value,
            vy: ballVY.value,
            inPlay: ballInPlay.value,
            rally: rallyRef.current,
            paddleX: paddleX.value,
            paddleO: paddleO.value,
            seq: broadcastSeqRef.current,
            side: mySideRef.current,
          })
        }
      }
    },
    [ballX, ballY, ballVX, ballVY, ballInPlay, paddleX, paddleO, sendGameEvent, session.status]
  )

  const serveBall = useCallback(() => {
    if (ballInPlay.value || session.status === 'finished' || lastPointScorerRef.current) return
    if (mySideRef.current !== servingSideRef.current) {
      sendGameEvent('request_serve', {})
      return
    }
    const serveDir = servingSideRef.current === 'X' ? -1 : 1
    const serveX = servingSideRef.current === 'X' ? paddleX.value : paddleO.value
    const serveY =
      servingSideRef.current === 'X'
        ? TABLE_HEIGHT - (PADDLE_HEIGHT + PADDLE_MARGIN + BALL_RADIUS)
        : PADDLE_HEIGHT + PADDLE_MARGIN + BALL_RADIUS
    const ball: Ball = {
      x: serveX,
      y: serveY,
      vx: randomSign() * INITIAL_BALL_SPEED * 0.6,
      vy: serveDir * INITIAL_BALL_SPEED,
      inPlay: true,
    }
    ballX.value = ball.x
    ballY.value = ball.y
    ballVX.value = ball.vx
    ballVY.value = ball.vy
    ballInPlay.value = true
    rallyRef.current = 0
    setRallyCount(0)
    setLastPointScorer(null)
    sendGameEvent('serve', ball)
  }, [session.status, ballX, ballY, ballVX, ballVY, ballInPlay, paddleX, paddleO, sendGameEvent])

  const serveBallRef = useRef(serveBall)
  serveBallRef.current = serveBall

  // --- Touch-drag paddle control ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        if (!mySideRef.current || isViewerRef.current || session.status !== 'active') return
        let localX = evt.nativeEvent.locationX
        if (flipBoard) localX = TABLE_WIDTH - localX
        const clamped = Math.max(PADDLE_WIDTH / 2, Math.min(TABLE_WIDTH - PADDLE_WIDTH / 2, localX))
        if (mySideRef.current === 'X') paddleX.value = clamped
        else paddleO.value = clamped

        const now = Date.now()
        if (now - lastPaddleBroadcastRef.current > 33) {
          lastPaddleBroadcastRef.current = now
          broadcastSeqRef.current += 1
          sendGameEvent('paddle_move', { side: mySideRef.current, x: clamped, seq: broadcastSeqRef.current })
        }
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ).current

  // --- Realtime channel setup (broadcast-only, matches web's non-WebRTC fallback path;
  // see useUnoQuickChat.ts precedent — a shared broadcast topic intentionally skips
  // uniqueTopic(), which only applies to client-local postgres_changes subscriptions). ---
  useEffect(() => {
    const ch = getSupabase()
      .channel(`game:${gameCode}:ping_pong_physics`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'paddle_move' }, (p) => handleGameEvent('paddle_move', p.payload))
      .on('broadcast', { event: 'ball_sync' }, (p) => handleGameEvent('ball_sync', p.payload))
      .on('broadcast', { event: 'serve' }, (p) => handleGameEvent('serve', p.payload))
      .on('broadcast', { event: 'request_serve' }, (p) => handleGameEvent('request_serve', p.payload))
      .on('broadcast', { event: 'point_scored' }, (p) => handleGameEvent('point_scored', p.payload))
      .on('broadcast', { event: 'request_sync' }, (p) => handleGameEvent('request_sync', p.payload))
      .on('broadcast', { event: 'full_sync' }, (p) => handleGameEvent('ball_sync', p.payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = ch
          if (mySideRef.current && !isViewerRef.current) {
            // nothing to do — paddle/ball state lives locally until the peer sends theirs
          } else if (isViewerRef.current) {
            ch.send({ type: 'broadcast', event: 'request_sync', payload: { side: 'viewer' } })
          }
        }
      })

    return () => {
      channelRef.current = null
      void getSupabase().removeChannel(ch)
    }
  }, [gameCode, handleGameEvent])

  // Serving side recompute after each point.
  useEffect(() => {
    if (session.status !== 'active') {
      ballInPlay.value = false
      return
    }
    setServingSide(pingPongServingSide(session.score_x, session.score_o, session.points_to_win))
    setLastPointScorer(null)
    ballInPlay.value = false
  }, [session.status, session.score_x, session.score_o, session.points_to_win, ballInPlay])

  const registerHit = useCallback(
    (ball: Ball, side: 'X' | 'O') => {
      rallyRef.current += 1
      setRallyCount(rallyRef.current)
      broadcastBallSync(ball, rallyRef.current, side)
    },
    [broadcastBallSync]
  )

  // --- 60fps physics loop (UI thread via reanimated), mirrors PingPongPhysicsSpike ---
  useFrameCallback((frameInfo) => {
    'worklet'
    const now = frameInfo.timestamp
    if (lastTimestamp.current == null) {
      lastTimestamp.current = now
      return
    }
    const dtMs = now - lastTimestamp.current
    lastTimestamp.current = now
    const dt = Math.min(dtMs / 1000, 3 / 60)

    const mySideVal = mySideRef.current
    const isViewerVal = isViewerRef.current
    const hasOpponent = hasOpponentRef.current
    const isAuthority =
      !isViewerVal &&
      mySideVal != null &&
      (!hasOpponent
        ? true
        : !ballInPlay.value
          ? mySideVal === servingSideRef.current
          : (mySideVal === 'X' && ballY.value >= TABLE_HEIGHT / 2) || (mySideVal === 'O' && ballY.value < TABLE_HEIGHT / 2))

    if (!ballInPlay.value) return

    if (isAuthority && !lastPointScorerRef.current) {
      let x = ballX.value + ballVX.value * dt
      let y = ballY.value + ballVY.value * dt
      let vx = ballVX.value
      let vy = ballVY.value

      if (x - BALL_RADIUS < 0) {
        x = BALL_RADIUS
        vx = -vx
      } else if (x + BALL_RADIUS > TABLE_WIDTH) {
        x = TABLE_WIDTH - BALL_RADIUS
        vx = -vx
      }

      // Paddle O (top)
      if (vy < 0 && y - BALL_RADIUS <= PADDLE_HEIGHT + PADDLE_MARGIN && y - BALL_RADIUS >= PADDLE_MARGIN / 2) {
        if (Math.abs(x - paddleO.value) <= PADDLE_WIDTH / 2 + BALL_RADIUS) {
          y = PADDLE_HEIGHT + PADDLE_MARGIN + BALL_RADIUS
          const hitOffset = (x - paddleO.value) / (PADDLE_WIDTH / 2)
          const speed = Math.min(MAX_BALL_SPEED, Math.hypot(vx, vy) * 1.05)
          const angle = hitOffset * (Math.PI / 3)
          vx = speed * Math.sin(angle)
          vy = Math.abs(speed * Math.cos(angle))
          const ball = { x, y, vx, vy, inPlay: true }
          runOnJS(registerHit)(ball, mySideVal!)
        }
      }

      // Paddle X (bottom)
      if (vy > 0 && y + BALL_RADIUS >= TABLE_HEIGHT - (PADDLE_HEIGHT + PADDLE_MARGIN) && y + BALL_RADIUS <= TABLE_HEIGHT - PADDLE_MARGIN / 2) {
        if (Math.abs(x - paddleX.value) <= PADDLE_WIDTH / 2 + BALL_RADIUS) {
          y = TABLE_HEIGHT - (PADDLE_HEIGHT + PADDLE_MARGIN + BALL_RADIUS)
          const hitOffset = (x - paddleX.value) / (PADDLE_WIDTH / 2)
          const speed = Math.min(MAX_BALL_SPEED, Math.hypot(vx, vy) * 1.05)
          const angle = hitOffset * (Math.PI / 3)
          vx = speed * Math.sin(angle)
          vy = -Math.abs(speed * Math.cos(angle))
          const ball = { x, y, vx, vy, inPlay: true }
          runOnJS(registerHit)(ball, mySideVal!)
        }
      }

      if (y < -BALL_RADIUS * 2) {
        runOnJS(triggerPoint)('X', rallyRef.current)
      } else if (y > TABLE_HEIGHT + BALL_RADIUS * 2) {
        runOnJS(triggerPoint)('O', rallyRef.current)
      }

      ballX.value = x
      ballY.value = y
      ballVX.value = vx
      ballVY.value = vy

      const nowMs = now
      if ((nowMs as unknown as number) - lastBallSyncRef.current > 50) {
        lastBallSyncRef.current = nowMs as unknown as number
        runOnJS(broadcastBallSync)({ x, y, vx, vy, inPlay: true }, rallyRef.current, mySideVal!)
      }
    } else if (!isAuthority) {
      // Non-authority client-side prediction: keep the ball moving between syncs.
      let x = ballX.value + ballVX.value * dt
      let y = ballY.value + ballVY.value * dt
      let vx = ballVX.value
      if (x - BALL_RADIUS < 0) {
        x = BALL_RADIUS
        vx = -vx
      } else if (x + BALL_RADIUS > TABLE_WIDTH) {
        x = TABLE_WIDTH - BALL_RADIUS
        vx = -vx
      }
      ballX.value = x
      ballY.value = y
      ballVX.value = vx
    }
  }, true)

  const ballProps = useAnimatedProps(() => ({
    cx: flipBoard ? TABLE_WIDTH - ballX.value : ballX.value,
    cy: flipBoard ? TABLE_HEIGHT - ballY.value : ballY.value,
    opacity: ballInPlay.value || (!lastPointScorer && session.status === 'active') ? 1 : 0,
  }))

  const topPaddleProps = useAnimatedProps(() => ({
    x: (flipBoard ? TABLE_WIDTH - paddleX.value : paddleO.value) - PADDLE_WIDTH / 2,
  }))
  const bottomPaddleProps = useAnimatedProps(() => ({
    x: (flipBoard ? TABLE_WIDTH - paddleO.value : paddleX.value) - PADDLE_WIDTH / 2,
  }))

  useEffect(
    () => () => {
      lastTimestamp.current = null
    },
    []
  )

  const topSide = flipBoard ? 'X' : 'O'
  const bottomSide = flipBoard ? 'O' : 'X'
  const topPlayer = topSide === 'X' ? playerX : playerO
  const bottomPlayer = bottomSide === 'X' ? playerX : playerO
  const topScore = topSide === 'X' ? session.score_x : session.score_o
  const bottomScore = bottomSide === 'X' ? session.score_x : session.score_o

  return (
    <View style={styles.wrap}>
      <View style={[styles.banner, styles.bannerTop]}>
        <Text style={styles.bannerName} numberOfLines={1}>
          {topPlayer?.name ?? `Player ${topSide}`} {mySide === topSide ? '(You)' : ''}
          {servingSide === topSide && session.status === 'active' ? ' 🏓' : ''}
        </Text>
        <Text style={styles.bannerScore}>{topScore}</Text>
      </View>

      <View
        style={[styles.tableWrap, { width: TABLE_WIDTH, height: TABLE_HEIGHT }]}
        {...panResponder.panHandlers}
      >
        <Svg width={TABLE_WIDTH} height={TABLE_HEIGHT}>
          <Rect x={0} y={0} width={TABLE_WIDTH} height={TABLE_HEIGHT} fill="#0f2a1f" rx={12} />
          <Line
            x1={0}
            y1={TABLE_HEIGHT / 2}
            x2={TABLE_WIDTH}
            y2={TABLE_HEIGHT / 2}
            stroke="#ffffff55"
            strokeWidth={2}
          />
          <AnimatedRect animatedProps={topPaddleProps} y={PADDLE_MARGIN} width={PADDLE_WIDTH} height={PADDLE_HEIGHT} rx={6} fill="#f97316" />
          <AnimatedRect
            animatedProps={bottomPaddleProps}
            y={TABLE_HEIGHT - (PADDLE_HEIGHT + PADDLE_MARGIN)}
            width={PADDLE_WIDTH}
            height={PADDLE_HEIGHT}
            rx={6}
            fill="#0ea5e9"
          />
          <AnimatedCircle animatedProps={ballProps} r={BALL_RADIUS} fill="#f5c518" />
        </Svg>

        {rallyCount > 2 && !lastPointScorer ? (
          <View style={styles.rallyOverlay} pointerEvents="none">
            <Text style={styles.rallyText}>{rallyCount}</Text>
          </View>
        ) : null}

        {lastPointScorer && session.status === 'active' ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            <Text style={styles.overlayText}>Point for Player {lastPointScorer}!</Text>
          </View>
        ) : null}

        {!ballInPlay.value && !lastPointScorer && session.status === 'active' && mySide === servingSide && !isViewer ? (
          <View style={styles.centerOverlay} pointerEvents="box-none">
            <Text
              style={styles.serveHint}
              onPress={() => serveBall()}
              suppressHighlighting
            >
              Tap to serve
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.banner, styles.bannerBottom]}>
        <Text style={styles.bannerName} numberOfLines={1}>
          {bottomPlayer?.name ?? `Player ${bottomSide}`} {mySide === bottomSide ? '(You)' : ''}
          {servingSide === bottomSide && session.status === 'active' ? ' 🏓' : ''}
        </Text>
        <Text style={styles.bannerScore}>{bottomScore}</Text>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: 8 },
    banner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      maxWidth: 400,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: theme.surface,
    },
    bannerTop: {},
    bannerBottom: {},
    bannerName: { flexShrink: 1, color: theme.text, fontWeight: '700', fontSize: 13 },
    bannerScore: { color: theme.text, fontWeight: '900', fontSize: 22, fontVariant: ['tabular-nums'] },
    tableWrap: { borderRadius: 12, overflow: 'hidden' },
    rallyOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rallyText: { color: '#ffffff33', fontWeight: '900', fontSize: 64 },
    centerOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlayText: {
      color: '#fff',
      fontWeight: '800',
      backgroundColor: 'rgba(15,23,42,0.85)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      overflow: 'hidden',
    },
    serveHint: {
      color: '#fff',
      fontWeight: '800',
      backgroundColor: 'rgba(15,23,42,0.85)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      overflow: 'hidden',
    },
  })
