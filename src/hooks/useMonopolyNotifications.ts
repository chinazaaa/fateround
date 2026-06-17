'use client'

import { useEffect, useRef } from 'react'
import { formatCardAlertForPlayer } from '@/lib/monopoly-card-messages'
import { formatCashMessageForPlayer } from '@/lib/monopoly-cash-messages'
import { formatRentMessageForPlayer } from '@/lib/monopoly-rent-messages'
import { formatTradeMessageForPlayer, formatIncomingTradeAlert } from '@/lib/monopoly-trade-messages'
import {
  playGameFinishedSound,
  playRoundEndSound,
  playRoundStartSound,
  playVoteSubmittedSound,
} from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import { currentPlayerId } from '@/lib/monopoly'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

export function useMonopolyNotifications({
  game,
  board,
  myPlayerId,
  myState,
  players,
  enabled = true,
}: {
  game: Game | null
  board: MonopolyBoard | null
  myPlayerId: string | null | undefined
  myState: MonopolyPlayerState | undefined
  players: Player[]
  enabled?: boolean
}) {
  const { info, success } = useToast()
  const readyRef = useRef(false)
  const prevStatusRef = useRef<Game['status'] | null>(null)
  const prevTurnIndexRef = useRef<number | null>(null)
  const prevPhaseRef = useRef<string | null>(null)
  const prevTradeKeyRef = useRef<string | null>(null)
  const prevAuctionBidderRef = useRef<string | null>(null)
  const prevCardSeqRef = useRef<number | null>(null)
  const prevRentSeqRef = useRef<number | null>(null)
  const prevCashSeqRef = useRef<number | null>(null)
  const prevTradeEventSeqRef = useRef<number | null>(null)
  const prevBankruptRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!enabled || !game) return

    const turnIndex = board?.current_turn_index ?? null
    const phase = board?.phase ?? null
    const tradeKey =
      board?.pending_trade && myPlayerId
        ? `${board.pending_trade.from_player_id}:${board.pending_trade.to_player_id}`
        : null
    const auctionBidder = board?.auction_state?.current_bidder_id ?? null
    const cardSeq = board?.last_card_event?.seq ?? null
    const rentSeq = board?.last_rent_event?.seq ?? null
    const cashSeq = board?.last_cash_event?.seq ?? null
    const tradeEventSeq = board?.last_trade_event?.seq ?? null
    const bankrupt = myState?.bankrupt ?? false

    if (!readyRef.current) {
      readyRef.current = true
      prevStatusRef.current = game.status
      prevTurnIndexRef.current = turnIndex
      prevPhaseRef.current = phase
      prevTradeKeyRef.current = tradeKey
      prevAuctionBidderRef.current = auctionBidder
      prevCardSeqRef.current = cardSeq
      prevRentSeqRef.current = rentSeq
      prevCashSeqRef.current = cashSeq
      prevTradeEventSeqRef.current = tradeEventSeq
      prevBankruptRef.current = bankrupt
      return
    }

    const prevStatus = prevStatusRef.current
    const prevTurnIndex = prevTurnIndexRef.current
    const prevPhase = prevPhaseRef.current

    if (prevStatus === 'waiting' && game.status === 'active') {
      info('Monopoly started! 🎲')
      playRoundStartSound()
    }

    if (prevStatus === 'active' && game.status === 'finished') {
      playGameFinishedSound()
      if (board?.winner_player_id && board.winner_player_id === myPlayerId) {
        success('You win! 🏆')
      } else {
        info('Game over')
      }
    }

    if (
      board &&
      turnIndex !== null &&
      prevTurnIndex !== null &&
      turnIndex !== prevTurnIndex &&
      game.status === 'active'
    ) {
      const nowMyTurn = !!myPlayerId && currentPlayerId(board) === myPlayerId
      if (nowMyTurn) {
        info('Your turn — roll the dice 🎲')
        playRoundStartSound()
      } else {
        playRoundEndSound()
      }
    }

    if (
      board &&
      myPlayerId &&
      phase !== prevPhase &&
      currentPlayerId(board) === myPlayerId &&
      game.status === 'active'
    ) {
      if (phase === 'buy') {
        info('Property available — buy or send to auction')
        playVoteSubmittedSound()
      } else if (phase === 'pay_rent') {
        info('Rent is due')
        playVoteSubmittedSound()
      } else if (phase === 'raise_funds' && board.pending_debt?.player_id === myPlayerId) {
        info('Raise cash to pay your debt — or forfeit')
        playVoteSubmittedSound()
      } else if (phase === 'jail' && myState?.in_jail) {
        info('In jail — roll, pay, or use a card')
      }
    }

    const incomingTrade =
      board?.pending_trade && board.pending_trade.to_player_id === myPlayerId
        ? board.pending_trade
        : null

    if (tradeKey && tradeKey !== prevTradeKeyRef.current && incomingTrade) {
      const fromName =
        players.find((p) => p.id === incomingTrade.from_player_id)?.name ?? 'A player'
      info(formatIncomingTradeAlert(incomingTrade, fromName))
      playVoteSubmittedSound()
    }

    if (
      auctionBidder &&
      auctionBidder !== prevAuctionBidderRef.current &&
      auctionBidder === myPlayerId &&
      board?.phase === 'auction'
    ) {
      info('Your turn to bid in the auction')
      playVoteSubmittedSound()
    }

    if (
      board?.last_card_event &&
      cardSeq != null &&
      cardSeq !== prevCardSeqRef.current
    ) {
      const alert = formatCardAlertForPlayer(board.last_card_event, myPlayerId, players)
      info(alert.body.length > 80 ? `${alert.subtitle} — ${alert.title}` : alert.body)
      playVoteSubmittedSound()
    }

    if (
      board?.last_rent_event &&
      rentSeq != null &&
      rentSeq !== prevRentSeqRef.current &&
      myPlayerId === board.last_rent_event.payer_player_id
    ) {
      info(formatRentMessageForPlayer(board.last_rent_event, myPlayerId, players))
      playVoteSubmittedSound()
    }

    if (
      board?.last_rent_event &&
      rentSeq != null &&
      rentSeq !== prevRentSeqRef.current &&
      myPlayerId === board.last_rent_event.owner_player_id
    ) {
      info(formatRentMessageForPlayer(board.last_rent_event, myPlayerId, players))
      playVoteSubmittedSound()
    }

    if (
      board?.last_cash_event &&
      cashSeq != null &&
      cashSeq !== prevCashSeqRef.current &&
      myPlayerId === board.last_cash_event.player_id
    ) {
      info(formatCashMessageForPlayer(board.last_cash_event))
      playVoteSubmittedSound()
    }

    if (
      board?.last_trade_event &&
      tradeEventSeq != null &&
      tradeEventSeq !== prevTradeEventSeqRef.current &&
      myPlayerId &&
      (board.last_trade_event.from_player_id === myPlayerId ||
        board.last_trade_event.to_player_id === myPlayerId)
    ) {
      const msg = formatTradeMessageForPlayer(board.last_trade_event, myPlayerId, players)
      if (board.last_trade_event.outcome === 'declined') {
        info(msg)
      } else if (board.last_trade_event.outcome === 'accepted') {
        success(msg)
      } else if (board.last_trade_event.outcome === 'proposed' && board.last_trade_event.from_player_id === myPlayerId) {
        info(msg)
      }
      playVoteSubmittedSound()
    }

    if (bankrupt && !prevBankruptRef.current && myPlayerId) {
      info('You went bankrupt and are out of the game')
      playGameFinishedSound()
    }

    prevStatusRef.current = game.status
    prevTurnIndexRef.current = turnIndex
    prevPhaseRef.current = phase
    prevTradeKeyRef.current = tradeKey
    prevAuctionBidderRef.current = auctionBidder
    prevCardSeqRef.current = cardSeq
    prevRentSeqRef.current = rentSeq
    prevCashSeqRef.current = cashSeq
    prevTradeEventSeqRef.current = tradeEventSeq
    prevBankruptRef.current = bankrupt
  }, [board, enabled, game, info, myPlayerId, myState?.bankrupt, myState?.in_jail, players, success])
}
