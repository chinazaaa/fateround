// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GameSettingsProvider, useGameSettingsContent, useRegisterGameSettings } from '@/components/GameSettingsContext'

// Reads the current registered content and exposes it via a data attribute so a test
// can assert against whichever caller "won" the single content slot at any point.
function Consumer() {
  const content = useGameSettingsContent()
  return <div data-testid="content">{content}</div>
}

function Register({ label, enabled = true }: { label: string; enabled?: boolean }) {
  useRegisterGameSettings(<span>{label}</span>, enabled)
  return null
}

describe('useRegisterGameSettings', () => {
  it('a disabled caller does not clear another caller’s active registration', () => {
    // Regression for the WG host-plays-along bug: when the host view registered its
    // hostSettingsNode and the embedded player view called
    // `useRegisterGameSettings(null)`, the player's cleanup ran `register(null)` and
    // wiped the host's registration for a beat. With `enabled=false` the disabled
    // caller is fully silent — neither the mount effect nor the cleanup touches the
    // shared content slot, so the host node survives.
    const { getByTestId, rerender, unmount } = render(
      <GameSettingsProvider>
        <Register label="host-node" />
        <Register label="player-node" enabled={false} />
        <Consumer />
      </GameSettingsProvider>
    )
    expect(getByTestId('content').textContent).toBe('host-node')

    // Unmounting the disabled caller must not clear the host either.
    rerender(
      <GameSettingsProvider>
        <Register label="host-node" />
        <Consumer />
      </GameSettingsProvider>
    )
    expect(getByTestId('content').textContent).toBe('host-node')

    unmount()
  })

  it('an enabled caller with a null node clears whatever was registered', () => {
    // Original behaviour preserved: `enabled=true` + `node=null` is the explicit "clear
    // my contribution" path. This test locks that in so a later refactor can’t collapse
    // the two knobs together and silently break either.
    const { getByTestId } = render(
      <GameSettingsProvider>
        <Register label="host-node" />
        <Register label="null-here" enabled />
        {/* Register the null node LAST so it "wins" the slot — this reproduces the
            single-writer semantics of the provider without needing to reach in for
            the setter directly. */}
        <NullRegister />
        <Consumer />
      </GameSettingsProvider>
    )
    expect(getByTestId('content').textContent).toBe('')
  })
})

function NullRegister() {
  useRegisterGameSettings(null, true)
  return null
}
