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

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    if (this.enabled && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };
  private onBlur = (): void => { this.down.clear(); };
  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled) return;
    this.dragging = true;
    if (e.button === 0 && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.()?.catch?.(() => undefined);
    }
  };
  private onMouseUp = (): void => { this.dragging = false; };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled) return;
    if (document.pointerLockElement === this.canvas || this.dragging) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent): void => {
    if (this.enabled) this.wheel += Math.sign(e.deltaY);
  };

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
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
