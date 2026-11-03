// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook, screen } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

describe('useToast', () => {
  it('does not throw outside a ToastProvider and returns callable no-ops', () => {
    // Sentry JAVASCRIPT-NEXTJS-14: a render outside the root layout used to crash here.
    const { result } = renderHook(() => useToast())
    expect(() => {
      result.current.toast('hi')
      result.current.success('ok')
      result.current.error('bad')
      result.current.info('fyi')
    }).not.toThrow()
  })

  it('still returns the real API inside a ToastProvider', () => {
    const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
    act(() => result.current.success('saved'))
    expect(screen.getByRole('status')).toHaveTextContent('saved')
  })
})
