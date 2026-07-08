/**
 * Arctic Theme Sound Effects for Monopoly Polar Wilderness Edition.
 * Synthesized using Web Audio API to create crisp ice chimes, snow crunches,
 * blizzard winds, and ethereal aurora borealis resonances.
 */

import { ensureContext, getAudioContext, isSoundMuted } from '@/lib/sounds'

/** Crisp crystalline Nordic ice chime ("Ping-Ting!") when an Arctic turn starts. */
export async function playArcticWindChimeSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playChime = (start: number, freq: number, duration: number, vol = 0.12) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    // High crystalline chord progression
    playChime(now, 1046.5, 0.6, 0.12) // C6
    playChime(now + 0.08, 1318.51, 0.7, 0.14) // E6
    playChime(now + 0.18, 1567.98, 0.85, 0.15) // G6
    playChime(now + 0.3, 2093.0, 1.0, 0.12) // C7
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Satisfying crunch of boots on fresh arctic snow / rolling ice crystals for dice rolls. */
export async function playArcticCrunchSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const bufferSize = Math.floor(ctx.sampleRate * 0.28)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      // Create textured crunchy snow noise
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8)
    }
    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1400, now)
    filter.Q.setValueAtTime(1.5, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0, now)
    noiseGain.gain.linearRampToValueAtTime(0.22, now + 0.01)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

    noiseSource.connect(filter)
    filter.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noiseSource.start(now)
    noiseSource.stop(now + 0.3)

    // Add subtle crisp high-frequency snap
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08)

    oscGain.gain.setValueAtTime(0, now)
    oscGain.gain.linearRampToValueAtTime(0.08, now + 0.005)
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)

    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.1)
  } catch {
    // Ignore silently
  }
}

/** Sharp crystalline ice block clink when purchasing property or collecting supplies. */
export async function playArcticIceClinkSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playClink = (start: number, freq: number, duration: number, vol = 0.13) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playClink(now, 1480, 0.35, 0.14)
    playClink(now + 0.06, 2220, 0.45, 0.16)
  } catch {
    // Ignore silently
  }
}

/** Howling arctic blizzard gust for rent payments or bankruptcy. */
export async function playArcticBlizzardWindSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const bufferSize = Math.floor(ctx.sampleRate * 0.6)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI)
    }
    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(200, now)
    filter.frequency.exponentialRampToValueAtTime(750, now + 0.25)
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.58)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0, now)
    noiseGain.gain.linearRampToValueAtTime(0.24, now + 0.1)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)

    noiseSource.connect(filter)
    filter.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noiseSource.start(now)
    noiseSource.stop(now + 0.65)
  } catch {
    // Ignore silently
  }
}

/** Ethereal, mystical aurora borealis resonance for cards and auctions. */
export async function playArcticAuroraPulseSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playResonance = (start: number, freq: number, duration: number, vol = 0.12) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.05, start + duration * 0.5)
      osc.frequency.exponentialRampToValueAtTime(freq, start + duration)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + duration * 0.3)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playResonance(now, 220, 0.7, 0.11)
    playResonance(now + 0.05, 330, 0.75, 0.1)
    playResonance(now + 0.1, 440, 0.8, 0.09)
  } catch {
    // Ignore silently
  }
}

/** Celebratory polar expedition victory fanfare for winning the game. */
export async function playArcticFanfareSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playNote = (freq: number, start: number, duration: number, vol = 0.14) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    // Majestic ascending Nordic fanfare
    playNote(523.25, now, 0.3, 0.13) // C5
    playNote(659.25, now + 0.15, 0.3, 0.14) // E5
    playNote(783.99, now + 0.3, 0.35, 0.15) // G5
    playNote(1046.5, now + 0.48, 0.8, 0.18) // C6
    playNote(1318.51, now + 0.5, 0.8, 0.12) // E6
  } catch {
    // Ignore silently
  }
}
