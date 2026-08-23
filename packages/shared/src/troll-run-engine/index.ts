/**
 * Troll Run engine — the platform-neutral half.
 *
 * Physics, traps, tweens, particles, level geometry and the game loop live here so web and the
 * Expo app run the same simulation rather than two that drift. The two things that cannot be
 * neutral — painting a frame and making a noise — are the `TrollRunRenderTarget` and
 * `TrollRunAudioSink` adapters in `./types`.
 *
 * Web reaches this by relative path through `src/lib/troll-run-engine`, which re-exports it
 * alongside its canvas renderer and WebAudio synth. Mobile imports `@fateround/shared/troll-run-engine`.
 */

export * from './types'
export * from './physics'
export * from './tweens'
export * from './particles'
export * from './input'
export * from './triggers'
export * from './engine'
export * from './palette'
export * from './levels'
