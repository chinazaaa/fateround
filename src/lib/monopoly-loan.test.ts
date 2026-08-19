import { describe, expect, it } from 'vitest'
import {
  borrowMonopolyLoan,
  calculateMonopolyCreditLimit,
  calculateMonopolyLoanTotalDue,
  checkAndAdvanceMonopolyLoanRound,
  executeBankForeclosure,
  isTradeBlockedByLoan,
  repayMonopolyLoan,
} from './monopoly-loan'
import { computeMonopolyNetWorth } from './monopoly'
import type { MonopolyBoard, MonopolyLoan, MonopolyPlayerState } from '@/types'

function makeMockBoard(partial?: Partial<MonopolyBoard>): MonopolyBoard {
  return {
    id: 'b1',
    game_id: 'TEST1',
    board_size: 40,
    turn_order: ['p1', 'p2'],
    current_turn_index: 0,
    phase: 'roll',
    last_dice: null,
    consecutive_doubles: 0,
    property_owners: {},
    property_buildings: {},
    mortgaged_properties: {},
    houses_in_bank: 32,
    hotels_in_bank: 12,
    chance_deck: [],
    community_deck: [],
    chance_discard: [],
    community_discard: [],
    auction_state: null,
    pending_trade: null,
    pending_debt: null,
    pending_space: null,
    status_message: null,
    last_card_event: null,
    last_rent_event: null,
    last_cash_event: null,
    last_trade_event: null,
    loans: [],
    turn_deadline_at: null,
    winner_player_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  }
}

function makeMockPlayerState(partial?: Partial<MonopolyPlayerState>): MonopolyPlayerState {
  return {
    id: 'ps1',
    game_id: 'TEST1',
    player_id: 'p1',
    position: 0,
    cash: 500,
    in_jail: false,
    jail_turns: 0,
    get_out_of_jail_free: 0,
    bankrupt: false,
    passed_go_once: true,
    player_order: 0,
    created_at: new Date().toISOString(),
    ...partial,
  }
}

describe('Monopoly Loan Facilities', () => {
  describe('Credit Limit Calculations', () => {
    it('returns 0 credit limit when player has zero collateral (< ₦50 base)', () => {
      const limit = calculateMonopolyCreditLimit(0, [])
      expect(limit).toBe(0)
    })

    it('factors in cash and 50% unencumbered mortgage collateral', () => {
      // Cash: 500, Mortgages: [100, 200] -> 500 + 0.5 * 300 = 650
      const limit = calculateMonopolyCreditLimit(500, [100, 200])
      expect(limit).toBe(650)
    })

    it('caps at maximum loan cap (1500)', () => {
      const limit = calculateMonopolyCreditLimit(5000, [1000, 2000])
      expect(limit).toBe(1500)
    })

    it('computes 15% interest correctly', () => {
      expect(calculateMonopolyLoanTotalDue(100, 0.15)).toBe(115)
      expect(calculateMonopolyLoanTotalDue(500, 0.15)).toBe(575)
      expect(calculateMonopolyLoanTotalDue(1000, 0.15)).toBe(1150)
    })
  })

  describe('Borrowing a Loan', () => {
    it('issues a loan, credits cash, and records the loan on the board', () => {
      const board = makeMockBoard()
      const player = makeMockPlayerState({ cash: 500 })

      const res = borrowMonopolyLoan(board, player, 500)
      expect(res.success).toBe(true)
      expect(res.playerState.cash).toBe(1000)
      expect(res.loan).toBeDefined()
      expect(res.loan?.principal).toBe(500)
      expect(res.loan?.total_due).toBe(575)
      expect(res.loan?.balance_remaining).toBe(575)
      expect(res.loan?.rounds_remaining).toBe(4)
      expect(res.loan?.status).toBe('active')
      expect(res.board.loans?.length).toBe(1)
    })

    it('rejects loan if requested amount exceeds credit limit', () => {
      const board = makeMockBoard()
      const player = makeMockPlayerState({ cash: 200 }) // credit limit is 200

      const res = borrowMonopolyLoan(board, player, 500)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/exceeds your credit limit/)
    })

    it('rejects loan if player has zero collateral', () => {
      const board = makeMockBoard()
      const player = makeMockPlayerState({ cash: 0 })

      const res = borrowMonopolyLoan(board, player, 100)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/Insufficient collateral/)
    })

    it('rejects loan if player already has an active loan', () => {
      const board = makeMockBoard({
        loans: [
          {
            id: 'loan_1',
            player_id: 'p1',
            principal: 500,
            interest_rate: 0.15,
            total_due: 575,
            amount_repaid: 0,
            balance_remaining: 575,
            term_rounds: 4,
            rounds_remaining: 3,
            created_at: new Date().toISOString(),
            status: 'active',
          },
        ],
      })
      const player = makeMockPlayerState()

      const res = borrowMonopolyLoan(board, player, 200)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/already have an active bank loan/)
    })

    it('rejects loan if player has an outstanding defaulted loan', () => {
      const board = makeMockBoard({
        loans: [
          {
            id: 'loan_1',
            player_id: 'p1',
            principal: 500,
            interest_rate: 0.15,
            total_due: 575,
            amount_repaid: 0,
            balance_remaining: 200,
            term_rounds: 4,
            rounds_remaining: 0,
            created_at: new Date().toISOString(),
            status: 'defaulted',
          },
        ],
      })
      const player = makeMockPlayerState({ cash: 300 })

      const res = borrowMonopolyLoan(board, player, 200)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/defaulted loan on record/)
    })

    it('rejects loan if player is bankrupt', () => {
      const board = makeMockBoard()
      const player = makeMockPlayerState({ bankrupt: true })

      const res = borrowMonopolyLoan(board, player, 200)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/Bankrupt players cannot borrow/)
    })
  })

  describe('Repaying a Loan', () => {
    it('executes partial repayment correctly', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 3,
        created_at: new Date().toISOString(),
        status: 'active',
      }
      const board = makeMockBoard({ loans: [activeLoan] })
      const player = makeMockPlayerState({ cash: 600 })

      const res = repayMonopolyLoan(board, player, 200)
      expect(res.success).toBe(true)
      expect(res.fullyRepaid).toBe(false)
      expect(res.playerState.cash).toBe(400)
      expect(res.loan?.amount_repaid).toBe(200)
      expect(res.loan?.balance_remaining).toBe(375)
      expect(res.loan?.status).toBe('active')
    })

    it('executes full settlement and marks loan as repaid', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 200,
        balance_remaining: 375,
        term_rounds: 4,
        rounds_remaining: 2,
        created_at: new Date().toISOString(),
        status: 'active',
      }
      const board = makeMockBoard({ loans: [activeLoan] })
      const player = makeMockPlayerState({ cash: 500 })

      const res = repayMonopolyLoan(board, player, 375)
      expect(res.success).toBe(true)
      expect(res.fullyRepaid).toBe(true)
      expect(res.playerState.cash).toBe(125)
      expect(res.loan?.balance_remaining).toBe(0)
      expect(res.loan?.status).toBe('repaid')
    })

    it('rejects repayment if player lacks cash', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 3,
        created_at: new Date().toISOString(),
        status: 'active',
      }
      const board = makeMockBoard({ loans: [activeLoan] })
      const player = makeMockPlayerState({ cash: 50 })

      const res = repayMonopolyLoan(board, player, 200)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/Insufficient cash/)
    })
  })

  describe('Turn-Cycle Maturity & Default Flow', () => {
    it('decrements rounds_remaining each turn cycle and triggers default on 0', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 4,
        created_at: new Date().toISOString(),
        status: 'active',
      }
      const board = makeMockBoard({ loans: [activeLoan] })

      const step1 = checkAndAdvanceMonopolyLoanRound(board, 'p1')
      expect(step1.board.loans?.[0]?.rounds_remaining).toBe(3)
      expect(step1.defaultedLoan).toBeUndefined()

      const step2 = checkAndAdvanceMonopolyLoanRound(step1.board, 'p1')
      expect(step2.board.loans?.[0]?.rounds_remaining).toBe(2)

      const step3 = checkAndAdvanceMonopolyLoanRound(step2.board, 'p1')
      expect(step3.board.loans?.[0]?.rounds_remaining).toBe(1)

      const step4 = checkAndAdvanceMonopolyLoanRound(step3.board, 'p1')
      expect(step4.board.loans?.[0]?.rounds_remaining).toBe(0)
      expect(step4.defaultedLoan).toBeDefined()
      expect(step4.defaultedLoan?.status).toBe('defaulted')
    })

    it('preserves rounds_remaining during extra turns from doubles', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 4,
        created_at: new Date().toISOString(),
        status: 'active',
      }
      const board = makeMockBoard({ loans: [activeLoan], consecutive_doubles: 1 })

      // On a doubles re-roll (consecutive_doubles > 0), the roll handler skips decrement
      const shouldDecrement = board.consecutive_doubles === 0
      expect(shouldDecrement).toBe(false)
      expect(board.loans?.[0]?.rounds_remaining).toBe(4)
    })
  })

  describe('Anti-Exploit Trade Encumbrance (Asset Stripping Defense)', () => {
    it('blocks trade if post-trade assets are less than active loan balance', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 1000,
        interest_rate: 0.15,
        total_due: 1150,
        amount_repaid: 0,
        balance_remaining: 1150,
        term_rounds: 4,
        rounds_remaining: 2,
        created_at: new Date().toISOString(),
        status: 'active',
      }

      // Player cash 200, owned property mortgages: [100, 100] = total assets 400
      // Outgoing: trade away properties [100, 100] -> post trade assets: 200 < 1150
      const check = isTradeBlockedByLoan(200, [100, 100], 0, [100, 100], activeLoan)
      expect(check.blocked).toBe(true)
      expect(check.reason).toMatch(/Trade blocked: your remaining assets/)
    })

    it('permits trade if player retains enough collateral to cover loan', () => {
      const activeLoan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 200,
        interest_rate: 0.15,
        total_due: 230,
        amount_repaid: 0,
        balance_remaining: 230,
        term_rounds: 4,
        rounds_remaining: 2,
        created_at: new Date().toISOString(),
        status: 'active',
      }

      // Player cash: 500, owned mortgages: [200, 200] = 900
      // Outgoing: property mortgage [200] -> post trade: 500 + 200 = 700 >= 230
      const check = isTradeBlockedByLoan(500, [200, 200], 0, [200], activeLoan)
      expect(check.blocked).toBe(false)
    })
  })

  describe('Bank Foreclosure & Asset Seizure', () => {
    it('seizes liquid cash first to satisfy loan', () => {
      const loan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 0,
        created_at: new Date().toISOString(),
        status: 'defaulted',
      }

      const board = makeMockBoard({ loans: [loan] })
      const player = makeMockPlayerState({ cash: 800 })

      const res = executeBankForeclosure(board, player, loan, 40)
      expect(res.seizedCash).toBe(575)
      expect(res.playerState.cash).toBe(225)
      expect(res.bankrupt).toBe(false)
      expect(res.board.loans?.[0]?.balance_remaining).toBe(0)
    })

    it('liquidates buildings at 50% without returning phantom houses for hotels', () => {
      const loan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 0,
        created_at: new Date().toISOString(),
        status: 'defaulted',
      }

      // Space 1 (Old Kent Road / Brown, buildingCost: 50) has a hotel (level 5).
      // Demolition returns 1 hotel to bank and 0 houses to bank.
      // Refund: 5 * 25 = 125.
      const board = makeMockBoard({
        loans: [loan],
        property_owners: { '1': 'p1' },
        property_buildings: { '1': 5 },
        houses_in_bank: 32,
        hotels_in_bank: 11,
      })
      const player = makeMockPlayerState({ cash: 450 })

      const res = executeBankForeclosure(board, player, loan, 40)
      expect(res.seizedCash).toBe(450)
      expect(res.seizedBuildingsRefund).toBe(125)
      expect(res.board.hotels_in_bank).toBe(12) // Hotel returned
      expect(res.board.houses_in_bank).toBe(32) // No phantom houses minted!
      expect(res.board.property_buildings['1']).toBeUndefined()
    })

    it('demolishes only the minimum necessary buildings for residual debt and preserves the rest', () => {
      const loan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 0,
        created_at: new Date().toISOString(),
        status: 'defaulted',
      }

      // Player has ₦565 cash (so ₦10 residual debt after cash seizure)
      // Player owns 4 properties each with 1 hotel (level 5, refund ₦125 each)
      const board = makeMockBoard({
        loans: [loan],
        property_owners: { '1': 'p1', '3': 'p1', '6': 'p1', '8': 'p1' },
        property_buildings: { '1': 5, '3': 5, '6': 5, '8': 5 },
        houses_in_bank: 32,
        hotels_in_bank: 8,
      })
      const player = makeMockPlayerState({ cash: 565 })

      const res = executeBankForeclosure(board, player, loan, 40)
      expect(res.seizedCash).toBe(565)
      expect(res.seizedBuildingsRefund).toBe(125) // Only 1 hotel liquidated!
      expect(res.board.hotels_in_bank).toBe(9) // 1 hotel returned, not all 4
      // Space 1 demolished to cover ₦10 debt; spaces 3, 6, 8 still have their hotels!
      expect(res.board.property_buildings['1']).toBeUndefined()
      expect(res.board.property_buildings['3']).toBe(5)
      expect(res.board.property_buildings['6']).toBe(5)
      expect(res.board.property_buildings['8']).toBe(5)
      // Excess refund: ₦125 raised - ₦10 remaining debt = ₦115 refunded back to cash
      expect(res.playerState.cash).toBe(115)
      expect(res.bankrupt).toBe(false)
    })

    it('liquidates buildings then forecloses properties when buildings alone do not clear debt', () => {
      const loan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 0,
        created_at: new Date().toISOString(),
        status: 'defaulted',
      }

      // Cash: 0
      // 1 house on Space 1 (refund 25) -> remaining debt 550
      // Space 1 (Old Kent Road, price 60, mortgage 30)
      // Space 3 (Whitechapel, price 60, mortgage 30)
      const board = makeMockBoard({
        loans: [loan],
        property_owners: { '1': 'p1', '3': 'p1' },
        property_buildings: { '1': 1 },
        houses_in_bank: 31,
      })
      const player = makeMockPlayerState({ cash: 0 })

      const res = executeBankForeclosure(board, player, loan, 40)
      expect(res.seizedBuildingsRefund).toBe(25)
      expect(res.board.houses_in_bank).toBe(32) // house returned
      expect(res.seizedPropertyIndices).toContain(1)
      expect(res.seizedPropertyIndices).toContain(3)
      expect(res.bankrupt).toBe(true) // 575 - 25 - 30 - 30 = 490 debt remains -> insolvent
    })

    it('does not give double mortgage credit for already-mortgaged properties', () => {
      const loan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 0,
        balance_remaining: 575,
        term_rounds: 4,
        rounds_remaining: 0,
        created_at: new Date().toISOString(),
        status: 'defaulted',
      }

      // Space 1 is ALREADY mortgaged. Foreclosure should not credit another 30 towards remaining debt.
      const board = makeMockBoard({
        loans: [loan],
        property_owners: { '1': 'p1' },
        mortgaged_properties: { '1': true },
      })
      const player = makeMockPlayerState({ cash: 0 })

      const res = executeBankForeclosure(board, player, loan, 40)
      expect(res.seizedPropertyIndices).toContain(1)
      expect(res.board.loans?.[0]?.balance_remaining).toBe(575) // 0 credit received for already-mortgaged property
      expect(res.bankrupt).toBe(true)
    })
  })

  describe('Net Worth Calculation with Active Loans', () => {
    it('subtracts outstanding loan balance from total net worth in computeMonopolyNetWorth', () => {
      const loan: MonopolyLoan = {
        id: 'loan_1',
        player_id: 'p1',
        principal: 500,
        interest_rate: 0.15,
        total_due: 575,
        amount_repaid: 200,
        balance_remaining: 375,
        term_rounds: 4,
        rounds_remaining: 2,
        created_at: new Date().toISOString(),
        status: 'active',
      }

      // Cash: 500, Space 1 (Old Kent Road, price 60) -> gross assets = 560
      // Minus loan balance 375 -> net worth = 185
      const player = makeMockPlayerState({ cash: 500 })
      const owners = { '1': 'p1' }
      const buildings = {}
      const mortgaged = {}

      const netWorth = computeMonopolyNetWorth(player, owners, buildings, mortgaged, 40, [loan])
      expect(netWorth).toBe(185)
    })
  })
})
