// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WstQuotePoolStatus } from './WstQuotePoolStatus'
import type { Player } from '@/types'
import type { wstQuotePoolStatus } from '@/lib/who-said-this'

const p = (id: string, name: string) => ({ id, name }) as Player
const status = (over: Partial<ReturnType<typeof wstQuotePoolStatus>> = {}): ReturnType<typeof wstQuotePoolStatus> => ({
  submitted: [],
  awaitingQuote: [],
  notClaimed: [],
  eligible: [],
  quoteCounts: new Map<string, number>(),
  ...over,
})

describe('WstQuotePoolStatus', () => {
  it('lists submitted players (with a count when >1)', () => {
    render(
      <WstQuotePoolStatus
        status={status({
          submitted: [p('1', 'Ann'), p('2', 'Bo')],
          eligible: [p('1', 'Ann'), p('2', 'Bo')],
          quoteCounts: new Map([
            ['1', 1],
            ['2', 3],
          ]),
        })}
      />
    )
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText('✓ Ann')).toBeInTheDocument() // single quote → no count shown
    expect(screen.queryByText(/Ann \(1\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/Bo \(3\)/)).toBeInTheDocument() // count shown when >1
  })

  it('shows who is still awaiting a quote', () => {
    render(<WstQuotePoolStatus status={status({ awaitingQuote: [p('9', 'Cy')], eligible: [p('9', 'Cy')] })} />)
    expect(screen.getByText('Waiting for quote (1)')).toBeInTheDocument()
    expect(screen.getByText('Cy')).toBeInTheDocument()
  })

  it("lists players who haven't claimed a name", () => {
    render(<WstQuotePoolStatus status={status({ notClaimed: [p('5', 'Dee')] })} />)
    expect(screen.getByText(/Hasn't claimed a name \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('Dee')).toBeInTheDocument()
  })

  it('shows the empty state when nobody has joined', () => {
    render(<WstQuotePoolStatus status={status()} />)
    expect(screen.getByText('No players joined yet')).toBeInTheDocument()
  })

  it('shows ready-to-start when everyone eligible has submitted (≥2)', () => {
    render(
      <WstQuotePoolStatus
        status={status({
          submitted: [p('1', 'A'), p('2', 'B')],
          eligible: [p('1', 'A'), p('2', 'B')],
          quoteCounts: new Map([
            ['1', 1],
            ['2', 1],
          ]),
        })}
      />
    )
    expect(screen.getByText(/ready to start/)).toBeInTheDocument()
  })
})
