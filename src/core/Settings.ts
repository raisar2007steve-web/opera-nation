export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface QualityProfile {
  label: string;
  /** Hardware scaling: higher = fewer pixels = faster. */
  scaling: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Distance (metres) that content is drawn / streamed at. */
  renderDistance: number;
  bloom: boolean;
  depthOfField: boolean;
  grain: boolean;
  ssao: boolean;
  reflections: boolean;
  particleDensity: number;
  npcDensity: number;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityProfile> = {
  low: {
    label: "Low",
    scaling: 1.5,
    shadows: false,
    shadowMapSize: 1024,
    renderDistance: 190,
    bloom: false,
    depthOfField: false,
    grain: false,
    ssao: false,
    reflections: false,
    particleDensity: 0.35,
    npcDensity: 0.55,
  },
  medium: {
    label: "Medium",
    scaling: 1.15,
    shadows: true,
    shadowMapSize: 1024,
    renderDistance: 300,
    bloom: true,
    depthOfField: false,
    grain: false,
    ssao: false,
    reflections: false,
    particleDensity: 0.6,
    npcDensity: 0.8,
  },
  high: {
    label: "High",
    scaling: 1,
    shadows: true,
    shadowMapSize: 2048,
    renderDistance: 460,
    bloom: true,
    depthOfField: true,
    grain: true,
    ssao: false,
    reflections: true,
    particleDensity: 1,
    npcDensity: 1,
  },
  ultra: {
    label: "Ultra",
    scaling: 0.85,
    shadows: true,
    shadowMapSize: 4096,
    renderDistance: 620,
    bloom: true,
    depthOfField: true,
    grain: true,
    ssao: true,
    reflections: true,
    particleDensity: 1.4,
    npcDensity: 1,
  },
};

export interface Settings {
  quality: QualityPreset;
  preferWebGPU: boolean;
  adaptiveResolution: boolean;
  masterVolume: number;
  mouseSensitivity: number;
  invertY: boolean;
  showMinimap: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: "high",
  preferWebGPU: true,
  adaptiveResolution: true,
  masterVolume: 0.7,
  mouseSensitivity: 1,
  invertY: false,
  showMinimap: true,
};

/** Pick a sane starting preset for the device class. */
export function suggestedPreset(): QualityPreset {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) return cores >= 8 && memory >= 6 ? "medium" : "low";
  if (cores <= 4 || memory <= 4) return "low";
  if (cores >= 12 && memory >= 8) return "high";
  return "medium";
}

export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}
