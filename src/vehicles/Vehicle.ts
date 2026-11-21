import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  SpotLight,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { Input } from "../core/Input";
import type { World } from "../world/World";

export type VehicleModel = "kestrel" | "cruiser" | "taxi";
export type VehicleClass = "land" | "air" | "water";

export interface VehicleSpec {
  model: VehicleModel;
  name: string;
  bodyColor: string;
  accentColor: string;
  maxSpeed: number;
  accel: number;
  reverseSpeed: number;
  grip: number;
  steering: number;
  seats: number;
}

const SPECS: Record<VehicleModel, VehicleSpec> = {
  kestrel: {
    model: "kestrel",
    name: "Kestrel GT",
    bodyColor: "#b8322a",
    accentColor: "#14181e",
    maxSpeed: 46,
    accel: 13,
    reverseSpeed: 11,
    grip: 3.6,
    steering: 1.9,
    seats: 2,
  },
  cruiser: {
    model: "cruiser",
    name: "MPD Cruiser",
    bodyColor: "#1e2a3c",
    accentColor: "#f2f4f7",
    maxSpeed: 38,
    accel: 10,
    reverseSpeed: 9,
    grip: 3.2,
    steering: 1.7,
    seats: 4,
  },
  taxi: {
    model: "taxi",
    name: "Harbor Cab",
    bodyColor: "#e0a92c",
    accentColor: "#1a1a1a",
    maxSpeed: 32,
    accel: 8,
    reverseSpeed: 8,
    grip: 3,
    steering: 1.5,
    seats: 4,
  },
};

export interface VehicleOptions {
  id: string;
  model: VehicleModel;
  x: number;
  z: number;
  heading: number;
  owned?: boolean;
  y?: number;
}

/**
 * Arcade vehicle physics tuned for browser frame budgets: acceleration,
 * braking, speed-sensitive steering, lateral grip, suspension bounce and
 * AABB collision against the world. Placeholder box/cylinder bodywork.
 */
export class Vehicle {
  readonly root: TransformNode;
  readonly spec: VehicleSpec;
  readonly id: string;
  readonly radius = 1.35;
  readonly driverSeat = new Vector3(0, 1.2, 0.1);
  owned: boolean;

  position = new Vector3();
  heading = 0;
  speed = 0;
  steerAngle = 0;
  engineOn = false;
  occupied = false;
  damaged = 0;

  private scene: Scene;
  private wheels: TransformNode[] = [];
  private headlights: SpotLight[] = [];
  private bodyMat: StandardMaterial;
  private wheelSpin = 0;
  private bob = 0;
  private tailMat: StandardMaterial;
  private headlightMat: StandardMaterial;

  constructor(scene: Scene, options: VehicleOptions) {
    this.scene = scene;
    this.id = options.id;
    this.owned = options.owned ?? false;
    this.spec = SPECS[options.model];

    this.root = new TransformNode(`vehicle_${options.id}`, scene);
    this.position.set(options.x, options.y ?? 0, options.z);
    this.heading = options.heading;
    this.root.position.copyFrom(this.position);
    this.root.rotation.y = this.heading;

    this.bodyMat = new StandardMaterial(`body_${options.id}`, scene);
    this.bodyMat.diffuseColor = Color3.FromHexString(this.spec.bodyColor);
    this.bodyMat.specularColor = new Color3(0.6, 0.6, 0.62);
    this.bodyMat.specularPower = 90;

    const accent = new StandardMaterial(`accent_${options.id}`, scene);
    accent.diffuseColor = Color3.FromHexString(this.spec.accentColor);
    accent.specularColor = new Color3(0.2, 0.2, 0.2);

    const glass = new StandardMaterial(`glass_${options.id}`, scene);
    glass.diffuseColor = new Color3(0.09, 0.14, 0.18);
    glass.specularColor = new Color3(0.9, 0.95, 1);
    glass.specularPower = 200;
    glass.alpha = 0.9;

    const tyre = new StandardMaterial(`tyre_${options.id}`, scene);
    tyre.diffuseColor = new Color3(0.045, 0.045, 0.05);
    tyre.specularColor = Color3.Black();

    const chrome = new StandardMaterial(`chrome_${options.id}`, scene);
    chrome.diffuseColor = new Color3(0.62, 0.64, 0.68);
    chrome.specularColor = new Color3(1, 1, 1);
    chrome.specularPower = 250;

    const isTaxi = options.model === "taxi";
    const isCruiser = options.model === "cruiser";
    const length = isTaxi ? 4.9 : isCruiser ? 5.1 : 4.6;
    const width = isTaxi ? 2.0 : isCruiser ? 2.05 : 1.95;
    const bodyHeight = isTaxi ? 1.05 : isCruiser ? 0.95 : 0.8;

    const body = MeshBuilder.CreateBox("carBody", { width, height: bodyHeight, depth: length }, scene);
    body.parent = this.root;
    body.position.y = 0.72;
    body.material = this.bodyMat;

    const cabin = MeshBuilder.CreateBox(
      "carCabin",
      {
        width: width * 0.86,
        height: isTaxi || isCruiser ? 0.9 : 0.66,
        depth: length * 0.44,
      },
      scene,
    );
    cabin.parent = this.root;
    cabin.position.set(0, 0.72 + bodyHeight / 2 + (isTaxi || isCruiser ? 0.42 : 0.3), isTaxi ? 0.3 : -0.15);
    cabin.material = glass;

    const roof = MeshBuilder.CreateBox(
      "carRoof",
      { width: width * 0.82, height: 0.1, depth: length * 0.4 },
      scene,
    );
    roof.parent = this.root;
    roof.position.set(0, cabin.position.y + cabin.getBoundingInfo().boundingBox.extendSize.y + 0.02, cabin.position.z);
    roof.material = this.bodyMat;

    // Bonnet / boot shading.
    for (const z of [-length * 0.34, length * 0.36]) {
      const panel = MeshBuilder.CreateBox("panel", { width: width * 0.9, height: 0.06, depth: 0.7 }, scene);
      panel.parent = this.root;
      panel.position.set(0, 0.72 + bodyHeight / 2 + 0.01, z);
      panel.material = accent;
    }

    // Wheels.
    const wheelGeo = (x: number, z: number, radius: number) => {
      const pivot = new TransformNode("wheelPivot", scene);
      pivot.parent = this.root;
      pivot.position.set(x, radius, z);
      const tyreMesh = MeshBuilder.CreateCylinder(
        "wheel",
        { height: 0.32, diameter: radius * 2, tessellation: 14 },
        scene,
      );
      tyreMesh.parent = pivot;
      tyreMesh.rotation.z = Math.PI / 2;
      tyreMesh.material = tyre;
      const hub = MeshBuilder.CreateCylinder(
        "hub",
        { height: 0.34, diameter: radius * 0.9, tessellation: 10 },
        scene,
      );
      hub.parent = pivot;
      hub.rotation.z = Math.PI / 2;
      hub.material = chrome;
      pivot.getChildMeshes().forEach((m) => (m.isPickable = false));
      this.wheels.push(pivot);
      return pivot;
    };
    const wheelBase = length * 0.33;
    const trackHalf = width / 2 - 0.06;
    wheelGeo(-trackHalf, -wheelBase, 0.36);
    wheelGeo(trackHalf, -wheelBase, 0.36);
    wheelGeo(-trackHalf, wheelBase, 0.36);
    wheelGeo(trackHalf, wheelBase, 0.36);

    // Lights.
    this.headlightMat = new StandardMaterial(`headMat_${options.id}`, scene);
    this.headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.85);
    this.headlightMat.emissiveColor = new Color3(0.9, 0.85, 0.65);
    this.tailMat = new StandardMaterial(`tailMat_${options.id}`, scene);
    this.tailMat.diffuseColor = new Color3(0.5, 0.05, 0.05);
    this.tailMat.emissiveColor = new Color3(0.5, 0.03, 0.03);

    for (const side of [-1, 1]) {
      const lamp = MeshBuilder.CreateBox("headlamp", { width: 0.36, height: 0.16, depth: 0.08 }, scene);
      lamp.parent = this.root;
      lamp.position.set(side * (width / 2 - 0.34), 0.78, length / 2 + 0.01);
      lamp.material = this.headlightMat;
      lamp.isPickable = false;

      const tail = MeshBuilder.CreateBox("taillamp", { width: 0.36, height: 0.14, depth: 0.08 }, scene);
      tail.parent = this.root;
      tail.position.set(side * (width / 2 - 0.34), 0.8, -length / 2 - 0.01);
      tail.material = this.tailMat;
      tail.isPickable = false;

      const light = new SpotLight(`headlight_${options.id}_${side}`, new Vector3(0, 0.9, length / 2), new Vector3(0, -0.12, 1), Math.PI / 3.2, 2, scene);
      light.parent = this.root;
      light.intensity = 0;
      light.diffuse = new Color3(1, 0.94, 0.78);
      light.range = 42;
      light.innerAngle = Math.PI / 6;
      this.headlights.push(light);
    }

    if (isCruiser) {
      const bar = MeshBuilder.CreateBox("lightbar", { width: 1.3, height: 0.13, depth: 0.32 }, scene);
      bar.parent = this.root;
      bar.position.set(0, roof.position.y + 0.14, cabin.position.z);
      const barMat = new StandardMaterial(`bar_${options.id}`, scene);
      barMat.emissiveColor = new Color3(0.2, 0.35, 1);
      barMat.diffuseColor = new Color3(0.1, 0.15, 0.4);
      bar.material = barMat;
      bar.isPickable = false;
    }

    if (isTaxi) {
      const sign = MeshBuilder.CreateBox("taxiSign", { width: 0.7, height: 0.22, depth: 0.24 }, scene);
      sign.parent = this.root;
      sign.position.set(0, roof.position.y + 0.18, cabin.position.z);
      const signMat = new StandardMaterial(`taxiSignMat_${options.id}`, scene);
      signMat.emissiveColor = new Color3(1, 0.8, 0.25);
      signMat.diffuseColor = new Color3(0.6, 0.45, 0.1);
      sign.material = signMat;
      sign.isPickable = false;
    }

    this.root.getChildMeshes().forEach((m) => {
      m.receiveShadows = true;
      m.isPickable = false;
    });
  }

  setNight(night: number, driving: boolean): void {
    const on = driving || night > 0.45;
    for (const light of this.headlights) light.intensity = on ? (driving ? 1.5 : 0.55) : 0;
    this.headlightMat.emissiveColor = on ? new Color3(1, 0.95, 0.78) : new Color3(0.35, 0.34, 0.3);
    this.tailMat.emissiveColor = driving
      ? new Color3(1, 0.12, 0.1)
      : new Color3(0.35, 0.03, 0.03);
  }

  /** Returns the entry point beside the driver door. */
  get doorPosition(): Vector3 {
    const side = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    return this.position.add(side.scale(this.radius + 0.9));
  }

  enter(): void {
    this.occupied = true;
    this.engineOn = true;
  }

  exit(): void {
    this.occupied = false;
    this.engineOn = false;
    this.speed = 0;
  }

  update(dt: number, input: Input | null, world: World, night: number): void {
    const driveInput = this.occupied ? input : null;
    const move = driveInput ? driveInput.readMove() : { forward: 0, right: 0, sprint: false, jump: false };
    const throttle = move.forward;
    const steering = move.right;

    if (this.occupied) {
      const accelerating = throttle > 0.05;
      const braking = throttle < -0.05;
      const max = this.spec.maxSpeed * (move.sprint ? 1.08 : 1);
      if (accelerating) {
        this.speed += this.spec.accel * dt * (1 - Math.max(0, this.speed) / max);
      } else if (braking) {
        if (this.speed > 0.4) this.speed -= this.spec.accel * 2.6 * dt;
        else this.speed -= this.spec.accel * 0.65 * dt;
      } else {
        this.speed -= Math.sign(this.speed) * this.spec.grip * dt * 0.9;
        if (Math.abs(this.speed) < 0.12) this.speed = 0;
      }
      this.speed = Math.max(-this.spec.reverseSpeed, Math.min(max, this.speed));

      const steerFalloff = 0.35 + 0.65 / (1 + Math.abs(this.speed) * 0.045);
      this.steerAngle += (steering * steerFalloff - this.steerAngle) * Math.min(1, dt * 8);
      this.heading += this.steerAngle * this.spec.steering * dt * (this.speed / (Math.abs(this.speed) + 5.5));
    } else {
      this.speed *= Math.pow(0.05, dt);
      this.steerAngle *= Math.pow(0.1, dt);
    }

    const forward = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const next = this.position.add(forward.scale(this.speed * dt));

    // Collide against buildings; kill momentum on impact.
    const probe = next.clone();
    const hit = world.resolveCollisions(probe, this.radius);
    if (hit) {
      this.speed *= -0.18;
      this.damaged = Math.min(1, this.damaged + Math.abs(this.speed) * 0.02);
    } else {
      this.position.copyFrom(next);
    }

    // Stay on drivable ground and out of deep water.
    const ground = world.groundHeight(this.position.x, this.position.z);
    if (ground < -3) {
      this.speed *= 0.4;
    } else {
      this.position.y += (ground - this.position.y) * Math.min(1, dt * 8);
    }

    this.root.position.copyFrom(this.position);
    this.root.rotation.y = this.heading;

    // Wheels + suspension bounce.
    this.wheelSpin += (this.speed * dt) / 0.36;
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].rotation.x = this.wheelSpin;
      this.wheels[i].rotation.y = i < 2 ? this.steerAngle * 0.5 : 0;
    }
    this.bob += dt * (2 + Math.abs(this.speed) * 0.35);
    this.root.position.y += Math.sin(this.bob) * Math.min(0.025, Math.abs(this.speed) * 0.0016);

    this.setNight(night, this.occupied);
  }

  applyDamage(amount: number): void {
    this.damaged = Math.min(1, this.damaged + amount);
    if (this.damaged > 0.75) {
      this.bodyMat.diffuseColor = Color3.Lerp(
        Color3.FromHexString(this.spec.bodyColor),
        new Color3(0.16, 0.15, 0.14),
        (this.damaged - 0.75) / 0.25,
      );
    }
  }

  repair(): void {
    this.damaged = 0;
    this.bodyMat.diffuseColor = Color3.FromHexString(this.spec.bodyColor);
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}

export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  active: Vehicle | null = null;

  constructor(scene: Scene, world: World, spawns: { id: string; model: VehicleModel; x: number; z: number; heading: number; owned?: boolean }[]) {
    for (const spawn of spawns) {
      const vehicle = new Vehicle(scene, {
        id: spawn.id,
        model: spawn.model,
        x: spawn.x,
        z: spawn.z,
        heading: spawn.heading,
        owned: spawn.owned,
        y: world.terrain.heightAt(spawn.x, spawn.z),
      });
      this.vehicles.push(vehicle);
      for (const mesh of vehicle.root.getChildMeshes()) world.shadow?.addShadowCaster(mesh);
    }
  }

  nearest(position: Vector3, maxDist = 4): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (v.occupied) continue;
      const d = Vector3.Distance(v.position, position);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  update(dt: number, input: Input, world: World, night: number): void {
    for (const v of this.vehicles) v.update(dt, input, world, night);
  }

  dispose(): void {
    for (const v of this.vehicles) v.dispose();
    this.vehicles.length = 0;
  }
}
