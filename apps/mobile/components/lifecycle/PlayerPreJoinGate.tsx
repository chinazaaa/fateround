import { ReactNode, useCallback, useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import type { Game } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'
import { preJoinScreen } from '@fateround/shared/viewers'
import { GameLoading, GameNotFound } from '@/components/game/GameChrome'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { joinGame } from '@/lib/api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'

type Props = {
  gameCode: string
  children: ReactNode
}

export function PlayerPreJoinGate({ gameCode, children }: Props) {
  const code = normalizeGameCode(gameCode)
  const [loading, setLoading] = useState(true)
  const [game, setGame] = useState<Game | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [hasPlayer, setHasPlayer] = useState(false)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(async () => {
    const session = await getPlayerSession(code)
    setHasPlayer(!!session?.playerId)
    if (session?.playerName) setJoinName(session.playerName)

    const res = await getSupabase().from('games').select(GAME_SELECT).eq('id', code).maybeSingle()
    if (res.error || !res.data) {
      setNotFound(true)
      setGame(null)
    } else {
      setNotFound(false)
      setGame(res.data as Game)
    }
    setLoading(false)
    setRefreshKey((k) => k + 1)
  }, [code])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (hasPlayer || !game) return
    const channel = getSupabase()
      .channel(uniqueTopic(`prejoin-${code}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${code}` },
        () => void reload()
      )
      .subscribe()
    return () => {
      void getSupabase().removeChannel(channel)
    }
  }, [code, game, hasPlayer, reload])

  const preJoin = game && !hasPlayer ? preJoinScreen(game, false) : null
  const { context, loading: contextLoading } = useLateJoinContext(
    code,
    game,
    preJoin === 'late_join_choice'
  )

  const joinWithMode = async (joinAsViewer: boolean) => {
    const playerName = joinName.trim()
    if (!playerName) {
      setError('Enter your name to join')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const existing = await getPlayerSession(code)
      const data = await joinGame({
        gameCode: code,
        playerName,
        resumeToken: existing?.resumeToken ?? undefined,
        joinAsViewer,
      })
      const gender = data.playerGender ?? 'both'
      await setPlayerSession(code, data.playerId, data.playerName, gender, data.resumeToken ?? null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  if (loading) return <GameLoading />
  if (notFound || !game) return <GameNotFound gameCode={code} />

  if (preJoin === 'game_ended') return <GameEndedScreen game={game} />

  if (preJoin === 'game_started_waiting') {
    return (
      <GameStartedWaitingScreen
        gameCode={code}
        game={game}
        onLobbyOpen={() => void reload()}
        key={refreshKey}
      />
    )
  }

  if (preJoin === 'late_join_choice') {
    return (
      <LateJoinChoiceScreen
        gameCode={code}
        game={game}
        context={context}
        contextLoading={contextLoading}
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        error={error}
        onJoinAsViewer={() => void joinWithMode(true)}
        onJoinAsPlayer={() => void joinWithMode(false)}
      />
    )
  }

  return <>{children}</>
}
