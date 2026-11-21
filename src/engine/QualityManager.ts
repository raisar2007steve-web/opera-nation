import type { AbstractEngine, Scene } from "@babylonjs/core";
import type { QualityPreset, QualityProfile, Settings } from "../core/Settings";
import { QUALITY_PRESETS } from "../core/Settings";
import type { Renderer } from "./Renderer";

/**
 * Applies graphics presets at runtime and adapts the render resolution when the
 * frame budget is missed. This is the single place that touches engine quality.
 */
export class QualityManager {
  readonly renderer: Renderer;
  profile: QualityProfile;
  preset: QualityPreset;
  private baseScaling: number;
  private adaptive: boolean;
  private frameSamples: number[] = [];
  private cooldown = 0;
  private scene: Scene;
  private engine: AbstractEngine;
  private onProfileChange: (profile: QualityProfile) => void;

  constructor(
    renderer: Renderer,
    settings: Settings,
    onProfileChange: (profile: QualityProfile) => void,
  ) {
    this.renderer = renderer;
    this.scene = renderer.scene;
    this.engine = renderer.engine;
    this.preset = settings.quality;
    this.profile = QUALITY_PRESETS[settings.quality];
    this.baseScaling = this.profile.scaling;
    this.adaptive = settings.adaptiveResolution;
    this.onProfileChange = onProfileChange;
    this.engine.setHardwareScalingLevel(this.baseScaling);
  }

  applyPreset(preset: QualityPreset, adaptive: boolean): void {
    this.preset = preset;
    this.profile = QUALITY_PRESETS[preset];
    this.baseScaling = this.profile.scaling;
    this.adaptive = adaptive;
    this.engine.setHardwareScalingLevel(this.baseScaling);
    this.scene.shadowsEnabled = this.profile.shadows;
    this.scene.particlesEnabled = this.profile.particleDensity > 0.2;
    this.onProfileChange(this.profile);
  }

  /** Call once per frame with the measured frame time in milliseconds. */
  update(dtMs: number): void {
    if (!this.adaptive) return;
    this.frameSamples.push(dtMs);
    if (this.frameSamples.length > 90) this.frameSamples.shift();
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return;
    }
    if (this.frameSamples.length < 60) return;

    const avg = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
    const current = this.engine.getHardwareScalingLevel();
    if (avg > 26 && current < this.baseScaling + 0.85) {
      this.engine.setHardwareScalingLevel(Math.min(current + 0.12, this.baseScaling + 0.85));
      this.cooldown = 100;
    } else if (avg < 15 && current > this.baseScaling) {
      this.engine.setHardwareScalingLevel(Math.max(current - 0.08, this.baseScaling));
      this.cooldown = 140;
    }
  }

  get resolutionScaleLabel(): string {
    return `${Math.round(100 / this.engine.getHardwareScalingLevel())}%`;
  }
}
