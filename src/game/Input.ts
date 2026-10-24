// Keyboard + mouse state with per-frame "pressed" edges and pointer lock.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** Gameplay input is ignored while a UI screen owns the keyboard. */
  enabled = true;
  private dragging = false;
  private buttons = new Set<number>();
  private buttonsPressed = new Set<number>();

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    // Listen on the window: HUD layers sit above the canvas and would swallow clicks.
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('contextmenu', (e) => { if (this.enabled && !this.overUi(e)) e.preventDefault(); }); // right mouse = aim
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
  }

  /** True while gameplay (not menus) owns the mouse; enables auto pointer lock. */
  captureWanted = false;

  /**
   * GTA-style mouse: lock and hide the cursor so the camera can turn forever.
   * Browsers only allow this during a click or key press, so it is retried on each.
   */
  lockPointer(): void {
    if (document.pointerLockElement === this.canvas || !this.captureWanted || !this.enabled) return;
    try {
      // Plain request (no options): supported everywhere and runs inside the click/key gesture.
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      void r?.catch?.(() => undefined);
    } catch {
      /* not allowed right now; next click/key will retry */
    }
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.captureWanted && this.enabled && !this.locked && e.code !== 'Escape') this.lockPointer();
    if (e.code === 'Tab' || e.code === 'F1') e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    if (this.enabled && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };
  private onBlur = (): void => { this.down.clear(); };
  /** True when the event targets an interactive UI element (buttons, inputs, panels). */
  private overUi(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.('button, input, select, textarea, a, .panel, .cc-controls-card, [data-ui-interactive]');
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled || this.overUi(e)) return;
    if (this.captureWanted && !this.locked) this.lockPointer();
    if (!this.buttons.has(e.button)) this.buttonsPressed.add(e.button);
    this.buttons.add(e.button);
    this.dragging = true;

  };
  private onMouseUp = (e: MouseEvent): void => { this.dragging = false; this.buttons.delete(e.button); };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled) return;
    // Only a locked (hidden, captured) mouse turns the camera, like GTA: unlimited turning, no screen edges.
    if (document.pointerLockElement === this.canvas || (this.dragging && !this.captureWanted)) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent): void => {
    if (this.enabled && !this.overUi(e)) this.wheel += Math.sign(e.deltaY);
  };

  /** Mouse button held (0 = left, 2 = right). */
  mouseDown(button: number): boolean {
    return this.enabled && this.buttons.has(button);
  }

  /** Mouse button went down this frame. */
  mousePressed(button: number): boolean {
    return this.enabled && this.buttonsPressed.has(button);
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  axis(neg: string[], pos: string[]): number {
    let v = 0;
    if (neg.some((k) => this.isDown(k))) v -= 1;
    if (pos.some((k) => this.isDown(k))) v += 1;
    return v;
  }

  releasePointer(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
