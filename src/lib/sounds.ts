let audioCtx: AudioContext | null = null

/** Play tick-tock during the last N seconds of a round timer. */
export const TIMER_TICK_THRESHOLD = 5

/** Check whether the user has muted all game sounds via the toggle. */
export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('kmk-sound-muted') === 'true'
}

export function unlockAudio() {
  if (typeof window === 'undefined') return
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

/** Warm chime when the lobby reopens (play again / host reset). */
export function playLobbyOpenSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, volume = 0.11) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playTone(392, now, 0.14)
    playTone(523.25, now + 0.1, 0.16)
    playTone(659.25, now + 0.22, 0.28, 0.13)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Short ascending chime when a new round starts. */
export function playRoundStartSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, volume = 0.12) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playTone(523.25, now, 0.14)
    playTone(659.25, now + 0.1, 0.18)
    playTone(783.99, now + 0.2, 0.32, 0.14)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Short satisfying "ding" when a vote is submitted (rising chime). */
export function playVoteSubmittedSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.1, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.25)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Descending tone when a round ends (pleasant buzzer). */
export function playRoundEndSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, volume = 0.1) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playTone(659.25, now, 0.18)
    playTone(523.25, now + 0.12, 0.18)
    playTone(392.0, now + 0.24, 0.3)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Celebratory fanfare for game completion (ascending notes with final chord). */
export function playGameFinishedSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, volume = 0.1) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    // Ascending notes
    playTone(523.25, now, 0.15) // C5
    playTone(659.25, now + 0.12, 0.15) // E5
    playTone(783.99, now + 0.24, 0.15) // G5
    // Final chord (C major, held longer)
    playTone(1046.5, now + 0.4, 0.45, 0.12) // C6
    playTone(783.99, now + 0.4, 0.45, 0.08) // G5
    playTone(659.25, now + 0.4, 0.45, 0.06) // E5
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Subtle whoosh when a confession is sent. */
export function playConfessionSound() {
  if (typeof window === 'undefined') return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    // Filtered noise burst for a "whoosh" effect
    const bufferSize = ctx.sampleRate * 0.3
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2000, now)
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.25)
    filter.Q.value = 1.5

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.06, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    source.start(now)
    source.stop(now + 0.3)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Short clock tick/tock for countdown urgency (last few seconds). */
export function playTickTockSound(secondsRemaining: number) {
  if (typeof window === 'undefined' || isSoundMuted()) return
  if (secondsRemaining <= 0 || secondsRemaining > TIMER_TICK_THRESHOLD) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime
    const isTock = secondsRemaining % 2 === 0

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = isTock ? 600 : 900
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.07, now + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.09)
  } catch {
    // Ignore if audio is blocked
  }
}

/** Quick bright chime when a trivia answer is correct. */
export function playCorrectAnswerSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, volume = 0.11) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playTone(880, now, 0.12)
    playTone(1174.66, now + 0.08, 0.2, 0.13)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Soft low tone when a trivia answer is wrong. */
export function playWrongAnswerSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.2)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.09, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.28)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

// ── Timer music — escalating background drone/pulse ──────────────────────────

let timerOscillators: OscillatorNode[] = []
let timerGains: GainNode[] = []
let timerLfo: OscillatorNode | null = null
let timerLfoGain: GainNode | null = null

/** Continuous background drone that intensifies as time runs out. */
export function playTimerMusic(secondsRemaining: number, totalSeconds: number) {
  if (typeof window === 'undefined') return
  if (isSoundMuted()) {
    stopTimerMusic()
    return
  }
  if (secondsRemaining <= 0) {
    stopTimerMusic()
    return
  }

  try {
    unlockAudio()
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const progress = 1 - secondsRemaining / totalSeconds

    if (timerOscillators.length === 0) {
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.value = 80
      gain1.gain.value = 0
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start()
      timerOscillators.push(osc1)
      timerGains.push(gain1)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.value = 120
      gain2.gain.value = 0
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start()
      timerOscillators.push(osc2)
      timerGains.push(gain2)

      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.type = 'sine'
      lfo.frequency.value = 2
      lfoGain.gain.value = 0
      lfo.connect(lfoGain)
      lfoGain.connect(gain1.gain)
      lfo.start()
      timerLfo = lfo
      timerLfoGain = lfoGain
    }

    const now = ctx.currentTime
    timerGains[0].gain.setTargetAtTime(0.03 + progress * 0.03, now, 0.1)

    if (progress > 0.5) {
      const sp = (progress - 0.5) / 0.5
      timerGains[1].gain.setTargetAtTime(sp * 0.04, now, 0.1)
      timerOscillators[1].frequency.setTargetAtTime(120 + sp * 80, now, 0.2)
    } else {
      timerGains[1].gain.setTargetAtTime(0, now, 0.1)
    }

    if (secondsRemaining <= 10 && timerLfo && timerLfoGain) {
      timerLfo.frequency.setTargetAtTime(secondsRemaining <= 5 ? 6 : 3, now, 0.1)
      timerLfoGain.gain.setTargetAtTime(secondsRemaining <= 5 ? 0.04 : 0.02, now, 0.1)
    } else if (timerLfoGain) {
      timerLfoGain.gain.setTargetAtTime(0, now, 0.1)
    }

    if (secondsRemaining <= 5) {
      timerOscillators[0].frequency.setTargetAtTime(80 + (1 - secondsRemaining / 5) * 40, now, 0.15)
    } else {
      timerOscillators[0].frequency.setTargetAtTime(80, now, 0.15)
    }
  } catch {
    // Ignore audio errors
  }
}

/** Fade out and stop all timer music oscillators. */
export function stopTimerMusic() {
  try {
    if (!audioCtx) return
    const now = audioCtx.currentTime
    for (const g of timerGains) {
      try {
        g.gain.cancelScheduledValues(now)
        g.gain.setTargetAtTime(0, now, 0.08)
      } catch {
        /* ignored */
      }
    }
    if (timerLfoGain) {
      try {
        timerLfoGain.gain.cancelScheduledValues(now)
        timerLfoGain.gain.setTargetAtTime(0, now, 0.05)
      } catch {
        /* ignored */
      }
    }
    setTimeout(() => {
      for (const osc of timerOscillators) {
        try {
          osc.stop()
          osc.disconnect()
        } catch {
          /* ignored */
        }
      }
      for (const g of timerGains) {
        try {
          g.disconnect()
        } catch {
          /* ignored */
        }
      }
      if (timerLfo) {
        try {
          timerLfo.stop()
          timerLfo.disconnect()
        } catch {
          /* ignored */
        }
      }
      if (timerLfoGain) {
        try {
          timerLfoGain.disconnect()
        } catch {
          /* ignored */
        }
      }
      timerOscillators = []
      timerGains = []
      timerLfo = null
      timerLfoGain = null
    }, 200)
  } catch {
    timerOscillators = []
    timerGains = []
    timerLfo = null
    timerLfoGain = null
  }
}
