import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

/**
 * Lightweight app-wide sound-effects layer. Players are created lazily on first
 * play and reused; each play seeks to the start so rapid retriggers work. Sound
 * files are short pre-baked WAVs in assets/sounds. Playback failures are
 * swallowed (e.g. when the native audio module isn't in the current dev-client
 * build yet) so SFX never break a screen.
 */

const SOURCES = {
  'ayo-drop': require('../assets/sounds/ayo-drop.wav'),
  'ayo-turn': require('../assets/sounds/ayo-turn.wav'),
  correct: require('../assets/sounds/correct.wav'),
  wrong: require('../assets/sounds/wrong.wav'),
  card: require('../assets/sounds/card.wav'),
  move: require('../assets/sounds/move.wav'),
  dice: require('../assets/sounds/dice.wav'),
  pop: require('../assets/sounds/pop.wav'),
} as const

export type SoundName = keyof typeof SOURCES

const players: Partial<Record<SoundName, AudioPlayer>> = {}
let muted = false
// User preference (Settings › Sound effects). Defaults to on; the
// PreferencesProvider mirrors the persisted choice here on launch + change.
let soundEnabled = true

export function setSoundMuted(value: boolean) {
  muted = value
}

export function isSoundMuted() {
  return muted
}

/** Toggle the user's sound-effects preference. When off, `playSound` no-ops. */
export function setSoundsEnabled(value: boolean) {
  soundEnabled = value
}

export function playSound(name: SoundName) {
  if (muted || !soundEnabled) return
  try {
    let player = players[name]
    if (!player) {
      player = createAudioPlayer(SOURCES[name])
      players[name] = player
    }
    void player.seekTo(0)
    player.play()
  } catch {
    // native audio unavailable or playback error — SFX are non-critical
  }
}
