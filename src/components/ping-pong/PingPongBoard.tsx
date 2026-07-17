'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Player, PingPongSession } from '@/types'
import { supabase } from '@/lib/supabase'

type Props = {
  gameCode: string
  session: PingPongSession
  players: Player[]
  myPlayerId: string | null
  myResumeToken: string | null
  isViewer: boolean
  theme?: string
  onPointScored?: () => void
}

const TABLE_WIDTH = 400
const TABLE_HEIGHT = 600
const PADDLE_WIDTH = 80
const PADDLE_HEIGHT = 14
const BALL_RADIUS = 8
const PADDLE_SPEED = 7
const INITIAL_BALL_SPEED = 4.5
const MAX_BALL_SPEED = 9

export function PingPongBoard({
  gameCode,
  session,
  players,
  myPlayerId,
  myResumeToken,
  isViewer,
  theme,
  onPointScored,
}: Props) {
  const themeColors = {
    grass_court: {
      bgOuter: '#166534',
      bgInner: '#15803d',
      ball: '#eab308',
      ballShadow: 'rgba(234, 179, 8, 0.8)',
    },
    default: {
      bgOuter: '#022c22', // darker emerald
      bgInner: '#064e3b', // matches Table Tennis preview bg
      ball: '#f43f5e', // matches Table Tennis preview accent
      ballShadow: 'rgba(244, 63, 94, 0.8)',
    },
  }

  const currentTheme = theme === 'grass_court' ? themeColors.grass_court : themeColors.default

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const playerX = players.find((p) => p.id === session.player_x_id)
  const playerO = players.find((p) => p.id === session.player_o_id)

  const mySide: 'X' | 'O' | null =
    myPlayerId === session.player_x_id ? 'X' : myPlayerId === session.player_o_id ? 'O' : null

  // We flip the board so whoever you are, your paddle is at the bottom.
  // If spectator/viewer or X, X is at bottom, O is at top.
  const flipBoard = mySide === 'O'

  // Game state in refs for 60fps loop
  const lastFrameTimeRef = useRef<number>(0)
  const paddleXRef = useRef<number>(TABLE_WIDTH / 2)
  const paddleORef = useRef<number>(TABLE_WIDTH / 2)

  const ballRef = useRef<{ x: number; y: number; vx: number; vy: number; inPlay: boolean }>({
    x: TABLE_WIDTH / 2,
    y: TABLE_HEIGHT / 2,
    vx: (Math.random() > 0.5 ? 1 : -1) * INITIAL_BALL_SPEED * 0.5,
    vy: (Math.random() > 0.5 ? 1 : -1) * INITIAL_BALL_SPEED,
    inPlay: false,
  })
  const rallyRef = useRef<number>(0)
  const [rallyCount, setRallyCount] = useState<number>(0)
  const [servingSide, setServingSide] = useState<'X' | 'O'>((session.score_x + session.score_o) % 4 < 2 ? 'X' : 'O')
  const [serveTick, setServeTick] = useState(0)
  const [lastPointScorer, setLastPointScorer] = useState<'X' | 'O' | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastBroadcastRef = useRef<number>(0)
  const scoringRef = useRef<boolean>(false)

  const triggerPoint = useCallback(
    async (scorer: 'X' | 'O') => {
      if (scoringRef.current || !myPlayerId || !myResumeToken) return
      scoringRef.current = true
      setLastPointScorer(scorer)
      ballRef.current.inPlay = false

      try {
        const res = await fetch('/api/ping-pong/point', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            resumeToken: myResumeToken,
            scorer,
          }),
        })
        if (res.ok) {
          onPointScored?.()
        }
      } finally {
        setTimeout(() => {
          scoringRef.current = false
        }, 1500)
      }
    },
    [gameCode, myPlayerId, myResumeToken, onPointScored]
  )

  const serveBall = useCallback(() => {
    if (ballRef.current.inPlay || session.status === 'finished' || lastPointScorer) return

    if (mySide === servingSide) {
      const serveDir = servingSide === 'X' ? -1 : 1

      // Serve from paddle position
      const serveX = servingSide === 'X' ? paddleXRef.current : paddleORef.current
      const serveY =
        servingSide === 'X' ? TABLE_HEIGHT - (PADDLE_HEIGHT + 10 + BALL_RADIUS) : PADDLE_HEIGHT + 10 + BALL_RADIUS

      ballRef.current = {
        x: serveX,
        y: serveY,
        vx: (Math.random() > 0.5 ? 1 : -1) * (INITIAL_BALL_SPEED * 0.6),
        vy: serveDir * INITIAL_BALL_SPEED,
        inPlay: true,
      }
      rallyRef.current = 0
      setRallyCount(0)
      setLastPointScorer(null)
      setServeTick((t) => t + 1)

      if (channelRef.current) {
        void channelRef.current.send({
          type: 'broadcast',
          event: 'serve',
          payload: { ...ballRef.current },
        })
      }
    } else {
      // Send a request to the authority to start the serve
      if (channelRef.current) {
        void channelRef.current.send({
          type: 'broadcast',
          event: 'request_serve',
          payload: {},
        })
      }
    }
  }, [mySide, servingSide, session.status, lastPointScorer])

  const serveBallRef = useRef(serveBall)
  useEffect(() => {
    serveBallRef.current = serveBall
  }, [serveBall])

  const lastPointScorerRef = useRef(lastPointScorer)
  useEffect(() => {
    lastPointScorerRef.current = lastPointScorer
  }, [lastPointScorer])

  // Setup broadcast channel for low-latency paddle/ball sync
  useEffect(() => {
    const ch = supabase
      .channel(`game:${gameCode}:ping_pong_physics`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'paddle_move' }, (payload) => {
        const { side, x } = payload.payload as { side: 'X' | 'O'; x: number }
        if (side === 'X') paddleXRef.current = x
        else if (side === 'O') paddleORef.current = x
      })
      .on('broadcast', { event: 'ball_sync' }, (payload) => {
        const { x, y, vx, vy, inPlay, rally } = payload.payload as {
          x: number
          y: number
          vx: number
          vy: number
          inPlay: boolean
          rally: number
        }
        ballRef.current = { x, y, vx, vy, inPlay }
        if (rally !== undefined && rally !== rallyRef.current) {
          rallyRef.current = rally
          setRallyCount(rally)
        }
      })
      .on('broadcast', { event: 'serve' }, (payload) => {
        const { x, y, vx, vy, inPlay } = payload.payload as {
          x: number
          y: number
          vx: number
          vy: number
          inPlay: boolean
        }
        ballRef.current = { x, y, vx, vy, inPlay }
        rallyRef.current = 0
        setRallyCount(0)
        setLastPointScorer(null)
        setServeTick((t) => t + 1)
      })
      .on('broadcast', { event: 'request_serve' }, () => {
        if (mySide === servingSide && !ballRef.current.inPlay && !lastPointScorerRef.current) {
          serveBallRef.current()
        }
      })
      .on('broadcast', { event: 'point_scored' }, (payload) => {
        const { scorer } = payload.payload as { scorer: 'X' | 'O' }
        ballRef.current.inPlay = false
        setLastPointScorer(scorer)
      })
      .subscribe()

    channelRef.current = ch
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, mySide, servingSide])

  // Update serving side after points
  useEffect(() => {
    if (session.status !== 'active') {
      ballRef.current.inPlay = false
      return
    }
    const nextServe = (session.score_x + session.score_o) % 4 < 2 ? 'X' : 'O'
    setServingSide(nextServe)
    setLastPointScorer(null)
    ballRef.current.inPlay = false
  }, [session.status, session.score_x, session.score_o])

  // Handle local paddle movement from mouse / touch
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!mySide || isViewer || session.status !== 'active') return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scaleX = TABLE_WIDTH / rect.width
      let clientX = (e.clientX - rect.left) * scaleX

      if (flipBoard) {
        clientX = TABLE_WIDTH - clientX
      }

      const clamped = Math.max(PADDLE_WIDTH / 2, Math.min(TABLE_WIDTH - PADDLE_WIDTH / 2, clientX))
      if (mySide === 'X') paddleXRef.current = clamped
      else paddleORef.current = clamped

      const now = performance.now()
      if (channelRef.current && now - lastBroadcastRef.current > 30) {
        lastBroadcastRef.current = now
        void channelRef.current.send({
          type: 'broadcast',
          event: 'paddle_move',
          payload: { side: mySide, x: clamped },
        })
      }
    },
    [mySide, isViewer, session.status, flipBoard]
  )

  // 60 FPS Canvas Game Loop
  useEffect(() => {
    let animationFrameId: number

    const render = (time: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = time
      }
      const dtMs = time - lastFrameTimeRef.current
      lastFrameTimeRef.current = time
      // Target is 60fps (16.666ms per frame). Cap at 3x to avoid clipping through walls on huge lag spikes
      const dtRatio = Math.min(dtMs / (1000 / 60), 3)

      // --- 1. Passing Authority Check ---
      const hasOpponent = (mySide === 'X' && playerO) || (mySide === 'O' && playerX)
      const isAuthority =
        !isViewer &&
        (!hasOpponent
          ? true
          : !ballRef.current.inPlay
            ? mySide === servingSide
            : (mySide === 'X' && ballRef.current.vy > 0) || (mySide === 'O' && ballRef.current.vy < 0))

      // --- 2. Physics update ---
      if (isAuthority && ballRef.current.inPlay && session.status === 'active') {
        const ball = ballRef.current
        ball.x += ball.vx * dtRatio
        ball.y += ball.vy * dtRatio

        // Wall collisions (left/right)
        if (ball.x - BALL_RADIUS < 0) {
          ball.x = BALL_RADIUS
          ball.vx = -ball.vx
        } else if (ball.x + BALL_RADIUS > TABLE_WIDTH) {
          ball.x = TABLE_WIDTH - BALL_RADIUS
          ball.vx = -ball.vx
        }

        // Paddle O collision (top: y near PADDLE_HEIGHT)
        if (ball.vy < 0 && ball.y - BALL_RADIUS <= PADDLE_HEIGHT + 10 && ball.y - BALL_RADIUS >= 5) {
          const pO = paddleORef.current
          if (Math.abs(ball.x - pO) <= PADDLE_WIDTH / 2 + BALL_RADIUS) {
            ball.y = PADDLE_HEIGHT + 10 + BALL_RADIUS
            const hitOffset = (ball.x - pO) / (PADDLE_WIDTH / 2)
            const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.05)
            const angle = hitOffset * (Math.PI / 3) // max 60 deg bounce angle
            ball.vx = speed * Math.sin(angle)
            ball.vy = Math.abs(speed * Math.cos(angle))
            rallyRef.current += 1
            setRallyCount(rallyRef.current)

            // Broadcast immediate sync on paddle hit
            if (channelRef.current) {
              lastBroadcastRef.current = performance.now()
              void channelRef.current.send({
                type: 'broadcast',
                event: 'ball_sync',
                payload: { ...ball, rally: rallyRef.current },
              })
            }
          }
        }

        // Paddle X collision (bottom: y near TABLE_HEIGHT - PADDLE_HEIGHT)
        if (
          ball.vy > 0 &&
          ball.y + BALL_RADIUS >= TABLE_HEIGHT - (PADDLE_HEIGHT + 10) &&
          ball.y + BALL_RADIUS <= TABLE_HEIGHT - 5
        ) {
          const pX = paddleXRef.current
          if (Math.abs(ball.x - pX) <= PADDLE_WIDTH / 2 + BALL_RADIUS) {
            ball.y = TABLE_HEIGHT - (PADDLE_HEIGHT + 10 + BALL_RADIUS)
            const hitOffset = (ball.x - pX) / (PADDLE_WIDTH / 2)
            const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.05)
            const angle = hitOffset * (Math.PI / 3)
            ball.vx = speed * Math.sin(angle)
            ball.vy = -Math.abs(speed * Math.cos(angle))
            rallyRef.current += 1
            setRallyCount(rallyRef.current)

            // Broadcast immediate sync on paddle hit
            if (channelRef.current) {
              lastBroadcastRef.current = performance.now()
              void channelRef.current.send({
                type: 'broadcast',
                event: 'ball_sync',
                payload: { ...ball, rally: rallyRef.current },
              })
            }
          }
        }

        // Out of bounds checks (score points)
        if (ball.y < -BALL_RADIUS * 2) {
          // Ball went out top => Player X scored!
          ball.inPlay = false
          void triggerPoint('X')
          setLastPointScorer('X')
          if (channelRef.current) {
            void channelRef.current.send({ type: 'broadcast', event: 'point_scored', payload: { scorer: 'X' } })
          }
        } else if (ball.y > TABLE_HEIGHT + BALL_RADIUS * 2) {
          // Ball went out bottom => Player O scored!
          ball.inPlay = false
          void triggerPoint('O')
          setLastPointScorer('O')
          if (channelRef.current) {
            void channelRef.current.send({ type: 'broadcast', event: 'point_scored', payload: { scorer: 'O' } })
          }
        }
      } else if (!isAuthority && ballRef.current.inPlay && session.status === 'active') {
        // Client interpolation of ball position
        const ball = ballRef.current
        ball.x += ball.vx * dtRatio
        ball.y += ball.vy * dtRatio

        // Apply basic wall collisions so client prediction doesn't visually fly out of bounds
        if (ball.x - BALL_RADIUS < 0) {
          ball.x = BALL_RADIUS
          ball.vx = -ball.vx
        } else if (ball.x + BALL_RADIUS > TABLE_WIDTH) {
          ball.x = TABLE_WIDTH - BALL_RADIUS
          ball.vx = -ball.vx
        }
      } else if (!ballRef.current.inPlay && session.status === 'active' && !lastPointScorerRef.current) {
        // Tie ball to serving paddle before serve (only if not displaying point scored message)
        ballRef.current.x = servingSide === 'X' ? paddleXRef.current : paddleORef.current
        ballRef.current.y =
          servingSide === 'X' ? TABLE_HEIGHT - (PADDLE_HEIGHT + 10 + BALL_RADIUS) : PADDLE_HEIGHT + 10 + BALL_RADIUS
      }

      // --- 2. Canvas Drawing ---
      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT)

      // Table borders and net lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, TABLE_WIDTH - 4, TABLE_HEIGHT - 4)

      // Center dividing line (vertical)
      ctx.beginPath()
      ctx.setLineDash([8, 8])
      ctx.moveTo(TABLE_WIDTH / 2, 0)
      ctx.lineTo(TABLE_WIDTH / 2, TABLE_HEIGHT)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Net (horizontal across middle)
      ctx.beginPath()
      ctx.setLineDash([])
      ctx.moveTo(0, TABLE_HEIGHT / 2)
      ctx.lineTo(TABLE_WIDTH, TABLE_HEIGHT / 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.lineWidth = 3
      ctx.stroke()

      // Draw Paddles depending on flip mode
      const renderPaddleX = flipBoard ? TABLE_WIDTH - paddleXRef.current : paddleXRef.current
      const renderPaddleO = flipBoard ? TABLE_WIDTH - paddleORef.current : paddleORef.current

      const bottomPaddleX = flipBoard ? renderPaddleO : renderPaddleX
      const topPaddleX = flipBoard ? renderPaddleX : renderPaddleO

      const orangePaddleColor = '#f97316'
      const orangePaddleShadow = 'rgba(249, 115, 22, 0.5)'
      const skyPaddleColor = theme === 'grass_court' ? '#ffffff' : '#0ea5e9'
      const skyPaddleShadow = theme === 'grass_court' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(14, 165, 233, 0.5)'

      // Top paddle drawing (Orange/O by default, or X if flipped)
      ctx.fillStyle = flipBoard ? skyPaddleColor : orangePaddleColor
      ctx.shadowColor = flipBoard ? skyPaddleShadow : orangePaddleShadow
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.roundRect(topPaddleX - PADDLE_WIDTH / 2, 10, PADDLE_WIDTH, PADDLE_HEIGHT, 6)
      ctx.fill()

      // Bottom paddle drawing (Sky/X by default, or O if flipped)
      ctx.fillStyle = flipBoard ? orangePaddleColor : skyPaddleColor
      ctx.shadowColor = flipBoard ? orangePaddleShadow : skyPaddleShadow
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.roundRect(
        bottomPaddleX - PADDLE_WIDTH / 2,
        TABLE_HEIGHT - (PADDLE_HEIGHT + 10),
        PADDLE_WIDTH,
        PADDLE_HEIGHT,
        6
      )
      ctx.fill()

      ctx.shadowBlur = 0 // reset shadow

      // Draw Ball
      if (ballRef.current.inPlay || (session.status === 'active' && !lastPointScorerRef.current)) {
        const renderBallX = flipBoard ? TABLE_WIDTH - ballRef.current.x : ballRef.current.x
        const renderBallY = flipBoard ? TABLE_HEIGHT - ballRef.current.y : ballRef.current.y

        ctx.fillStyle = currentTheme.ball
        ctx.shadowColor = currentTheme.ballShadow
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(renderBallX, renderBallY, BALL_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animationFrameId)
  }, [session.status, triggerPoint, flipBoard, servingSide, mySide, isViewer, playerO, playerX])

  const topPlayer = flipBoard
    ? { side: 'X' as const, player: playerX, score: session.score_x, color: 'sky' as const }
    : { side: 'O' as const, player: playerO, score: session.score_o, color: 'orange' as const }
  const bottomPlayer = flipBoard
    ? { side: 'O' as const, player: playerO, score: session.score_o, color: 'orange' as const }
    : { side: 'X' as const, player: playerX, score: session.score_x, color: 'sky' as const }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      {/* Top Player Banner */}
      <div
        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl glass-card border ${topPlayer.color === 'sky' ? 'bg-sky-500/10 border-sky-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full shadow-sm ${topPlayer.color === 'sky' ? 'bg-sky-500 shadow-sky-500/50' : 'bg-orange-500 shadow-orange-500/50'}`}
          />
          <span className={`font-bold text-sm ${topPlayer.color === 'sky' ? 'text-sky-400' : 'text-orange-400'}`}>
            {topPlayer.player?.name ?? `Player ${topPlayer.side}`} {mySide === topPlayer.side ? '(You)' : ''}
          </span>
          {servingSide === topPlayer.side && session.status === 'active' && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${topPlayer.color === 'sky' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-orange-500/20 text-orange-300 border-orange-500/40'}`}
            >
              🏓 Serve
            </span>
          )}
        </div>
        <span
          className={`text-2xl font-black tabular-nums ${topPlayer.color === 'sky' ? 'text-sky-400' : 'text-orange-400'}`}
        >
          {topPlayer.score}
        </span>
      </div>

      <div
        className="relative rounded-2xl overflow-hidden border-2 border-[var(--border-strong)] shadow-2xl touch-none cursor-ew-resize"
        style={{ backgroundColor: currentTheme.bgOuter }}
        onClick={() => {
          if (!ballRef.current.inPlay && !lastPointScorer && mySide === servingSide) {
            serveBall()
          }
        }}
      >
        <canvas
          ref={canvasRef}
          width={TABLE_WIDTH}
          height={TABLE_HEIGHT}
          className="w-full h-auto shadow-lg touch-none"
          style={{
            backgroundColor: currentTheme.bgInner,
            aspectRatio: `${TABLE_WIDTH} / ${TABLE_HEIGHT}`,
            imageRendering: 'pixelated',
            cursor: !ballRef.current.inPlay && !lastPointScorer && mySide === servingSide ? 'pointer' : 'default',
          }}
          onPointerMove={handlePointerMove}
        />
        {/* Status / Rally Overlay */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center z-10">
          {rallyCount > 2 && ballRef.current.inPlay && (
            <div className="text-[var(--foreground)] font-black text-6xl opacity-20 transition-all duration-300">
              {rallyCount}
            </div>
          )}

          {lastPointScorer && session.status === 'active' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <span className="bg-[var(--card)] px-6 py-3 rounded-full text-[var(--foreground)] font-bold shadow-xl border border-[var(--border-strong)] flex items-center gap-3 backdrop-blur-md">
                Point for Player {lastPointScorer}!
              </span>
            </div>
          )}

          {/* Active Server indicator */}
          {!ballRef.current.inPlay && !lastPointScorer && session.status === 'active' && mySide === servingSide && (
            <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-300">
              <p className="font-extrabold text-sm">
                {lastPointScorer ? `Point to Player ${lastPointScorer}!` : 'Ready'}
              </p>
              <p className="text-xs text-white/70">
                {mySide === servingSide ? 'Tap board to serve' : 'Waiting for serve...'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Player Banner */}
      <div
        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl glass-card border ${bottomPlayer.color === 'sky' ? 'bg-sky-500/10 border-sky-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full shadow-sm ${bottomPlayer.color === 'sky' ? 'bg-sky-500 shadow-sky-500/50' : 'bg-orange-500 shadow-orange-500/50'}`}
          />
          <span className={`font-bold text-sm ${bottomPlayer.color === 'sky' ? 'text-sky-400' : 'text-orange-400'}`}>
            {bottomPlayer.player?.name ?? `Player ${bottomPlayer.side}`} {mySide === bottomPlayer.side ? '(You)' : ''}
          </span>
          {servingSide === bottomPlayer.side && session.status === 'active' && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${bottomPlayer.color === 'sky' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-orange-500/20 text-orange-300 border-orange-500/40'}`}
            >
              🏓 Serve
            </span>
          )}
        </div>
        <span
          className={`text-2xl font-black tabular-nums ${bottomPlayer.color === 'sky' ? 'text-sky-400' : 'text-orange-400'}`}
        >
          {bottomPlayer.score}
        </span>
      </div>

      {/* Status Footer */}
      <div className="text-center text-xs text-muted font-medium bg-[var(--surface-inset-bg)] px-4 py-2 rounded-lg border border-[var(--border)] w-full">
        {session.status_message?.startsWith('Point for')
          ? `First to ${session.points_to_win} points wins (win by 2)!`
          : session.status_message}
      </div>
    </div>
  )
}
