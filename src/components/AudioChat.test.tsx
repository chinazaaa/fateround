// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { AudioChat } from '@/components/AudioChat'

// Capture the props LiveKitRoom is rendered with so the test can drive the
// callbacks (onError / onDisconnected) the way the real library would.
let lastRoomProps: Record<string, unknown> | null = null
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: Record<string, unknown>) => {
    lastRoomProps = props
    return <div data-testid="livekit-room">{props.children as React.ReactNode}</div>
  },
  RoomAudioRenderer: () => null,
  useLocalParticipant: () => ({ localParticipant: { isMicrophoneEnabled: true, setMicrophoneEnabled: vi.fn() } }),
  useParticipants: () => [],
}))

const toastError = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ error: toastError }) }))

// `voiceDisconnectMessage` is exercised by its own unit tests; keep the real one.

describe('AudioChat — Leave must not surface as a connect failure', () => {
  beforeEach(() => {
    lastRoomProps = null
    toastError.mockClear()
    localStorage.clear()
    // Next inlines NEXT_PUBLIC_* at build; under vitest it is read at runtime.
    vi.stubEnv('NEXT_PUBLIC_LIVEKIT_URL', 'wss://livekit.test')
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
        onmessage: ((e: MessageEvent) => void) | null = null
      }
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/audio-token')) {
          return { ok: true, json: async () => ({ token: 'fake-jwt' }) } as Response
        }
        if (String(url).includes('/api/audio-presence')) {
          return { ok: true, json: async () => ({ count: 0 }) } as Response
        }
        // room resolution
        return { ok: true, json: async () => ({}) } as Response
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const click = async (name: RegExp) => {
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name }))
    })
  }

  const joinVoice = async () => {
    render(<AudioChat roomCode="ABCDEF" playerName="Ada" auth={{ kind: 'player', resumeToken: 'tok-abcd' }} />)
    await click(/join voice/i)
    await waitFor(() => expect(screen.getByTestId('livekit-room')).toBeTruthy())
  }

  it('stays silent when our own Leave rejects the in-flight connect', async () => {
    await joinVoice()

    // Press Disconnect → we unmount the room. LiveKit's shouldConnect guard only
    // clears on `connect={false}`, so the cancelled connect promise still lands
    // on onError — which must not be reported as a connection failure.
    const onError = lastRoomProps!.onError as (e: Error) => void
    await click(/disconnect/i)
    onError(new Error('Client initiated disconnect'))

    expect(toastError).not.toHaveBeenCalledWith('Could not connect to voice chat. Please try again.')
  })

  it('still reports a genuine connect failure', async () => {
    await joinVoice()

    // No Leave — a real failure must still reach the player.
    const onError = lastRoomProps!.onError as (e: Error) => void
    onError(new Error('could not establish signal connection'))

    expect(toastError).toHaveBeenCalledWith('Could not connect to voice chat. Please try again.')
  })

  it('reports a connect failure again after a rejoin', async () => {
    await joinVoice()

    // Leave (arms the guard) → rejoin must disarm it, so the next real failure talks.
    await click(/disconnect/i)
    ;(lastRoomProps!.onError as (e: Error) => void)(new Error('Client initiated disconnect'))
    expect(toastError).not.toHaveBeenCalled()

    await click(/join voice/i)
    await waitFor(() => expect(screen.getByTestId('livekit-room')).toBeTruthy())
    ;(lastRoomProps!.onError as (e: Error) => void)(new Error('could not establish signal connection'))

    expect(toastError).toHaveBeenCalledWith('Could not connect to voice chat. Please try again.')
  })
})
