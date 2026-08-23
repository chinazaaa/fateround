/**
 * The browser build of the Troll Run engine.
 *
 * The loop itself is platform-neutral (`packages/shared/src/troll-run-engine/engine.ts`) and only
 * knows about a render target and an audio sink. This subclass supplies the browser's two: the
 * 320×180 canvas renderer and the Web Audio synth. It also owns keyboard capture, which the
 * shared engine cannot do because there is no `window` under React Native.
 *
 * Exported as `TrollRunEngine` from the folder's index so web call sites keep the name they had
 * when the whole engine lived here.
 */

import {
  TrollRunEngine as TrollRunEngineCore,
  type TrollRunFrame,
  type TrollRunLevel,
  type EngineCallbacks,
} from '../../../packages/shared/src/troll-run-engine'
import { CanvasRenderer } from './renderer'
import { AudioManager } from './audio'

export class WebTrollRunEngine extends TrollRunEngineCore {
  private renderer = new CanvasRenderer()
  private audioManager = new AudioManager()
  private ctx: CanvasRenderingContext2D | null = null

  constructor(levels: TrollRunLevel[] = [], callbacks: EngineCallbacks = {}) {
    super(levels, callbacks)
    this.setAudioSink(this.audioManager)
    this.setRenderTarget({
      render: (frame: TrollRunFrame) => {
        if (!this.ctx) return
        this.renderer.render(this.ctx, frame)
      },
      setTheme: (theme) => this.renderer.setTheme(theme),
    })
  }

  /** Binds the engine to a canvas and starts listening for arrow/WASD input. */
  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.ctx = canvas.getContext('2d')
    this.getInput().attachKeyboard()
  }
}
