import { DefaultRenderingPipeline, Scene, type Camera } from "@babylonjs/core";
import type { QualityProfile } from "../core/Settings";

/** Cinematic post stack. Every effect is individually scalable. */
export class PostFX {
  private scene: Scene;
  private camera: Camera;
  private pipeline: DefaultRenderingPipeline | null = null;
  private profile: QualityProfile;

  constructor(scene: Scene, camera: Camera, profile: QualityProfile) {
    this.scene = scene;
    this.camera = camera;
    this.profile = profile;
  }

  build(): void {
    const pipeline = new DefaultRenderingPipeline(
      "cinematic",
      true,
      this.scene,
      [this.camera],
    );
    pipeline.samples = 4;
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = this.profile.bloom;
    pipeline.bloomThreshold = 0.72;
    pipeline.bloomWeight = 0.22;
    pipeline.bloomKernel = 42;
    pipeline.bloomScale = 0.55;
    pipeline.depthOfFieldEnabled = this.profile.depthOfField;
    pipeline.depthOfFieldBlurLevel = 1;
    pipeline.depthOfField.focalLength = 42;
    pipeline.depthOfField.fStop = 4.5;
    pipeline.depthOfField.focusDistance = 9000;
    pipeline.grainEnabled = this.profile.grain;
    pipeline.grain.intensity = 4;
    pipeline.grain.animated = true;
    pipeline.chromaticAberrationEnabled = this.profile.grain;
    pipeline.chromaticAberration.aberrationAmount = 6;
    pipeline.sharpenEnabled = false;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.6;
    pipeline.imageProcessing.vignetteColor.set(0, 0, 0, 0);
    this.pipeline = pipeline;
  }

  applyProfile(profile: QualityProfile): void {
    this.profile = profile;
    if (!this.pipeline) return;
    this.pipeline.bloomEnabled = profile.bloom;
    this.pipeline.depthOfFieldEnabled = profile.depthOfField;
    this.pipeline.grainEnabled = profile.grain;
    this.pipeline.chromaticAberrationEnabled = profile.grain;
    this.pipeline.samples = profile === this.profile && profile.label === "Ultra" ? 8 : 4;
  }

  setFocusDistance(distance: number): void {
    if (this.pipeline?.depthOfFieldEnabled) {
      this.pipeline.depthOfField.focusDistance = distance * 1000;
    }
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
  }
}
