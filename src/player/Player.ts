import { Scene, Vector3 } from "@babylonjs/core";
import { Avatar, DEFAULT_APPEARANCE, type Appearance } from "../avatar/Avatar";
import type { Input } from "../core/Input";
import type { World } from "../world/World";

const WALK_SPEED = 4.3;
const SPRINT_SPEED = 8.1;
const SWIM_SPEED = 2.4;
const ACCEL = 16;
const GRAVITY = -23;
const JUMP_VELOCITY = 7.6;

export interface PlayerCallbacks {
  onFootstep?: (sprinting: boolean) => void;
  onJump?: () => void;
  onLand?: () => void;
}

/**
 * The player controller: camera-relative movement, sprint, jump, water wading,
 * box collision resolution and procedural avatar animation.
 */
export class Player {
  readonly avatar: Avatar;
  readonly position = new Vector3();
  facing = Math.PI;
  grounded = true;
  speed = 0;
  verticalVelocity = 0;
  inVehicle = false;
  swimming = false;
  readonly radius = 0.4;
  readonly height = 1.8;

  private horizontal = new Vector3();
  private stepTimer = 0;
  private callbacks: PlayerCallbacks;
  private appearance: Appearance;

  constructor(scene: Scene, appearance: Appearance, callbacks: PlayerCallbacks = {}) {
    this.appearance = { ...appearance };
    this.avatar = new Avatar(scene, appearance);
    this.callbacks = callbacks;
  }

  spawn(position: Vector3, facing = Math.PI): void {
    this.position.copyFrom(position);
    this.facing = facing;
    this.verticalVelocity = 0;
    this.horizontal.set(0, 0, 0);
    this.speed = 0;
    this.avatar.setPosition(position.x, position.y, position.z);
    this.avatar.setFacing(facing);
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.verticalVelocity = 0;
    this.speed = 0;
    this.horizontal.set(0, 0, 0);
  }

  setAppearance(a: Appearance): void {
    this.appearance = { ...a };
    this.avatar.setAppearance(a);
  }

  get appearanceData(): Appearance {
    return { ...this.appearance };
  }

  update(dt: number, input: Input, world: World, cameraForward: Vector3): void {
    const move = input.readMove();

    const forward = new Vector3(cameraForward.x, 0, cameraForward.z).normalize();
    const right = new Vector3(forward.z, 0, -forward.x);
    const wish = new Vector3(
      forward.x * move.forward + right.x * move.right,
      0,
      forward.z * move.forward + right.z * move.right,
    );
    const wishLen = wish.length();
    if (wishLen > 0.001) wish.scaleInPlace(1 / Math.max(1, wishLen));

    this.swimming = world.isWater(this.position.x, this.position.z) && !world.interiorActive;
    const maxSpeed = this.swimming
      ? SWIM_SPEED
      : move.sprint && move.forward > 0.2
        ? SPRINT_SPEED
        : WALK_SPEED;

    const target = wish.scale(maxSpeed);
    const blend = Math.min(1, ACCEL * dt);
    this.horizontal.x += (target.x - this.horizontal.x) * blend;
    this.horizontal.z += (target.z - this.horizontal.z) * blend;

    if (wishLen > 0.05) {
      const desiredFacing = Math.atan2(wish.x, wish.z);
      let diff = ((desiredFacing - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.facing += diff * Math.min(1, dt * 12);
    }

    // Jump / gravity.
    const wantsJump = move.jump && this.grounded && !this.swimming && !world.interiorActive;
    if (wantsJump) {
      this.verticalVelocity = JUMP_VELOCITY;
      this.grounded = false;
      this.callbacks.onJump?.();
    }

    this.verticalVelocity += GRAVITY * dt;
    this.position.y += this.verticalVelocity * dt;

    const ground = world.groundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      if (!this.grounded) this.callbacks.onLand?.();
      this.position.y = ground;
      this.verticalVelocity = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Horizontal movement with collision resolution.
    const dx = this.horizontal.x * dt;
    const dz = this.horizontal.z * dt;
    this.position.x += dx;
    this.position.z += dz;
    world.resolveCollisions(this.position, this.radius);

    this.speed = Math.hypot(this.horizontal.x, this.horizontal.z);

    // Footsteps.
    if (this.grounded && this.speed > 1.2) {
      this.stepTimer -= dt * this.speed;
      if (this.stepTimer <= 0) {
        this.stepTimer = 3.1;
        this.callbacks.onFootstep?.(this.speed > WALK_SPEED + 0.3);
      }
    } else {
      this.stepTimer = 0.6;
    }

    this.avatar.setPosition(this.position.x, this.position.y, this.position.z);
    this.avatar.setFacing(this.facing);
    this.avatar.animate(dt, this.speed, this.grounded);
  }

  get eyePosition(): Vector3 {
    return new Vector3(this.position.x, this.position.y + 1.6, this.position.z);
  }

  dispose(): void {
    this.avatar.dispose();
  }
}

export { WALK_SPEED, SPRINT_SPEED };
export { DEFAULT_APPEARANCE };
