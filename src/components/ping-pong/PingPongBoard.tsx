'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Player, PingPongSession } from '@/types'
import { supabase } from '@/lib/supabase'
import { pingPongServingSide } from '@/lib/ping-pong'
import { THEME_MAP, parseThemeId } from '@/lib/themes'

type Props = {
  gameCode: string
  session: PingPongSession
  players: Player[]
  myPlayerId: string | null
  myResumeToken: string | null
  isViewer: boolean
  theme?: string
  onPointScored?: () => void
  sessionStartedAt?: string | null
  gameDurationSeconds?: number
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
  sessionStartedAt,
  gameDurationSeconds,
}: Props) {
  const themeConfig = THEME_MAP[parseThemeId(theme)]
  const currentTheme = {
    bgOuter: themeConfig.preview.bg,
    bgInner: themeConfig.preview.bg,
    ball: themeConfig.preview.accent,
    ballShadow: themeConfig.preview.accent,
    lines: themeConfig.preview.text,
  }

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
  const [servingSide, setServingSide] = useState<'X' | 'O'>(
    pingPongServingSide(session.score_x, session.score_o, session.points_to_win)
  )
  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null)
  const [serveTick, setServeTick] = useState(0)
  const [lastPointScorer, setLastPointScorer] = useState<'X' | 'O' | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const lastPaddleBroadcastRef = useRef<number>(0)
  const scoringRef = useRef<boolean>(false)
  const broadcastSeqRef = useRef<number>(0)
  const paddleXSeqRef = useRef<number>(0)
  const paddleOSeqRef = useRef<number>(0)
  const ballSyncSeqRef = useRef<number>(0)
  const lastBallSyncSideRef = useRef<string | null>(null)
  const serveSeqRef = useRef<number>(0)
  const lastBallSyncRef = useRef<number>(0)

  // Refs for tracking remote paddle targets to enable 60fps linear interpolation (lerp)
  const targetPaddleXRef = useRef<number>(TABLE_WIDTH / 2)
  const targetPaddleORef = useRef<number>(TABLE_WIDTH / 2)

  // WebRTC setup
  const [webRTCStatus, setWebRTCStatus] = useState<'connecting' | 'connected' | 'fallback'>('connecting')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)

  const lastSupabasePaddleSendRef = useRef<number>(0)

  const sendGameEvent = useCallback((event: string, payload: any) => {
    if (dcRef.current?.readyState === 'open') {
      try {
        dcRef.current.send(JSON.stringify({ event, payload }))
      } catch (e) {
        if (channelRef.current) void channelRef.current.send({ type: 'broadcast', event, payload })
      }
      // Also broadcast to Supabase channel so viewers and non-WebRTC observers receive live updates
      if (channelRef.current) {
        if (event === 'paddle_move') {
          const now = performance.now()
          if (now - lastSupabasePaddleSendRef.current > 33) {
            lastSupabasePaddleSendRef.current = now
            void channelRef.current.send({ type: 'broadcast', event, payload })
          }
        } else {
          void channelRef.current.send({ type: 'broadcast', event, payload })
        }
      }
    } else if (channelRef.current) {
      void channelRef.current.send({ type: 'broadcast', event, payload })
    }
  }, [])

  const handleGameEvent = useCallback(
    (event: string, payload: any) => {
      if (event === 'paddle_move') {
        const { side, x, seq } = payload as { side: 'X' | 'O'; x: number; seq?: number }
        if (typeof side !== 'string' || (side !== 'X' && side !== 'O') || !Number.isFinite(x)) return
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
        if (side === 'X') {
          targetPaddleXRef.current = clamped
          paddleXRef.current = clamped
        } else if (side === 'O') {
          targetPaddleORef.current = clamped
          paddleORef.current = clamped
        }
      } else if (event === 'ball_sync') {
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
        if (typeof seq === 'number') {
          if (side === lastBallSyncSideRef.current && seq <= ballSyncSeqRef.current) return
          if (side) lastBallSyncSideRef.current = side
          ballSyncSeqRef.current = seq
        }
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(vx) ||
          !Number.isFinite(vy) ||
          typeof inPlay !== 'boolean' ||
          x < -TABLE_WIDTH ||
          x > TABLE_WIDTH * 2 ||
          y < -TABLE_HEIGHT ||
          y > TABLE_HEIGHT * 2 ||
          Math.hypot(vx, vy) > MAX_BALL_SPEED * 3
        )
          return
        ballRef.current = { x, y, vx, vy, inPlay }
        if (typeof rally === 'number' && Number.isFinite(rally) && rally !== rallyRef.current) {
          rallyRef.current = rally
          setRallyCount(rally)
        }
      } else if (event === 'serve') {
        const { x, y, vx, vy, inPlay, seq } = payload as {
          x: number
          y: number
          vx: number
          vy: number
          inPlay: boolean
          seq?: number
        }
        if (typeof seq === 'number') {
          if (seq <= serveSeqRef.current) return
          serveSeqRef.current = seq
        }
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(vx) ||
          !Number.isFinite(vy) ||
          typeof inPlay !== 'boolean'
        )
          return
        ballRef.current = { x, y, vx, vy, inPlay }
        rallyRef.current = 0
        setRallyCount(0)
        setLastPointScorer(null)
        setServeTick((t) => t + 1)
      } else if (event === 'request_serve') {
        if (mySide === servingSideRef.current && !ballRef.current.inPlay && !lastPointScorerRef.current && !isViewer) {
          serveBallRef.current()
        }
      } else if (event === 'point_scored') {
        const { scorer } = payload as { scorer: 'X' | 'O' }
        if (scorer !== 'X' && scorer !== 'O') return
        ballRef.current.inPlay = false
        setLastPointScorer(scorer)
      } else if (event === 'request_sync') {
        const { side } = payload as { side: 'X' | 'O' | 'viewer' }
        if (mySide && mySide !== side && !isViewer && sessionRef.current.status === 'active') {
          broadcastSeqRef.current += 1
          sendGameEvent('full_sync', {
            side: mySide,
            ball: ballRef.current,
            rally: rallyRef.current,
            paddleX: paddleXRef.current,
            paddleO: paddleORef.current,
            lastScorer: lastPointScorerRef.current,
            seq: broadcastSeqRef.current,
          })
        }
      } else if (event === 'full_sync') {
        const { ball, rally, paddleX, paddleO, lastScorer, seq, side } = payload as any
        if (typeof seq === 'number') {
          if (side === lastBallSyncSideRef.current && seq <= ballSyncSeqRef.current) return
          if (side) lastBallSyncSideRef.current = side
          ballSyncSeqRef.current = seq
        }
        if (ball) ballRef.current = { ...ball }
        if (typeof rally === 'number') {
          rallyRef.current = rally
          setRallyCount(rally)
        }
        if (typeof paddleX === 'number') {
          paddleXRef.current = paddleX
          targetPaddleXRef.current = paddleX
        }
        if (typeof paddleO === 'number') {
          paddleORef.current = paddleO
          targetPaddleORef.current = paddleO
        }
        if (lastScorer === 'X' || lastScorer === 'O' || lastScorer === null) {
          lastPointScorerRef.current = lastScorer
          setLastPointScorer(lastScorer)
        }
      }
    },
    [mySide, isViewer]
  )

  // Keep refs of session and servingSide to prevent stale closures in callbacks and effects
  const sessionRef = useRef<PingPongSession>(session)

  const createWebRTC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    setWebRTCStatus('connecting')

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        void channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc_ice',
          payload: { candidate: e.candidate, side: mySide },
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setWebRTCStatus('fallback')
      }
    }

    if (mySide === 'X') {
      const dc = pc.createDataChannel('ping-pong', { ordered: false, maxRetransmits: 0 })
      dcRef.current = dc
      dc.onopen = () => setWebRTCStatus('connected')
      dc.onclose = () => setWebRTCStatus('fallback')
      dc.onerror = () => setWebRTCStatus('fallback')
      dc.onmessage = (e) => {
        try {
          const { event, payload } = JSON.parse(e.data)
          handleGameEvent(event, payload)
        } catch {
          // ignore malformed peer messages
        }
      }
    } else if (mySide === 'O') {
      pc.ondatachannel = (e) => {
        const dc = e.channel
        dcRef.current = dc
        dc.onopen = () => setWebRTCStatus('connected')
        dc.onclose = () => setWebRTCStatus('fallback')
        dc.onerror = () => setWebRTCStatus('fallback')
        dc.onmessage = (msg) => {
          try {
            const { event, payload } = JSON.parse(msg.data)
            handleGameEvent(event, payload)
          } catch {
            // ignore malformed peer messages
          }
        }
      }
    }
  }, [mySide, handleGameEvent])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const servingSideRef = useRef<'X' | 'O'>(servingSide)
  useEffect(() => {
    servingSideRef.current = servingSide
  }, [servingSide])

  const triggerPoint = useCallback(
    async (scorer: 'X' | 'O') => {
      if (scoringRef.current || !myPlayerId || !myResumeToken) return
      scoringRef.current = true
      ballRef.current.inPlay = false

      try {
        const res = await fetch('/api/ping-pong/point', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            resumeToken: myResumeToken,
            scorer,
            rally: sessionRef.current.score_x + sessionRef.current.score_o,
          }),
        })
        if (res.ok) {
          setLastPointScorer(scorer)
          sendGameEvent('point_scored', { scorer })
          onPointScored?.()
        } else {
          setLastPointScorer(null)
          onPointScored?.()
        }
      } catch {
        setLastPointScorer(null)
        onPointScored?.()
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

    if (mySide === servingSideRef.current) {
      const serveDir = servingSideRef.current === 'X' ? -1 : 1

      // Serve from paddle position
      const serveX = servingSideRef.current === 'X' ? paddleXRef.current : paddleORef.current
      const serveY =
        servingSideRef.current === 'X'
          ? TABLE_HEIGHT - (PADDLE_HEIGHT + 10 + BALL_RADIUS)
          : PADDLE_HEIGHT + 10 + BALL_RADIUS

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

      broadcastSeqRef.current += 1
      sendGameEvent('serve', { ...ballRef.current, seq: broadcastSeqRef.current })
    } else {
      // Send a request to the authority to start the serve
      sendGameEvent('request_serve', {})
    }
  }, [mySide])

  const serveBallRef = useRef(serveBall)
  useEffect(() => {
    serveBallRef.current = serveBall
  }, [serveBall])

  const lastPointScorerRef = useRef(lastPointScorer)
  useEffect(() => {
    lastPointScorerRef.current = lastPointScorer
  }, [lastPointScorer])

  useEffect(() => {
    return () => {
      pcRef.current?.close()
      pcRef.current = null
      dcRef.current?.close()
      dcRef.current = null
    }
  }, [])

  useEffect(() => {
    if (session.status !== 'active' || !sessionStartedAt || !gameDurationSeconds) {
      setTimeLeftStr(null)
      return
    }
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - new Date(sessionStartedAt).getTime()) / 1000)
      const remaining = Math.max(0, gameDurationSeconds - elapsed)
      if (remaining <= 0) {
        setTimeLeftStr('0:00')
        if (mySide === 'X' || (mySide === null && isViewer)) {
          // Trigger expiration API to conclude the match.
          // In case of multiple clients, the backend handles idempotency.
          fetch(`/api/games/${gameCode}/expire-ping-pong`, { method: 'POST' })
            .then(() => onPointScored?.())
            .catch(console.error)
        }
      } else {
        const m = Math.floor(remaining / 60)
        const s = remaining % 60
        setTimeLeftStr(`${m}:${s.toString().padStart(2, '0')}`)
      }
      return remaining
    }
    const remaining = updateTimer()
    if (remaining <= 0) return

    const interval = setInterval(() => {
      const r = updateTimer()
      if (r <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [session.status, sessionStartedAt, gameDurationSeconds, gameCode, mySide, isViewer, onPointScored])

  // Setup broadcast channel for low-latency paddle/ball sync AND WebRTC signaling
  useEffect(() => {
    const ch = supabase
      .channel(`game:${gameCode}:ping_pong_physics`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'paddle_move' }, (p) => handleGameEvent('paddle_move', p.payload))
      .on('broadcast', { event: 'ball_sync' }, (p) => handleGameEvent('ball_sync', p.payload))
      .on('broadcast', { event: 'serve' }, (p) => handleGameEvent('serve', p.payload))
      .on('broadcast', { event: 'request_serve' }, (p) => handleGameEvent('request_serve', p.payload))
      .on('broadcast', { event: 'point_scored' }, (p) => handleGameEvent('point_scored', p.payload))
      .on('broadcast', { event: 'request_sync' }, (p) => handleGameEvent('request_sync', p.payload))
      .on('broadcast', { event: 'full_sync' }, (p) => handleGameEvent('full_sync', p.payload))
      .on('broadcast', { event: 'webrtc_reset' }, (p) => {
        const { side } = p.payload as { side: 'X' | 'O' }
        if (mySide && side !== mySide && !isViewer && session.status === 'active') {
          paddleXSeqRef.current = 0
          paddleOSeqRef.current = 0
          ballSyncSeqRef.current = 0
          serveSeqRef.current = 0
          createWebRTC()
          if (mySide === 'O') {
            void ch.send({ type: 'broadcast', event: 'webrtc_ready', payload: { side: mySide } })
          }
        }
      })
      .on('broadcast', { event: 'webrtc_ready' }, async (p) => {
        const { side } = p.payload as { side: 'X' | 'O' }
        if (mySide === 'X' && side === 'O' && pcRef.current && !isViewer && session.status === 'active') {
          paddleXSeqRef.current = 0
          paddleOSeqRef.current = 0
          ballSyncSeqRef.current = 0
          serveSeqRef.current = 0
          try {
            const offer = await pcRef.current.createOffer()
            await pcRef.current.setLocalDescription(offer)
            void ch.send({ type: 'broadcast', event: 'webrtc_offer', payload: { offer, side: mySide } })
          } catch (e) {
            console.error('Error creating offer', e)
          }
        }
      })
      .on('broadcast', { event: 'webrtc_offer' }, async (p) => {
        const { offer, side } = p.payload as { offer: RTCSessionDescriptionInit; side: 'X' | 'O' }
        if (mySide === 'O' && side === 'X' && pcRef.current && !isViewer) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer))
            const answer = await pcRef.current.createAnswer()
            await pcRef.current.setLocalDescription(answer)
            void ch.send({ type: 'broadcast', event: 'webrtc_answer', payload: { answer, side: mySide } })
          } catch (e) {
            console.error('Error creating answer', e)
          }
        }
      })
      .on('broadcast', { event: 'webrtc_answer' }, async (p) => {
        const { answer, side } = p.payload as { answer: RTCSessionDescriptionInit; side: 'X' | 'O' }
        if (mySide === 'X' && side === 'O' && pcRef.current && !isViewer) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
          } catch (e) {
            console.error('Error setting remote description', e)
          }
        }
      })
      .on('broadcast', { event: 'webrtc_ice' }, async (p) => {
        const { candidate, side } = p.payload as { candidate: RTCIceCandidateInit; side: 'X' | 'O' }
        if (mySide && mySide !== side && pcRef.current && !isViewer) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (e) {
            console.error('Error adding ICE candidate', e)
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && session.status === 'active') {
          if (mySide && !isViewer) {
            createWebRTC()
            void ch.send({ type: 'broadcast', event: 'webrtc_reset', payload: { side: mySide } })
            if (mySide === 'O') {
              void ch.send({ type: 'broadcast', event: 'webrtc_ready', payload: { side: mySide } })
            }
          } else if (isViewer) {
            void ch.send({ type: 'broadcast', event: 'request_sync', payload: { side: 'viewer' } })
          }
        }
      })

    channelRef.current = ch
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, mySide, isViewer, session.status, createWebRTC, handleGameEvent])

  // Sync state if user returns from a background tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session.status === 'active') {
        if (!isViewer && mySide) {
          sendGameEvent('request_sync', { side: mySide })
        } else if (isViewer) {
          sendGameEvent('request_sync', { side: 'viewer' })
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [session.status, isViewer, mySide, sendGameEvent])

  // Update serving side after points
  useEffect(() => {
    if (session.status !== 'active') {
      ballRef.current.inPlay = false
      return
    }
    const nextServe = pingPongServingSide(session.score_x, session.score_o, session.points_to_win)
    setServingSide(nextServe)
    setLastPointScorer(null)
    ballRef.current.inPlay = false
  }, [session.status, session.score_x, session.score_o, session.points_to_win])

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
      if (mySide === 'X') {
        paddleXRef.current = clamped
        targetPaddleXRef.current = clamped
      } else {
        paddleORef.current = clamped
        targetPaddleORef.current = clamped
      }

      const now = performance.now()
      if (now - lastPaddleBroadcastRef.current > 16) {
        lastPaddleBroadcastRef.current = now
        broadcastSeqRef.current += 1
        sendGameEvent('paddle_move', { side: mySide, x: clamped, seq: broadcastSeqRef.current })
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
            ? mySide === servingSideRef.current
            : (mySide === 'X' && ballRef.current.y >= TABLE_HEIGHT / 2) ||
              (mySide === 'O' && ballRef.current.y < TABLE_HEIGHT / 2))

      // --- 1.5. Smooth Movement ---
      // Removed lerp to minimize artificial latency. Updates are applied instantly in the broadcast handler.

      // --- 2. Physics update ---
      if (isAuthority && ballRef.current.inPlay && session.status === 'active') {
        let remainingRatio = dtRatio
        while (remainingRatio > 0 && ballRef.current.inPlay) {
          const step = Math.min(remainingRatio, 1)
          remainingRatio -= step

          const ball = ballRef.current
          ball.x += ball.vx * step
          ball.y += ball.vy * step

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
              lastBallSyncRef.current = performance.now()
              broadcastSeqRef.current += 1
              sendGameEvent('ball_sync', {
                ...ball,
                rally: rallyRef.current,
                seq: broadcastSeqRef.current,
                side: mySide,
              })
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
              lastBallSyncRef.current = performance.now()
              broadcastSeqRef.current += 1
              sendGameEvent('ball_sync', {
                ...ball,
                rally: rallyRef.current,
                seq: broadcastSeqRef.current,
                side: mySide,
              })
            }
          }

          // Out of bounds checks (score points)
          if (ball.y < -BALL_RADIUS * 2) {
            // Ball went out top => Player X scored!
            ball.inPlay = false
            void triggerPoint('X')
          } else if (ball.y > TABLE_HEIGHT + BALL_RADIUS * 2) {
            // Ball went out bottom => Player O scored!
            ball.inPlay = false
            void triggerPoint('O')
          }
        }

        // Periodic ball_sync so the non-authority client stays aligned during flight.
        // Paddle-hit broadcasts above are immediate; this covers the gaps between them.
        const now = performance.now()
        if (ballRef.current.inPlay && now - lastBallSyncRef.current > 50) {
          lastBallSyncRef.current = now
          broadcastSeqRef.current += 1
          sendGameEvent('ball_sync', {
            ...ballRef.current,
            rally: rallyRef.current,
            seq: broadcastSeqRef.current,
            side: mySide,
          })
        }
      } else if (!isAuthority && ballRef.current.inPlay && session.status === 'active') {
        // Non-authority client prediction: advance the ball.
        // It will fly past the paddle if the opponent misses, or be corrected by
        // a ball_sync if the opponent hits it.
        let remainingRatio = dtRatio
        while (remainingRatio > 0 && ballRef.current.inPlay) {
          const step = Math.min(remainingRatio, 1)
          remainingRatio -= step
          const ball = ballRef.current
          ball.x += ball.vx * step
          ball.y += ball.vy * step

          // Wall collisions (left/right)
          if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS
            ball.vx = -ball.vx
          } else if (ball.x + BALL_RADIUS > TABLE_WIDTH) {
            ball.x = TABLE_WIDTH - BALL_RADIUS
            ball.vx = -ball.vx
          }
        }
      } else if (!ballRef.current.inPlay && session.status === 'active' && !lastPointScorerRef.current) {
        // Tie ball to serving paddle before serve (only if not displaying point scored message)
        ballRef.current.x = servingSideRef.current === 'X' ? paddleXRef.current : paddleORef.current
        ballRef.current.y =
          servingSideRef.current === 'X'
            ? TABLE_HEIGHT - (PADDLE_HEIGHT + 10 + BALL_RADIUS)
            : PADDLE_HEIGHT + 10 + BALL_RADIUS
      }

      // --- 2. Canvas Drawing ---
      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT)

      // Table borders and net lines
      ctx.strokeStyle = currentTheme.lines
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, TABLE_WIDTH - 4, TABLE_HEIGHT - 4)

      // Center dividing line (vertical)
      ctx.beginPath()
      ctx.setLineDash([8, 8])
      ctx.moveTo(TABLE_WIDTH / 2, 0)
      ctx.lineTo(TABLE_WIDTH / 2, TABLE_HEIGHT)
      ctx.globalAlpha = 0.15
      ctx.lineWidth = 2
      ctx.stroke()

      // Net (horizontal across middle)
      ctx.beginPath()
      ctx.setLineDash([])
      ctx.moveTo(0, TABLE_HEIGHT / 2)
      ctx.lineTo(TABLE_WIDTH, TABLE_HEIGHT / 2)
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.globalAlpha = 1.0 // reset alpha

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
      {/* Scoreboard (Both Players) */}
      <div className="flex flex-col gap-2 w-full relative">
        {timeLeftStr && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/80 border border-slate-700 backdrop-blur-sm px-3 py-1 rounded-full text-white font-bold tracking-widest text-sm z-10 shadow-lg tabular-nums">
            {timeLeftStr}
          </div>
        )}
        {/* Top Player Banner */}
        <div
          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl glass-card border ${topPlayer.color === 'sky' ? 'bg-sky-500/10 border-sky-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}
        >
          <div className="flex items-center gap-2">
            {mySide && topPlayer.side === mySide && !isViewer && (
              <div
                title={`Connection: ${webRTCStatus}`}
                className={`w-2 h-2 rounded-full ${webRTCStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : webRTCStatus === 'fallback' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-gray-400 animate-pulse'}`}
              />
            )}
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

        {/* Bottom Player Banner */}
        <div
          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl glass-card border ${bottomPlayer.color === 'sky' ? 'bg-sky-500/10 border-sky-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}
        >
          <div className="flex items-center gap-2">
            {mySide && bottomPlayer.side === mySide && !isViewer && (
              <div
                title={`Connection: ${webRTCStatus}`}
                className={`w-2 h-2 rounded-full ${webRTCStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : webRTCStatus === 'fallback' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-gray-400 animate-pulse'}`}
              />
            )}
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

      {/* Status Footer */}
      <div className="text-center text-xs text-muted font-medium bg-[var(--surface-inset-bg)] px-4 py-2 rounded-lg border border-[var(--border)] w-full">
        {session.status_message?.startsWith('Point for')
          ? `First to ${session.points_to_win} points wins (win by 2)!`
          : session.status_message}
      </div>
    </div>
  )
}
