/**
 * Troll Run engine — the web entry point.
 *
 * The simulation is platform-neutral and lives in `packages/shared/src/troll-run-engine` so the
 * Expo app runs the same physics, traps and levels. What stays here is the half that only a
 * browser can do: the 320×180 canvas renderer and the Web Audio synth, plus `WebTrollRunEngine`,
 * which wires those two into the shared loop and attaches keyboard input.
 */

export * from '../../../packages/shared/src/troll-run-engine'
export { CanvasRenderer } from './renderer'
export { AudioManager } from './audio'
export { WebTrollRunEngine, WebTrollRunEngine as TrollRunEngine } from './web-engine'
