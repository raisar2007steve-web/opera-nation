export type GameKeyHandler = (code: string) => void;

const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "Tab",
]);

/**
 * Aggregates every input source into one snapshot. The game loop reads it,
 * the UI never does — which keeps rendering independent of the DOM.
 */
export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private handlers: GameKeyHandler[] = [];
  private canvas: HTMLCanvasElement;

  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  pointerLocked = false;
  enabled = true;

  /** Virtual stick, -1..1. */
  touchMove = { x: 0, y: 0 };
  touchSprint = false;
  touchJump = false;
  touchInteract = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  onGameKey(handler: GameKeyHandler): void {
    this.handlers.push(handler);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const code = e.code;
    if (MOVE_KEYS.has(code) || code.startsWith("Arrow")) e.preventDefault();
    if (!this.keys.has(code)) this.pressedThisFrame.add(code);
    this.keys.add(code);
    for (const handler of this.handlers) handler(code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) {
      this.keys.clear();
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked || !this.enabled) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    this.wheelDelta += e.deltaY;
    e.preventDefault();
  };

  requestPointerLock(): void {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** Movement axes from keyboard + touch + gamepad. */
  readMove(): { forward: number; right: number; sprint: boolean; jump: boolean } {
    let forward = 0;
    let right = 0;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) forward += 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) forward -= 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) right += 1;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) right -= 1;

    forward += -this.touchMove.y;
    right += this.touchMove.x;

    let sprint = this.isDown("ShiftLeft") || this.isDown("ShiftRight") || this.touchSprint;
    let jump = this.isDown("Space") || this.touchJump;

    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
      forward += dz(-(pad.axes[1] ?? 0));
      right += dz(pad.axes[0] ?? 0);
      if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed) jump = true;
      if (pad.buttons[10]?.pressed || pad.buttons[4]?.pressed) sprint = true;
      const lookX = pad.axes[2] ?? 0;
      const lookY = pad.axes[3] ?? 0;
      this.mouseDX += Math.abs(lookX) > 0.2 ? lookX * 9 : 0;
      this.mouseDY += Math.abs(lookY) > 0.2 ? lookY * 9 : 0;
    }

    const len = Math.hypot(forward, right);
    if (len > 1) {
      forward /= len;
      right /= len;
    }
    return {
      forward: Math.max(-1, Math.min(1, forward)),
      right: Math.max(-1, Math.min(1, right)),
      sprint,
      jump,
    };
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  consumeWheel(): number {
    const out = this.wheelDelta;
    this.wheelDelta = 0;
    return out;
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
    this.touchJump = false;
    this.touchInteract = false;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
