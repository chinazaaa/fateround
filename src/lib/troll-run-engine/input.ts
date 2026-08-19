/**
 * Keyboard and Touch input manager for Troll Run.
 */

import type { InputState } from './types'

export class InputManager {
  private state: InputState = {
    left: false,
    right: false,
    jump: false,
    jumpPressed: false,
    jumpReleased: false,
  }

  private prevJump = false
  private activeKeys = new Set<string>()
  private cleanupFns: Array<() => void> = []

  public attachKeyboard(): void {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting browser shortcuts
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      this.activeKeys.add(e.code)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      this.activeKeys.delete(e.code)
    }

    const handleBlur = () => {
      this.activeKeys.clear()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    this.cleanupFns.push(() => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    })
  }

  public setVirtualInput(control: 'left' | 'right' | 'jump', active: boolean): void {
    const key = control === 'left' ? 'VirtualLeft' : control === 'right' ? 'VirtualRight' : 'VirtualJump'
    if (active) {
      this.activeKeys.add(key)
    } else {
      this.activeKeys.delete(key)
    }
  }

  public update(): InputState {
    const left = this.activeKeys.has('ArrowLeft') || this.activeKeys.has('KeyA') || this.activeKeys.has('VirtualLeft')

    const right =
      this.activeKeys.has('ArrowRight') || this.activeKeys.has('KeyD') || this.activeKeys.has('VirtualRight')

    const jump =
      this.activeKeys.has('ArrowUp') ||
      this.activeKeys.has('KeyW') ||
      this.activeKeys.has('Space') ||
      this.activeKeys.has('VirtualJump')

    const jumpPressed = jump && !this.prevJump
    const jumpReleased = !jump && this.prevJump

    this.prevJump = jump

    this.state = {
      left,
      right,
      jump,
      jumpPressed,
      jumpReleased,
    }

    return this.state
  }

  public getState(): InputState {
    return this.state
  }

  public reset(): void {
    this.activeKeys.clear()
    this.prevJump = false
    this.state = {
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
      jumpReleased: false,
    }
  }

  public destroy(): void {
    for (const fn of this.cleanupFns) {
      fn()
    }
    this.cleanupFns = []
  }
}
