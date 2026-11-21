import { Scene, Vector3 } from "@babylonjs/core";
import { Avatar, DEFAULT_APPEARANCE, type Appearance } from "../avatar/Avatar";
import type { NpcSpawn } from "../cities/Metropolis";
import type { World } from "../world/World";
import { activityForHour, greetingForHour, type Activity } from "../ai/Schedule";

export type NpcState = "idle" | "walk" | "talk" | "chase" | "rest";

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Npc {
  readonly spec: NpcSpawn;
  readonly avatar: Avatar;
  readonly position = new Vector3();
  state: NpcState = "idle";
  activity: Activity = "work";
  facing = 0;
  speed = 0;

  private routeIndex = 0;
  private scene: Scene;
  private rng: () => number;
  private idleTimer = 2;
  private visible = true;

  constructor(scene: Scene, spec: NpcSpawn) {
    this.scene = scene;
    this.spec = spec;
    this.rng = mulberry32(hashString(spec.id));
    const r = this.rng();
    const appearance: Appearance = {
      ...DEFAULT_APPEARANCE,
      skin: ["#f2d3b6", "#e0b48c", "#c98d63", "#9c6644", "#6d452f"][Math.floor(r * 5)],
      hair: ["#0f0d0c", "#241a16", "#5a3a22", "#8b6236", "#7d7f86"][Math.floor(this.rng() * 5)],
      shirt: spec.officer
        ? "#22314a"
        : ["#2f3b4a", "#7a4a3a", "#3f6b57", "#8b2f3d", "#c9b48a", "#5a6ea8"][Math.floor(this.rng() * 6)],
      pants: spec.officer ? "#1a2230" : ["#1d2633", "#2b2b30", "#3f4a3a", "#5c4a38"][Math.floor(this.rng() * 4)],
      hairStyle: Math.floor(this.rng() * 4),
      build: 0.92 + this.rng() * 0.18,
      height: 0.95 + this.rng() * 0.1,
      backpack: this.rng() > 0.72,
      hat: spec.officer === true && this.rng() > 0.5,
      glasses: this.rng() > 0.82,
    };
    this.avatar = new Avatar(scene, appearance);
    this.position.set(spec.x, 0, spec.z);
    this.facing = this.rng() * Math.PI * 2;
    this.avatar.setPosition(this.position.x, this.position.y, this.position.z);
    this.avatar.setFacing(this.facing);
    this.avatar.animate(0, 0, true);
  }

  get isOfficer(): boolean {
    return this.spec.officer === true;
  }

  get home(): Vector3 {
    return new Vector3(this.spec.x, 0, this.spec.z);
  }

  getDialogue(hour: number): string[] {
    const lines = [...this.spec.lines];
    const greeting = greetingForHour(hour);
    const extra: string[] = [];
    if (this.spec.role.includes("Barista")) extra.push("The machine is hot. The queue is not. Enjoy it.");
    if (this.spec.role.includes("Patrol")) extra.push("Curfew is a suggestion around here. Keep it that way and we're fine.");
    if (this.spec.role.includes("Musician")) extra.push("Rain makes the strings sound better. Or worse. Hard to tell.");
    if (this.spec.role.includes("vendor")) extra.push("Ask me again after sunset and the price doubles.");
    return [greeting, ...lines, ...extra.slice(0, 1)];
  }

  /** Flee / approach behaviour used by the police system. */
  chase(target: Vector3): void {
    this.state = "chase";
    this.targetOverride = target.clone();
  }

  private targetOverride: Vector3 | null = null;

  stopChase(): void {
    this.state = "idle";
    this.targetOverride = null;
    this.idleTimer = 2;
  }

  faceTo(point: Vector3): void {
    this.facing = Math.atan2(point.x - this.position.x, point.z - this.position.z);
    this.avatar.setFacing(this.facing);
  }

  update(dt: number, world: World, hour: number, playerPos: Vector3): void {
    const dist = Vector3.Distance(this.position, playerPos);
    const lodVisible = dist < 240;
    if (lodVisible !== this.visible) {
      this.visible = lodVisible;
      this.avatar.setVisible(lodVisible);
    }
    if (!lodVisible) return;

    if (this.state === "talk") {
      this.speed = 0;
      this.avatar.animate(dt, 0, true);
      return;
    }

    const activity = activityForHour(hour);
    this.activity = activity;

    if (this.state === "chase" && this.targetOverride) {
      this.moveToward(this.targetOverride, dt, world, 2.6);
      this.avatar.animate(dt, this.speed, true);
      return;
    }

    if (activity === "rest") {
      this.state = "rest";
      this.speed = 0;
      this.avatar.animate(dt, 0, true);
      return;
    }

    const route = this.spec.route;
    if (route.length > 1) {
      const target = route[this.routeIndex % route.length];
      const goal = new Vector3(target.x, 0, target.z);
      if (Vector3.Distance(new Vector3(this.position.x, 0, this.position.z), goal) < 0.9) {
        this.routeIndex = (this.routeIndex + 1) % route.length;
        this.idleTimer = activity === "work" ? 1.2 + this.rng() * 2 : 0.4 + this.rng();
      }
      if (this.idleTimer > 0) {
        this.idleTimer -= dt;
        this.speed = 0;
        this.state = "idle";
        this.avatar.animate(dt, 0, true);
      } else {
        this.state = "walk";
        this.moveToward(goal, dt, world, this.isOfficer ? 1.7 : 1.35);
        this.avatar.animate(dt, this.speed, true);
      }
    } else {
      this.state = "idle";
      this.speed = 0;
      this.avatar.animate(dt, 0, true);
      // Vendors turn to face passers-by.
      if (dist < 9) this.faceTo(playerPos);
    }
  }

  private moveToward(target: Vector3, dt: number, world: World, speed: number): void {
    const dir = new Vector3(target.x - this.position.x, 0, target.z - this.position.z);
    const len = dir.length();
    if (len < 0.05) {
      this.speed = 0;
      return;
    }
    dir.scaleInPlace(1 / len);
    this.position.x += dir.x * speed * dt;
    this.position.z += dir.z * speed * dt;
    world.resolveCollisions(this.position, 0.36);
    this.position.y = world.groundHeight(this.position.x, this.position.z);
    this.speed = speed;
    const desiredFacing = Math.atan2(dir.x, dir.z);
    let diff = ((desiredFacing - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.facing += diff * Math.min(1, dt * 7);
    this.avatar.setPosition(this.position.x, this.position.y, this.position.z);
    this.avatar.setFacing(this.facing);
  }

  dispose(): void {
    this.avatar.dispose();
    void this.scene;
  }
}
