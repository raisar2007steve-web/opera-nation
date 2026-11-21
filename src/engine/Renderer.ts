import {
  Color3,
  Color4,
  Scene,
  Engine,
  type AbstractEngine,
  ImageProcessingConfiguration,
} from "@babylonjs/core";

export type RenderBackend = "webgpu" | "webgl2";

/**
 * Some drivers expose navigator.gpu but cannot upload external images to a
 * texture, which breaks every generated texture in the game. Probe that exact
 * operation on a throwaway device before claiming the game canvas with WebGPU.
 */
async function webGPUUsable(): Promise<boolean> {
  const nav = navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } };
  if (!nav.gpu) return false;
  let device: {
    createTexture(desc: unknown): {
      destroy(): void;
    };
    queue: {
      copyExternalImageToTexture(src: unknown, dst: unknown, size: unknown): void;
      onSubmittedWorkDone(): Promise<void>;
    };
    destroy(): void;
  } | null = null;
  try {
    const adapter = (await nav.gpu.requestAdapter()) as {
      requestDevice(): Promise<typeof device>;
    } | null;
    if (!adapter) return false;
    device = await adapter.requestDevice();
    if (!device) return false;
    const usage = (globalThis as unknown as { GPUTextureUsage?: Record<string, number> })
      .GPUTextureUsage ?? { COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 16 };
    const texture = device.createTexture({
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: (usage.COPY_DST ?? 2) | (usage.TEXTURE_BINDING ?? 4) | (usage.RENDER_ATTACHMENT ?? 16),
    });
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    probe.getContext("2d")?.fillRect(0, 0, 1, 1);
    const bitmap = await createImageBitmap(probe);
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      { width: 1, height: 1 },
    );
    await device.queue.onSubmittedWorkDone();
    bitmap.close();
    texture.destroy();
    return true;
  } catch {
    return false;
  } finally {
    try {
      device?.destroy();
    } catch {
      // Ignore probe teardown failures.
    }
  }
}

export interface RendererOptions {
  preferWebGPU: boolean;
  onWarn?: (message: string) => void;
}

/**
 * Owns the Babylon engine + scene. Tries WebGPU first and falls back to WebGL 2
 * automatically, so the game still boots on browsers without WebGPU.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly engine: AbstractEngine;
  readonly scene: Scene;
  readonly backend: RenderBackend;
  readonly backendNote: string;

  private constructor(
    canvas: HTMLCanvasElement,
    engine: AbstractEngine,
    scene: Scene,
    backend: RenderBackend,
    backendNote: string,
  ) {
    this.canvas = canvas;
    this.engine = engine;
    this.scene = scene;
    this.backend = backend;
    this.backendNote = backendNote;
  }

  static async create(canvas: HTMLCanvasElement, options: RendererOptions): Promise<Renderer> {
    let engine: AbstractEngine | null = null;
    let backend: RenderBackend = "webgl2";
    let note = "WebGL 2";

    const gpuProbe = options.preferWebGPU ? await webGPUUsable() : false;
    if (options.preferWebGPU && !gpuProbe) {
      options.onWarn?.(
        "WebGPU cannot upload textures on this driver. Running on WebGL 2.",
      );
    }

    if (gpuProbe) {
      let webgpu: AbstractEngine | null = null;
      try {
        const mod = await import("@babylonjs/core/Engines/webgpuEngine");
        const candidate = new mod.WebGPUEngine(canvas, {
          antialias: true,
          adaptToDeviceRatio: true,
          powerPreference: "high-performance",
        } as unknown as ConstructorParameters<typeof mod.WebGPUEngine>[1]);
        await candidate.initAsync();
        webgpu = candidate as unknown as AbstractEngine;
        engine = webgpu;
        backend = "webgpu";
        note = "WebGPU";
      } catch (error) {
        options.onWarn?.(
          `WebGPU unavailable (${error instanceof Error ? error.message : "unknown error"}). Falling back to WebGL 2.`,
        );
        try {
          webgpu?.dispose();
        } catch {
          // Ignore teardown failures; the WebGL 2 engine is built next.
        }
        engine = null;
      }
    }

    if (!engine) {
      engine = new Engine(canvas, true, {
        preserveDrawingBuffer: false,
        stencil: true,
        antialias: true,
        powerPreference: "high-performance",
        adaptToDeviceRatio: true,
        failIfMajorPerformanceCaveat: false,
      });
      backend = "webgl2";
      note = "WebGL 2";
    }

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.035, 0.05, 0.075, 1);
    scene.ambientColor = new Color3(0.18, 0.2, 0.26);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.15;
    scene.imageProcessingConfiguration.contrast = 1.08;
    scene.skipPointerMovePicking = true;

    return new Renderer(canvas, engine, scene, backend, note);
  }


  resize(): void {
    this.engine.resize();
  }

  runLoop(callback: () => void): void {
    this.engine.runRenderLoop(callback);
  }

  stopLoop(): void {
    this.engine.stopRenderLoop();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
