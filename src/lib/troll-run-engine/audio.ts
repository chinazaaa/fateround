/**
 * Web Audio API synthesizer for Troll Run.
 * Generates instant crisp 8-bit retro sound effects with zero external asset dependencies.
 */

export class AudioManager {
  private ctx: AudioContext | null = null
  private muted = false

  constructor() {
    // Lazy initialize on first user gesture
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null
    if (typeof window === 'undefined') return null

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public setMuted(muted: boolean): void {
    this.muted = muted
  }

  public isMuted(): boolean {
    return this.muted
  }

  public playJump(): void {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'square'
    osc.frequency.setValueAtTime(140, now)
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.09)

    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.09)
  }

  public playDeath(): void {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.16)

    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.16)
  }

  public playTrap(): void {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(480, now)
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12)

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.12)
  }

  public playClear(): void {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const notes = [261.63, 329.63, 392.0, 523.25] // C4, E4, G4, C5

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const noteStart = now + i * 0.07

      osc.type = 'square'
      osc.frequency.setValueAtTime(freq, noteStart)

      gain.gain.setValueAtTime(0.1, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.14)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(noteStart)
      osc.stop(noteStart + 0.14)
    })
  }

  public playCoin(): void {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, now) // D5
    osc.frequency.setValueAtTime(880.0, now + 0.06) // A5

    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.18)
  }
}
