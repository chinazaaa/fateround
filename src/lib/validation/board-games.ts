import { z } from 'zod'
import { normalizeTradePropertyList } from '@/lib/monopoly-trade-messages'
import { gameCodeString, uuidString } from './shared'
import { hostActionSchema } from './game'

export const monopolyActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const monopolyBuySchema = monopolyActionSchema.extend({
  // 'buy' = purchase it · 'auction' = decline and put it up for auction · 'pass' =
  // decline and skip the auction, the turn just moves on.
  decision: z.enum(['buy', 'auction', 'pass']),
})

export const monopolyJailSchema = monopolyActionSchema.extend({
  method: z.enum(['pay', 'card']),
})

export const monopolyAuctionSchema = monopolyActionSchema.extend({
  action: z.enum(['pass', 'bid']),
  amount: z.number().int().min(1).optional(),
})

export const monopolyBuildSchema = monopolyActionSchema.extend({
  spaceIndex: z.number().int().min(0).max(47),
  action: z.enum(['buy_house', 'sell_house', 'buy_hotel', 'sell_hotel']),
})

export const monopolyMortgageSchema = monopolyActionSchema.extend({
  spaceIndex: z.number().int().min(0).max(47),
  action: z.enum(['mortgage', 'unmortgage']),
})

const monopolyTradePropertyListSchema = z.preprocess(
  (raw) => normalizeTradePropertyList(raw),
  z.array(z.number().int().min(0).max(47))
)

export const monopolyTradeProposeSchema = monopolyActionSchema.extend({
  toPlayerId: uuidString('toPlayerId'),
  offerCash: z.number().int().min(0).default(0),
  offerProperties: monopolyTradePropertyListSchema.default([]),
  offerGetOutCards: z.number().int().min(0).max(2).default(0),
  requestCash: z.number().int().min(0).default(0),
  requestProperties: monopolyTradePropertyListSchema.default([]),
  requestGetOutCards: z.number().int().min(0).max(2).default(0),
})

export const monopolyTradeRespondSchema = monopolyActionSchema.extend({
  accept: z.boolean(),
})

export const monopolyTradeCancelSchema = monopolyActionSchema

export const monopolyTradeRepairSchema = monopolyActionSchema.extend({
  repair: z.literal(true).optional(),
})

// Borrow and repay take the same shape: an action plus a positive whole-money amount.
const monopolyLoanAmountSchema = monopolyActionSchema.extend({
  amount: z.number().int().min(1),
})

export const monopolyBorrowLoanSchema = monopolyLoanAmountSchema
export const monopolyRepayLoanSchema = monopolyLoanAmountSchema

export type MonopolyActionInput = z.infer<typeof monopolyActionSchema>
export type MonopolyBuyInput = z.infer<typeof monopolyBuySchema>
export type MonopolyJailInput = z.infer<typeof monopolyJailSchema>
export type MonopolyBorrowLoanInput = z.infer<typeof monopolyBorrowLoanSchema>
export type MonopolyRepayLoanInput = z.infer<typeof monopolyRepayLoanSchema>

// ---------------------------------------------------------------------------
// Yahtzee (POST /api/yahtzee/*)
// ---------------------------------------------------------------------------

export const yahtzeeRollSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const yahtzeeHoldSchema = yahtzeeRollSchema.extend({
  held: z.array(z.boolean()).length(5),
})

export const yahtzeeScoreCategoryEnum = z.enum([
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'three_kind',
  'four_kind',
  'full_house',
  'small_straight',
  'large_straight',
  'yahtzee',
  'chance',
])

export const yahtzeeScoreSchema = yahtzeeRollSchema.extend({
  category: yahtzeeScoreCategoryEnum,
})

export type YahtzeeRollInput = z.infer<typeof yahtzeeRollSchema>
export type YahtzeeHoldInput = z.infer<typeof yahtzeeHoldSchema>
export type YahtzeeScoreInput = z.infer<typeof yahtzeeScoreSchema>

// Whot (POST /api/whot/*)

const whotShapeEnum = z.enum(['circle', 'cross', 'triangle', 'square', 'star', 'whot'])

export const whotActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const whotPlaySchema = whotActionSchema.extend({
  cardId: z.string().min(1),
})

export const whotDrawSchema = whotActionSchema

export const whotChooseSchema = whotActionSchema.extend({
  shape: whotShapeEnum.optional(),
  number: z.coerce.number().int().min(1).max(14).optional(),
})

export type WhotPlayInput = z.infer<typeof whotPlaySchema>
export type WhotDrawInput = z.infer<typeof whotDrawSchema>
export type WhotChooseInput = z.infer<typeof whotChooseSchema>

// Crazy Eights (POST /api/crazy-eights/*)

const crazyEightsSuitEnum = z.enum(['spades', 'clubs', 'hearts', 'diamonds'])

export const crazyEightsActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const crazyEightsPlaySchema = crazyEightsActionSchema.extend({
  cardId: z.string().min(1),
})

export const crazyEightsDrawSchema = crazyEightsActionSchema

export const crazyEightsChooseSchema = crazyEightsActionSchema.extend({
  suit: crazyEightsSuitEnum,
})

export type CrazyEightsPlayInput = z.infer<typeof crazyEightsPlaySchema>
export type CrazyEightsDrawInput = z.infer<typeof crazyEightsDrawSchema>
export type CrazyEightsChooseInput = z.infer<typeof crazyEightsChooseSchema>

// UNO (POST /api/uno/*)

const unoColorEnum = z.enum(['red', 'yellow', 'green', 'blue'])

export const unoActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const unoPlaySchema = unoActionSchema.extend({
  cardId: z.string().min(1),
  // True when the player is calling "UNO" as they play their second-to-last card.
  callUno: z.coerce.boolean().optional(),
})

export const unoPlayMultiSchema = unoActionSchema.extend({
  // Cards to lay down together, in play order (the last one stays on top).
  cardIds: z.array(z.string().min(1)).min(2).max(20),
  callUno: z.coerce.boolean().optional(),
})

export const unoJumpInSchema = unoActionSchema.extend({
  // The exact-match card played out of turn.
  cardId: z.string().min(1),
  callUno: z.coerce.boolean().optional(),
})

export const unoDrawSchema = unoActionSchema

export const unoChooseSchema = unoActionSchema.extend({
  color: unoColorEnum,
})

export const unoChallengeSchema = unoActionSchema.extend({
  // true = challenge the Wild Draw Four, false = accept the draw.
  challenge: z.coerce.boolean(),
})

export const unoCallSchema = unoActionSchema

export const unoPassSchema = unoActionSchema

export const unoSwapSchema = unoActionSchema.extend({
  // The player to swap hands with (0-7 rule, on a 7).
  targetId: z.string().min(1),
})

export const unoTeamLeaveSchema = unoActionSchema.extend({
  // Team-Up: after a teammate leaves, the remaining partner continues solo or forfeits.
  decision: z.enum(['continue', 'forfeit']),
})

export type UnoPlayInput = z.infer<typeof unoPlaySchema>
export type UnoDrawInput = z.infer<typeof unoDrawSchema>
export type UnoChooseInput = z.infer<typeof unoChooseSchema>
export type UnoChallengeInput = z.infer<typeof unoChallengeSchema>

// Ludo (POST /api/ludo/*)

export const ludoActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const ludoMoveSchema = ludoActionSchema.extend({
  pieceId: z.coerce.number().int().min(0).max(3),
  diceIndex: z.coerce.number().int().min(0).max(1).optional(),
})

export const ludoExpireSchema = z.object({
  gameId: gameCodeString(),
})

export type LudoMoveInput = z.infer<typeof ludoMoveSchema>

// Snake & Ladder (POST /api/snake-and-ladder/*)

export const snakeLadderActionSchema = z.object({
  gameId: gameCodeString(),
  // Authorization is by the secret resume_token (resolved to a player server-side),
  // not a client-supplied playerId. The token travels with the player across devices,
  // so cross-device resume keeps working.
  resumeToken: z.string().min(4),
})

export const snakeLadderExpireSchema = z.object({
  gameId: gameCodeString(),
})

// Mahjong (POST /api/mahjong/*)

export const mahjongDrawSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  resumeToken: z.string().min(4).optional(),
})

export const mahjongDiscardSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  resumeToken: z.string().min(4).optional(),
  tile: z.string().min(2).max(8),
})

export const mahjongClaimSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  resumeToken: z.string().min(4).optional(),
  claimType: z.enum(['mahjong', 'chow', 'pung', 'kong']),
  tiles: z.array(z.string().min(2).max(8)).max(4).optional(),
})

export const mahjongPassSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  resumeToken: z.string().min(4).optional(),
})

export const mahjongRiichiSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  resumeToken: z.string().min(4).optional(),
})

export const mahjongNextHandSchema = hostActionSchema.extend({
  gameId: gameCodeString(),
})

export const mahjongPenaltySchema = hostActionSchema.extend({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  penaltyType: z.enum(['chombo']),
})

export const mahjongExpireSchema = z.object({
  gameId: gameCodeString(),
})

// Tic-Tac-Toe (POST /api/tic-tac-toe/*)

export const ticTacToeMoveSchema = z.object({
  gameId: gameCodeString(),
  // Authorization is by the secret resume_token (resolved to a player server-side),
  // not a client-supplied playerId. The token travels with the player across devices,
  // so cross-device resume keeps working.
  resumeToken: z.string().min(4),
  // 0-80: sub-board = floor(cellIndex/9), cell within board = cellIndex % 9.
  cellIndex: z.coerce.number().int().min(0).max(80),
})

export const ticTacToeExpireSchema = z.object({
  gameId: gameCodeString(),
})

export type TicTacToeMoveInput = z.infer<typeof ticTacToeMoveSchema>

const chessSquare = z.string().regex(/^[a-h][1-8]$/, 'Invalid square')

export const chessMoveSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  from: chessSquare,
  to: chessSquare,
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
})

export const chessExpireSchema = z.object({
  gameId: gameCodeString(),
})

export const chessResignSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export type ChessMoveInput = z.infer<typeof chessMoveSchema>

// Checkers square id: 'rc' (row 0-7, col 0-7); the engine further checks it's a dark square.
const checkersSquare = z.string().regex(/^[0-7][0-7]$/, 'Invalid square')

export const checkersMoveSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  from: checkersSquare,
  to: checkersSquare,
})

export const checkersExpireSchema = z.object({
  gameId: gameCodeString(),
})

export const checkersResignSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export type CheckersMoveInput = z.infer<typeof checkersMoveSchema>

// Draughts10 (International/Nigerian checkers, 10x10 board)
const draughts10Square = z.string().regex(/^[0-9][0-9]$/, 'Invalid square')

export const draughts10MoveSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
  from: draughts10Square,
  to: draughts10Square,
})

export type Draughts10MoveInput = z.infer<typeof draughts10MoveSchema>

// Nigerian Draughts "Street Rules" — huff a piece instead of moving.
export const draughts10HuffSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
  square: draughts10Square,
})

export type Draughts10HuffInput = z.infer<typeof draughts10HuffSchema>

// Ayo (pit index 0–11)
export const ayoMoveSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
  pitIndex: z.coerce.number().int().min(0).max(11),
})

export const ayoExpireSchema = z.object({
  gameId: gameCodeString(),
})

export const ayoResignSchema = z.object({
  gameId: gameCodeString(),
  resumeToken: z.string().min(4),
})

export type AyoMoveInput = z.infer<typeof ayoMoveSchema>

// Scrabble (POST /api/scrabble/*)

export const scrabbleActionSchema = z.object({
  gameId: gameCodeString(),
  // Player action authorized by the secret resume_token (see snakeLadderActionSchema).
  resumeToken: z.string().min(4),
})

export const scrabblePlaySchema = scrabbleActionSchema.extend({
  tiles: z
    .array(
      z.object({
        row: z.coerce.number().int().min(0).max(14),
        col: z.coerce.number().int().min(0).max(14),
        letter: z.string().regex(/^[A-Za-zÄÖÜÑäöüñ]$/),
        isBlank: z.boolean(),
      })
    )
    .min(1)
    .max(7),
})

export const scrabbleExchangeSchema = scrabbleActionSchema.extend({
  tileIndices: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
})

export const scrabblePassSchema = scrabbleActionSchema

export const scrabbleExpireSchema = z.object({
  gameId: gameCodeString(),
})

export const scrabbleExtendTimeSchema = hostActionSchema.extend({
  extensionSeconds: z.coerce.number().int().positive(),
})

export type ScrabblePlayInput = z.infer<typeof scrabblePlaySchema>
export type ScrabbleExchangeInput = z.infer<typeof scrabbleExchangeSchema>
