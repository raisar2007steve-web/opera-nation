import { ArcRotateCamera, Scene, Vector3 } from "@babylonjs/core";
import type { Input } from "../core/Input";
import type { World } from "../world/World";

export type CameraMode = "near" | "far" | "first";

/**
 * Third/first-person orbit camera with pointer-lock look, zoom, collision
 * avoidance and an auto-align hint for vehicles.
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  mode: CameraMode = "near";
  alpha = -Math.PI / 2;
  beta = 1.24;
  private target = new Vector3(0, 1.6, 0);
  private desiredRadius = 5.4;
  private currentRadius = 5.4;
  private shakeAmount = 0;
  private lastMouseTime = 0;

  constructor(scene: Scene) {
    this.camera = new ArcRotateCamera("camera", this.alpha, this.beta, 5.4, this.target, scene);
    this.camera.inputs.clear();
    this.camera.fov = 0.9;
    this.camera.minZ = 0.12;
    this.camera.maxZ = 4200;
    this.camera.inertia = 0;
    this.camera.lowerBetaLimit = 0.28;
    this.camera.upperBetaLimit = 1.52;
    this.camera.lockedTarget = null;
  }

  get forward(): Vector3 {
    return new Vector3(-Math.cos(this.alpha), 0, -Math.sin(this.alpha)).normalize();
  }

  setYawFromForward(forward: Vector3): void {
    this.alpha = Math.atan2(-forward.z, -forward.x);
  }

  /** Instantly move the camera target (used when spawning / teleporting). */
  snapTo(focus: Vector3, radius = this.desiredRadius): void {
    this.target.copyFrom(focus);
    this.camera.target.copyFrom(focus);
    this.currentRadius = radius;
    this.camera.radius = radius;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.desiredRadius = mode === "near" ? 5.4 : mode === "far" ? 9.2 : 0.35;
    this.camera.lowerBetaLimit = mode === "first" ? 0.5 : 0.28;
    this.camera.upperBetaLimit = mode === "first" ? 2.25 : 1.52;
  }

  cycleMode(): CameraMode {
    this.setMode(this.mode === "near" ? "far" : this.mode === "far" ? "first" : "near");
    return this.mode;
  }

  shake(amount: number): void {
    this.shakeAmount = Math.min(0.4, this.shakeAmount + amount);
  }

  update(
    dt: number,
    input: Input,
    focus: Vector3,
    world: World,
    autoYaw: number | null = null,
  ): void {
    const mouse = input.consumeMouse();
    const sens = 0.0024;
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      this.alpha += mouse.dx * sens;
      const invert = 1;
      this.beta -= mouse.dy * sens * invert;
      this.lastMouseTime = performance.now();
    }
    if (autoYaw !== null && performance.now() - this.lastMouseTime > 1400) {
      // Gently settle behind a moving vehicle.
      let diff = ((autoYaw - this.alpha + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.alpha += diff * Math.min(1, dt * 1.35);
      this.beta += (1.16 - this.beta) * Math.min(1, dt * 0.9);
    }

    this.beta = Math.max(
      this.camera.lowerBetaLimit ?? 0.28,
      Math.min(this.camera.upperBetaLimit ?? 1.52, this.beta),
    );

    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      this.desiredRadius = Math.max(3.2, Math.min(12, this.desiredRadius + Math.sign(wheel) * 0.8));
      if (this.mode !== "first") this.mode = this.desiredRadius > 7 ? "far" : "near";
    }
    const targetRadius =
      this.mode === "first" ? 0.3 : this.mode === "far" ? Math.max(9.2, this.desiredRadius) : this.desiredRadius;

    this.target.x += (focus.x - this.target.x) * Math.min(1, dt * 16);
    this.target.y += (focus.y - this.target.y) * Math.min(1, dt * 12);
    this.target.z += (focus.z - this.target.z) * Math.min(1, dt * 16);

    // Avoid clipping into buildings.
    const offsetDir = new Vector3(
      Math.cos(this.alpha) * Math.sin(this.beta),
      Math.cos(this.beta),
      Math.sin(this.alpha) * Math.sin(this.beta),
    ).normalize();
    const blockDist = world.rayDistance(this.target, offsetDir, targetRadius + 0.9);
    const allowed = Math.max(0.3, blockDist - 0.45);
    const wanted = Math.min(targetRadius, allowed);
    this.currentRadius += (wanted - this.currentRadius) * Math.min(1, dt * 10);

    this.camera.alpha = this.alpha;
    this.camera.beta = this.beta;
    this.camera.radius = this.currentRadius;
    this.camera.target.copyFrom(this.target);

    if (this.shakeAmount > 0.0005) {
      this.camera.target.x += (Math.random() - 0.5) * this.shakeAmount;
      this.camera.target.y += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount *= Math.pow(0.02, dt);
    }
  }

  get radius(): number {
    return this.currentRadius;
  }
}
