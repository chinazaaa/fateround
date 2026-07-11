import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Game, Round } from '@fateround/shared'
import { isWhoSaidThis, parseGameType } from '@fateround/shared/poll-games'

export function useRoundTimer(opts: {
  game: Game | null
  currentRound: Round | null
  active: boolean
  onExpire: () => void
}): number {
  const { game, currentRound, active, onExpire } = opts
  const [timeLeft, setTimeLeft] = useState(0)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (!active || !currentRound?.started_at || !game?.timer_seconds) {
      setTimeLeft(0)
      return
    }

    expiredRef.current = false
    const gameType = parseGameType(game.game_type)
    const isWst = isWhoSaidThis(gameType)
    const timerStartMs =
      isWst && currentRound.quote_text && currentRound.quote_submitted_at
        ? new Date(currentRound.quote_submitted_at).getTime()
        : new Date(currentRound.started_at).getTime()
    const endMs = timerStartMs + game.timer_seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpireRef.current()
      }
    }

    tick()
    const id = setInterval(tick, 500)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick()
    })

    return () => {
      clearInterval(id)
      sub.remove()
      setTimeLeft(0)
    }
  }, [
    active,
    currentRound?.id,
    currentRound?.started_at,
    currentRound?.quote_text,
    currentRound?.quote_submitted_at,
    game?.timer_seconds,
    game?.game_type,
  ])

  return timeLeft
}
