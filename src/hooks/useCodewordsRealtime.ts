'use client'

import { useEffect, useRef } from 'react'
import { mergeCodewordsGuesses, mergeCodewordsRoles } from '@/lib/codewords'
import { supabase } from '@/lib/supabase'
import type { CodewordsBoard, CodewordsGuess, CodewordsPlayerRole, Game, Player } from '@/types'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'

type CodewordsSyncHandlers = {
  onGame?: (game: Game) => void
  onPlayers?: (updater: (prev: Player[]) => Player[]) => void
  onRoles?: (updater: (prev: CodewordsPlayerRole[]) => CodewordsPlayerRole[]) => void
  onBoard?: (board: CodewordsBoard | null) => void
  onGuesses?: (updater: (prev: CodewordsGuess[]) => CodewordsGuess[]) => void
  onReload?: () => void | Promise<void>
}

export function useCodewordsRealtime(gameCode: string, channelId: string, handlers: CodewordsSyncHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  usePolling(
    async () => {
      await handlersRef.current.onReload?.()
      return true
    },
    [channelId, gameCode],
    { intervalMs: POLL_INTERVALS.realtimeFallback }
  )

  useEffect(() => {
    const channel = supabase
      .channel(`codewords-sync-${channelId}-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (p) => {
          handlersRef.current.onGame?.(p.new as Game)
          void handlersRef.current.onReload?.()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (p) => {
          const player = p.new as Player
          handlersRef.current.onPlayers?.((prev) => (prev.some((x) => x.id === player.id) ? prev : [...prev, player]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (p) => {
          const player = p.new as Player
          handlersRef.current.onPlayers?.((prev) => prev.map((x) => (x.id === player.id ? player : x)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (p) => {
          const player = p.old as Player
          handlersRef.current.onPlayers?.((prev) => prev.filter((x) => x.id !== player.id))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'codewords_player_roles', filter: `game_id=eq.${gameCode}` },
        (p) => {
          handlersRef.current.onRoles?.((prev) => mergeCodewordsRoles(prev, p.new as CodewordsPlayerRole))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'codewords_player_roles', filter: `game_id=eq.${gameCode}` },
        (p) => {
          handlersRef.current.onRoles?.((prev) => mergeCodewordsRoles(prev, p.new as CodewordsPlayerRole))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'codewords_player_roles', filter: `game_id=eq.${gameCode}` },
        (p) => {
          const role = p.old as CodewordsPlayerRole
          handlersRef.current.onRoles?.((prev) => mergeCodewordsRoles(prev, [], role.player_id))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'codewords_boards', filter: `game_id=eq.${gameCode}` },
        (p) => handlersRef.current.onBoard?.(p.new as CodewordsBoard)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'codewords_boards', filter: `game_id=eq.${gameCode}` },
        (p) => handlersRef.current.onBoard?.(p.new as CodewordsBoard)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'codewords_boards', filter: `game_id=eq.${gameCode}` },
        () => handlersRef.current.onBoard?.(null)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'codewords_guesses', filter: `game_id=eq.${gameCode}` },
        (p) => {
          handlersRef.current.onGuesses?.((prev) => mergeCodewordsGuesses(prev, p.new as CodewordsGuess))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'codewords_guesses', filter: `game_id=eq.${gameCode}` },
        () => {
          handlersRef.current.onGuesses?.(() => [])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId, gameCode])
}
