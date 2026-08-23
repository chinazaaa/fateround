/**
 * Troll Run level catalogue + resolver — see `packages/shared/src/troll-run-engine/levels/`.
 *
 * Kept as its own entry point because `src/lib/troll-run.ts` imports the levels without wanting
 * the game loop (and, on the server, must not pull the canvas renderer in behind it).
 */

export * from '../../../packages/shared/src/troll-run-engine/levels'
