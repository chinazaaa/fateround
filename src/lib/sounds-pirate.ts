/**
 * Pirate Theme Sound Effects for Monopoly High Seas Edition.
 * Synthesized using Web Audio API.
 */

import { ensureContext, getAudioContext, isSoundMuted } from '@/lib/sounds'

/** Two sharp rings of a nautical watch bell ("Ding-Ding!") for Pirate turn start. */
export async function playPirateShipBellSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playBellStrike = (start: number, freq: number, duration: number, vol = 0.14) => {
      const ratios = [1, 1.48, 2.02, 2.68]
      const gains = [vol, vol * 0.5, vol * 0.3, vol * 0.15]

      ratios.forEach((ratio, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = i === 0 ? 'sine' : 'triangle'
        osc.frequency.setValueAtTime(freq * ratio, start)

        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(gains[i], start + 0.006)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + duration + 0.05)
      })
    }

    playBellStrike(now, 780, 0.75, 0.14)
    playBellStrike(now + 0.22, 780, 0.9, 0.16)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Deep cannon boom and gunpowder crack for Pirate card events and auctions. */
export async function playPirateCannonBlastSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const bufferSize = Math.floor(ctx.sampleRate * 0.45)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5)
    }
    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, now)
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.4)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0, now)
    noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.005)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    noiseSource.connect(filter)
    filter.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noiseSource.start(now)
    noiseSource.stop(now + 0.5)

    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(110, now)
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.35)

    oscGain.gain.setValueAtTime(0, now)
    oscGain.gain.linearRampToValueAtTime(0.3, now + 0.01)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.55)
  } catch {
    // Ignore silently
  }
}

/** High-pitched metallic clinking of gold doubloons for property and cash events. */
export async function playPirateCoinsSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const clink = (start: number, freq: number, vol = 0.08) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      osc.frequency.linearRampToValueAtTime(freq * 0.98, start + 0.08)

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.003)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.1)
    }

    clink(now, 3200, 0.08)
    clink(now + 0.035, 4100, 0.09)
    clink(now + 0.07, 3600, 0.08)
    clink(now + 0.11, 4800, 0.07)
  } catch {
    // Ignore silently
  }
}

/** Ocean wave crash and sea splash for paying rent or walking the plank. */
export async function playPirateSeaSplashSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const bufferSize = Math.floor(ctx.sampleRate * 0.55)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(350, now)
    filter.frequency.linearRampToValueAtTime(1100, now + 0.15)
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.55)
    filter.Q.value = 1.2

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    source.start(now)
    source.stop(now + 0.6)
  } catch {
    // Ignore silently
  }
}

/** Deeper wooden deck dice rattle for Pirate theme. */
export async function playPirateDiceRollSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const woodThud = (start: number, duration: number, vol: number, freq: number) => {
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration))
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = freq
      filter.Q.value = 2.0

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      source.start(start)
      source.stop(start + duration + 0.02)
    }

    woodThud(now, 0.06, 0.12, 450)
    woodThud(now + 0.06, 0.05, 0.1, 380)
    woodThud(now + 0.12, 0.05, 0.11, 520)
    woodThud(now + 0.19, 0.06, 0.09, 410)
    woodThud(now + 0.27, 0.07, 0.07, 350)
  } catch {
    // Ignore silently
  }
}

/** Triumphant sea shanty accordion/horn fanfare for winning Pirate Monopoly. */
export async function playPirateFanfareSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext())) return
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const playHorn = (freq: number, start: number, duration: number, vol = 0.11) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = freq

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1800

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playHorn(293.66, now, 0.18, 0.12)
    playHorn(349.23, now + 0.15, 0.18, 0.12)
    playHorn(392.0, now + 0.3, 0.18, 0.12)
    playHorn(440.0, now + 0.45, 0.22, 0.13)
    playHorn(587.33, now + 0.65, 0.65, 0.14)
    playHorn(440.0, now + 0.65, 0.65, 0.1)
    playHorn(349.23, now + 0.65, 0.65, 0.08)
  } catch {
    // Ignore silently
  }
}
