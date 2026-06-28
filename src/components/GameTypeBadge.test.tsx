// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameTypeBadge } from './GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'

describe('GameTypeBadge', () => {
  it('renders the game type label and emoji', () => {
    render(<GameTypeBadge gameType="scrabble" />)
    const cfg = gameTypeConfig('scrabble')
    expect(screen.getByText(cfg.label)).toBeInTheDocument()
    expect(screen.getByText(cfg.card.emoji)).toBeInTheDocument()
  })

  it('falls back to the default config for an unknown game type', () => {
    render(<GameTypeBadge gameType="definitely_not_a_game" />)
    const fallback = gameTypeConfig('smash_marry_kill') // parseGameType's default
    expect(screen.getByText(fallback.label)).toBeInTheDocument()
  })
})
