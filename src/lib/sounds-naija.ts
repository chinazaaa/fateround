/**
 * Nigerian Markets Theme (Naija Edition) Sound Effects.
 * Synthesized using Web Audio API to create authentic talking drum pitch bends,
 * percussive shekere rhythms, market gongs, and celebratory afrobeats fanfares.
 */

import { ensureContext, getAudioContext, isSoundMuted } from '@/lib/sounds'

/** Rich talking drum pitch glide ("Gangan") when a turn starts. */
export async function playNaijaTalkingDrumSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playDrumStroke = (start: number, startFreq: number, endFreq: number, duration: number, vol = 0.2) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(startFreq, start)
      osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration * 0.7)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    // Two-tone talking drum inflection (low-to-high, then high accent)
    playDrumStroke(now, 160, 260, 0.18, 0.22)
    playDrumStroke(now + 0.14, 280, 380, 0.22, 0.25)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Rhythmic percussive shekere / shaker rhythm for dice rolls. */
export async function playNaijaShekereShakeSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playShake = (start: number, duration: number, vol = 0.15) => {
      const bufferSize = Math.floor(ctx.sampleRate * duration)
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.0)
      }

      const noise = ctx.createBufferSource()
      noise.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(3500, start)
      filter.Q.setValueAtTime(1.5, start)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(vol, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(start)
      noise.stop(start + duration + 0.02)
    }

    // Quick rhythmic syncopated shekere shakes
    playShake(now, 0.08, 0.14)
    playShake(now + 0.07, 0.08, 0.12)
    playShake(now + 0.15, 0.12, 0.18)
    playShake(now + 0.24, 0.15, 0.14)
  } catch {
    // Ignore silently
  }
}

/** Crisp Naira note counting flutter and market gong chime for purchasing. */
export async function playNaijaCashCountSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    // Note counting flutter
    for (let i = 0; i < 4; i++) {
      const start = now + i * 0.04
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1200 + i * 150, start)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.08, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.035)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.04)
    }

    // Market gong chime
    const gong = ctx.createOscillator()
    const gongGain = ctx.createGain()
    gong.type = 'sine'
    gong.frequency.setValueAtTime(587.33, now + 0.16) // D5

    gongGain.gain.setValueAtTime(0, now + 0.16)
    gongGain.gain.linearRampToValueAtTime(0.2, now + 0.17)
    gongGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)

    gong.connect(gongGain)
    gongGain.connect(ctx.destination)
    gong.start(now + 0.16)
    gong.stop(now + 0.65)
  } catch {
    // Ignore silently
  }
}

/** Deep talking drum downward inflection and resonant thud for paying rent or tax. */
export async function playNaijaOganlaInflectionSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(240, now)
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.35)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.25, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.45)
  } catch {
    // Ignore silently
  }
}

/** Crisp Ankara fabric swipe sound for drawing Chance / Community Chest cards. */
export async function playNaijaTextileSwipeSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const duration = 0.18
    const bufferSize = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(1800, now)
    filter.frequency.linearRampToValueAtTime(600, now + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + duration + 0.02)
  } catch {
    // Ignore silently
  }
}

/** Uplifting afrobeats percussive polyrhythm and celebratory fanfare for winning. */
export async function playNaijaAfrobeatsFanfareSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playTone = (start: number, freq: number, duration: number, vol = 0.18) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    // Lively afrobeats pentatonic celebration fanfare (G - A - C - D - E - G)
    playTone(now, 392.0, 0.16, 0.18) // G4
    playTone(now + 0.14, 440.0, 0.16, 0.18) // A4
    playTone(now + 0.28, 523.25, 0.2, 0.2) // C5
    playTone(now + 0.45, 587.33, 0.2, 0.22) // D5
    playTone(now + 0.6, 659.25, 0.25, 0.24) // E5
    playTone(now + 0.8, 783.99, 0.6, 0.28) // G5 high celebration
  } catch {
    // Ignore silently
  }
}
