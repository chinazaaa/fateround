// src/hooks/useGameChannel.ts
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { mergeWstPoolEntry } from '@/lib/who-said-this'
import type { Game, Participant, Player, Round, Vote, Confession, WstQuotePoolEntry } from '@/types'

export interface GameChannelState {
  setGame: React.Dispatch<React.SetStateAction<Game | null>>
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  setWstPool: React.Dispatch<React.SetStateAction<WstQuotePoolEntry[]>>
  setConfessions: React.Dispatch<React.SetStateAction<Confession[]>>
}

export interface GameChannelCallbacks {
  onGameUpdate?: (game: Game) => void
  onRoundInsert?: (round: Round) => void
  onRoundUpdate?: (round: Round) => void
  onVoteInsert?: (vote: Vote) => void
  onVoteUpdate?: (vote: Vote) => void
  onPlayerInsert?: (player: Player) => void
  onPlayerUpdate?: (player: Player) => void
  onPlayerDelete?: (player: Player) => void
  onConfessionInsert?: (confession: Confession) => void
  onHotSeatSubInsert?: (sub: { id: string; player_id: string; round_id: string }) => void
  onHotSeatSubUpdate?: (sub: { id: string; player_id: string; round_id: string }) => void
}

/**
 * Subscribes to all Supabase Realtime changes for a game.
 * Manages shared state (game, players, participants, wstPool, confessions)
 * and delegates page-specific reactions via callbacks.
 */
export function useGameChannel(
  gameCode: string,
  channelName: string,
  state: GameChannelState,
  callbacks: GameChannelCallbacks
) {
  // Stable ref for callbacks so the channel doesn't re-subscribe on every render
  const cbRef = useRef(callbacks)

  // Sync ref in a passive effect to satisfy react-hooks/refs lint rule
  useEffect(() => {
    cbRef.current = callbacks
  })

  useEffect(() => {
    const ch = supabase
      .channel(channelName)

      // ── Games ──
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const g = payload.new as Game
          state.setGame(g)
          cbRef.current.onGameUpdate?.(g)
        }
      )

      // ── Players ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          state.setPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))
          cbRef.current.onPlayerInsert?.(p)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          state.setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)))
          cbRef.current.onPlayerUpdate?.(p)
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Player
          state.setPlayers((prev) => prev.filter((x) => x.id !== p.id))
          cbRef.current.onPlayerDelete?.(p)
        }
      )

      // ── Participants ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          state.setParticipants((prev) =>
            prev.some((x) => x.id === p.id) ? prev : [...prev, p].sort((a, b) => a.display_order - b.display_order)
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          state.setParticipants((prev) => prev.map((x) => (x.id === p.id ? p : x)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Participant
          state.setParticipants((prev) => prev.filter((x) => x.id !== p.id))
        }
      )

      // ── Rounds ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onRoundInsert?.(payload.new as Round)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onRoundUpdate?.(payload.new as Round)
      )

      // ── Votes ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onVoteInsert?.(payload.new as Vote)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onVoteUpdate?.(payload.new as Vote)
      )

      // ── WST Quote Pool ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const entry = payload.new as WstQuotePoolEntry
          state.setWstPool((prev) => mergeWstPoolEntry(prev, entry))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const entry = payload.new as WstQuotePoolEntry
          state.setWstPool((prev) => mergeWstPoolEntry(prev, entry))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const entry = payload.old as WstQuotePoolEntry
          state.setWstPool((prev) => prev.filter((x) => x.id !== entry.id && x.player_id !== entry.player_id))
        }
      )

      // ── Confessions ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'confessions', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const c = payload.new as Confession
          state.setConfessions((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))
          cbRef.current.onConfessionInsert?.(c)
        }
      )

      // ── Hot Seat Submissions ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hot_seat_submissions', filter: `game_id=eq.${gameCode}` },
        (payload) =>
          cbRef.current.onHotSeatSubInsert?.(payload.new as { id: string; player_id: string; round_id: string })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hot_seat_submissions', filter: `game_id=eq.${gameCode}` },
        (payload) =>
          cbRef.current.onHotSeatSubUpdate?.(payload.new as { id: string; player_id: string; round_id: string })
      )

      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channel name is stable
  }, [gameCode, channelName])
}
