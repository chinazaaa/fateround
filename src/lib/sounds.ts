let audioCtx: AudioContext | null = null

/** Play tick-tock during the last N seconds of a round timer. */
export const TIMER_TICK_THRESHOLD = 5

/** localStorage key for the global sound mute preference. */
export const SOUND_MUTED_STORAGE_KEY = 'kmk-sound-muted'

/** Same-tab event fired when the mute preference changes (storage events only
 * fire in *other* tabs, so we dispatch this for the current tab). */
export const SOUND_MUTED_EVENT = 'kmk-sound-muted-change'

/** Check whether the user has muted all game sounds via the toggle. */
export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === 'true'
}

/**
 * Persist the global mute preference and notify every listener (this tab via a
 * custom event, other tabs via the native `storage` event). Pre-warms the audio
 * context on unmute so subsequent realtime sounds work; silences timer music on
 * mute.
 */
export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SOUND_MUTED_STORAGE_KEY, String(muted))
  window.dispatchEvent(new CustomEvent(SOUND_MUTED_EVENT, { detail: muted }))
  if (muted) {
    stopTimerMusic()
  } else {
    unlockAudio() // pre-warm context on unmute (user gesture)
  }
}

/**
 * Subscribe to mute-preference changes from any source (this tab's toggle,
 * another tab, or a direct `setSoundMuted` call). Returns an unsubscribe fn.
 */
export function subscribeSoundMuted(callback: (muted: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onCustom = () => callback(isSoundMuted())
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_MUTED_STORAGE_KEY) callback(isSoundMuted())
  }
  window.addEventListener(SOUND_MUTED_EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(SOUND_MUTED_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Ensure the AudioContext exists and is running.
 * Must be called (awaited) before scheduling any audio nodes.
 * Returns true if the context is running and ready to use.
 *
 * On mobile, resume() only works within a user-gesture callback.
 * Call `setupAudioUnlock()` once on page load so the first tap
 * pre-warms the context for subsequent programmatic sounds.
 */
export async function ensureContext(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  // Recreate if missing or garbage-collected into closed state
  if (!audioCtx || audioCtx.state === 'closed') {
    try {
      audioCtx = new AudioContext()
    } catch {
      return false
    }
  }
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume()
    } catch {
      return false
    }
  }
  return audioCtx.state === 'running'
}

/** Get the running AudioContext instance if initialized. */
export function getAudioContext(): AudioContext | null {
  return audioCtx
}

/**
 * Eagerly unlock the AudioContext during a user gesture.
 * Call this from any click/touch handler so subsequent sounds
 * triggered by polling/realtime events work on mobile.
 */
export function unlockAudio(): void {
  void ensureContext()
}

/**
 * Keep the AudioContext warm for the lifetime of the page. Call once on
 * game/host pages.
 *
 * This deliberately does NOT remove its listeners after the first gesture:
 * mobile browsers (and desktop tab-backgrounding) re-suspend the context when
 * the page loses focus or idles, which would leave later realtime-triggered
 * sounds (your turn, host started, timer ticks) silently dead. Re-warming on
 * every gesture — and when the tab becomes visible again — keeps sounds firing
 * consistently. `ensureContext()` is a cheap no-op once the context is already
 * running, so the persistent listeners are effectively free.
 */
export function setupAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {}
  const unlock = () => {
    void ensureContext()
  }
  const gestureEvents = ['pointerdown', 'keydown', 'touchstart'] as const
  for (const evt of gestureEvents) {
    document.addEventListener(evt, unlock, { capture: true, passive: true })
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void ensureContext()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    for (const evt of gestureEvents) {
      document.removeEventListener(evt, unlock, { capture: true })
    }
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** Warm chime when the lobby reopens (play again / host reset). */
export async function playLobbyOpenSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playRoundStartSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playVoteSubmittedSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playRoundEndSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playGameFinishedSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playConfessionSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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

/** Quick dice rattle while dice are rolling. */
export async function playDiceRollSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
    const ctx = audioCtx
    const now = ctx.currentTime

    const burst = (start: number, duration: number, volume: number) => {
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
      filter.frequency.value = 700 + Math.random() * 1400
      filter.Q.value = 0.9

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      source.start(start)
      source.stop(start + duration + 0.02)
    }

    burst(now, 0.04, 0.08)
    burst(now + 0.05, 0.04, 0.07)
    burst(now + 0.1, 0.04, 0.08)
    burst(now + 0.16, 0.04, 0.06)
    burst(now + 0.24, 0.05, 0.05)
    burst(now + 0.32, 0.06, 0.04)
  } catch {
    // Browser may block audio until user gesture — ignore silently
  }
}

/** Short clock tick/tock for countdown urgency (last few seconds). */
export async function playTickTockSound(secondsRemaining: number) {
  if (typeof window === 'undefined' || isSoundMuted()) return
  if (secondsRemaining <= 0 || secondsRemaining > TIMER_TICK_THRESHOLD) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playCorrectAnswerSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playWrongAnswerSound() {
  if (typeof window === 'undefined' || isSoundMuted()) return

  try {
    if (!(await ensureContext()) || !audioCtx) return
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
export async function playTimerMusic(secondsRemaining: number, totalSeconds: number) {
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
    if (!(await ensureContext()) || !audioCtx) return
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

import {
  playPirateCannonBlastSound,
  playPirateCoinsSound,
  playPirateDiceRollSound,
  playPirateFanfareSound,
  playPirateSeaSplashSound,
  playPirateShipBellSound,
} from '@/lib/sounds-pirate'
import {
  playArcticAuroraPulseSound,
  playArcticBlizzardWindSound,
  playArcticCrunchSound,
  playArcticFanfareSound,
  playArcticIceClinkSound,
  playArcticWindChimeSound,
} from '@/lib/sounds-arctic'
import {
  playNaijaAfrobeatsFanfareSound,
  playNaijaCashCountSound,
  playNaijaOganlaInflectionSound,
  playNaijaShekereShakeSound,
  playNaijaTalkingDrumSound,
  playNaijaTextileSwipeSound,
} from '@/lib/sounds-naija'

/**
 * Unified action sound dispatcher for Monopoly editions.
 * Routes audio events to themed sound effects when themeId is specified.
 */
export function playMonopolyActionSound(
  actionType: 'roll' | 'buy' | 'rent' | 'card' | 'auction' | 'turn' | 'win' | 'bankrupt',
  themeId?: string | null
) {
  if (themeId === 'pirate') {
    switch (actionType) {
      case 'turn':
        void playPirateShipBellSound()
        break
      case 'roll':
        void playPirateDiceRollSound()
        break
      case 'buy':
        void playPirateCoinsSound()
        break
      case 'rent':
      case 'bankrupt':
        void playPirateSeaSplashSound()
        break
      case 'card':
      case 'auction':
        void playPirateCannonBlastSound()
        break
      case 'win':
        void playPirateFanfareSound()
        break
    }
  } else if (themeId === 'arctic') {
    switch (actionType) {
      case 'turn':
        void playArcticWindChimeSound()
        break
      case 'roll':
        void playArcticCrunchSound()
        break
      case 'buy':
        void playArcticIceClinkSound()
        break
      case 'rent':
      case 'bankrupt':
        void playArcticBlizzardWindSound()
        break
      case 'card':
      case 'auction':
        void playArcticAuroraPulseSound()
        break
      case 'win':
        void playArcticFanfareSound()
        break
    }
  } else if (themeId === 'naija') {
    switch (actionType) {
      case 'turn':
        void playNaijaTalkingDrumSound()
        break
      case 'roll':
        void playNaijaShekereShakeSound()
        break
      case 'buy':
        void playNaijaCashCountSound()
        break
      case 'rent':
      case 'bankrupt':
        void playNaijaOganlaInflectionSound()
        break
      case 'card':
      case 'auction':
        void playNaijaTextileSwipeSound()
        break
      case 'win':
        void playNaijaAfrobeatsFanfareSound()
        break
    }
  } else {
    switch (actionType) {
      case 'turn':
        void playRoundStartSound()
        break
      case 'roll':
        void playDiceRollSound()
        break
      case 'buy':
      case 'rent':
      case 'card':
      case 'auction':
        void playVoteSubmittedSound()
        break
      case 'win':
        void playGameFinishedSound()
        break
      case 'bankrupt':
        void playRoundEndSound()
        break
    }
  }
}
