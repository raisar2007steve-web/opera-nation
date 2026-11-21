import {
  Color4,
  ParticleSystem,
  Scene,
  Texture,
  Vector3,
  DynamicTexture,
} from "@babylonjs/core";
import type { Sky } from "../rendering/Sky";

/**
 * Continuous clock, rain cycles and lightning. Weather feeds NPC schedules,
 * lighting, the HUD clock and the audio mixer.
 */
export class WeatherSystem {
  /** Game clock in minutes since midnight. */
  clockMinutes = 9 * 60 + 20;
  rain = 0;
  storm = false;
  lightning = 0;

  private targetRain = 0;
  private nextRainCheck = 120; // game minutes
  private scene: Scene;
  private sky: Sky;
  private rainSystem: ParticleSystem;
  private emitAccumulator = 0;
  private flashTimer = 0;
  private flashCooldown = 0;
  private seed = 1337;

  constructor(scene: Scene, sky: Sky) {
    this.scene = scene;
    this.sky = sky;

    const tex = new DynamicTexture("rainTex", { width: 8, height: 64 }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(210,235,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(2, 0, 4, 64);
    tex.update();
    tex.hasAlpha = true;

    this.rainSystem = new ParticleSystem("rain", 5000, scene);
    this.rainSystem.particleTexture = tex;
    this.rainSystem.emitter = new Vector3(0, 0, 0);
    this.rainSystem.minEmitBox = new Vector3(-42, 26, -42);
    this.rainSystem.maxEmitBox = new Vector3(42, 34, 42);
    this.rainSystem.color1 = new Color4(0.72, 0.82, 0.92, 0.5);
    this.rainSystem.color2 = new Color4(0.62, 0.72, 0.86, 0.4);
    this.rainSystem.colorDead = new Color4(0.6, 0.7, 0.85, 0);
    this.rainSystem.minSize = 0.5;
    this.rainSystem.maxSize = 0.9;
    this.rainSystem.minLifeTime = 0.35;
    this.rainSystem.maxLifeTime = 0.6;
    this.rainSystem.emitRate = 0;
    this.rainSystem.gravity = new Vector3(-1.5, -32, -1);
    this.rainSystem.direction1 = new Vector3(-1, -1, -1);
    this.rainSystem.direction2 = new Vector3(1, -1, 1);
    this.rainSystem.minAngularSpeed = 0;
    this.rainSystem.maxAngularSpeed = 0;
    this.rainSystem.minEmitPower = 4;
    this.rainSystem.maxEmitPower = 7;
    this.rainSystem.updateSpeed = 0.012;
    this.rainSystem.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;
    this.rainSystem.start();

    this.rainSystem.emitRate = 0;
  }

  get hour(): number {
    return this.clockMinutes / 60;
  }

  get isNight(): boolean {
    return this.hour < 6 || this.hour > 19.5;
  }

  get clockLabel(): string {
    const total = Math.floor(this.clockMinutes) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  get weatherLabel(): string {
    if (this.storm) return "Thunderstorm";
    if (this.rain > 0.55) return "Heavy rain";
    if (this.rain > 0.18) return "Light rain";
    if (this.rain > 0.05) return "Drizzle";
    return this.isNight ? "Clear night" : "Clear";
  }

  /** Advance the clock and weather. dt in real seconds. */
  update(dt: number, playerPos: Vector3): void {
    this.clockMinutes += dt;
    if (this.clockMinutes >= 1440) this.clockMinutes -= 1440;

    this.nextRainCheck -= dt;
    if (this.nextRainCheck <= 0) {
      this.chooseWeather();
      this.nextRainCheck = 240 + this.rand() * 420;
    }

    const blend = Math.min(1, dt * 0.14);
    this.rain += (this.targetRain - this.rain) * blend;
    this.storm = this.rain > 0.62;

    const desiredRate = this.rain > 0.02 ? 520 * this.rain : 0;
    this.emitAccumulator += (desiredRate - this.rainSystem.emitRate) * Math.min(1, dt * 0.8);
    this.rainSystem.emitRate = Math.max(0, this.rainSystem.emitRate + this.emitAccumulator * dt * 2);
    this.rainSystem.emitter = new Vector3(playerPos.x, playerPos.y, playerPos.z);
    this.rainSystem.minEmitBox = new Vector3(-40, 22, -40);
    this.rainSystem.maxEmitBox = new Vector3(40, 32, 40);

    if (this.storm && this.flashCooldown <= 0) {
      this.flashTimer = 0.16;
      this.flashCooldown = 4 + this.rand() * 9;
    }
    this.flashCooldown = Math.max(0, this.flashCooldown - dt);
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.lightning = 1;
      this.sky.ambient.intensity = Math.min(2.6, this.sky.ambient.intensity + 1.6);
    }

    this.sky.update(this.hour, this.rain);
  }

  private chooseWeather(): void {
    const roll = this.rand();
    if (roll > 0.66) {
      this.targetRain = 0.35 + this.rand() * 0.25;
    } else if (roll > 0.42) {
      this.targetRain = 0.75 + this.rand() * 0.25;
    } else {
      this.targetRain = 0;
    }
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  hydrate(clockMinutes: number): void {
    this.clockMinutes = ((clockMinutes % 1440) + 1440) % 1440;
  }

  dispose(): void {
    this.rainSystem.dispose();
  }
}
