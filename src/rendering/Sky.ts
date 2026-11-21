import {
  Color3,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Sky, sun/moon and the global light rig. Drives a continuous day/night cycle
 * and reacts to weather (rain dims and desaturates the horizon).
 */
export class Sky {
  readonly sun: DirectionalLight;
  readonly ambient: HemisphericLight;
  readonly moon: DirectionalLight;
  readonly sunDirection = new Vector3(0, 1, 0);

  private scene: Scene;
  private dome: Mesh;
  private skyTexture: DynamicTexture;
  private sunDisc: Mesh;
  private moonDisc: Mesh;
  private starRoot: import("@babylonjs/core").AbstractMesh[] = [];
  private lastBucket = -1;

  constructor(scene: Scene) {
    this.scene = scene;

    this.ambient = new HemisphericLight("ambient", new Vector3(0.2, 1, 0.1), scene);
    this.ambient.intensity = 0.5;
    this.ambient.diffuse = new Color3(0.62, 0.74, 0.9);
    this.ambient.groundColor = new Color3(0.16, 0.17, 0.18);
    this.ambient.specular = new Color3(0.05, 0.05, 0.05);

    this.sun = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.3), scene);
    this.sun.intensity = 2.2;
    this.sun.diffuse = new Color3(1, 0.94, 0.82);
    this.sun.position = new Vector3(200, 320, 160);

    // Cool fill light for the night side, so streets stay readable.
    this.moon = new DirectionalLight("moon", new Vector3(0.4, -1, -0.3), scene);
    this.moon.intensity = 0;
    this.moon.diffuse = new Color3(0.58, 0.68, 0.95);
    this.moon.specular = new Color3(0.12, 0.14, 0.2);

    // Gradient sky dome.
    this.skyTexture = new DynamicTexture("skyGradient", { width: 64, height: 512 }, scene, false);
    // Canvas Y grows downward while sphere UVs grow upward: flip so the top of
    // the dome samples the top of the gradient.
    this.skyTexture.vScale = -1;
    this.skyTexture.vOffset = 1;
    const skyMat = new StandardMaterial("skyMat", scene);
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    skyMat.emissiveTexture = this.skyTexture;
    skyMat.diffuseColor = Color3.Black();
    skyMat.specularColor = Color3.Black();

    this.dome = MeshBuilder.CreateSphere("skyDome", { diameter: 4200, segments: 20 }, scene);
    this.dome.material = skyMat;
    this.dome.infiniteDistance = true;
    this.dome.isPickable = false;
    this.dome.applyFog = false;
    this.dome.receiveShadows = false;

    const sunMat = new StandardMaterial("sunMat", scene);
    sunMat.disableLighting = true;
    sunMat.emissiveColor = new Color3(1, 0.86, 0.55);
    sunMat.fogEnabled = false;
    this.sunDisc = MeshBuilder.CreateSphere("sunDisc", { diameter: 110, segments: 10 }, scene);
    this.sunDisc.material = sunMat;
    this.sunDisc.infiniteDistance = true;
    this.sunDisc.isPickable = false;
    this.sunDisc.applyFog = false;

    const moonMat = new StandardMaterial("moonMat", scene);
    moonMat.disableLighting = true;
    moonMat.emissiveColor = new Color3(0.78, 0.85, 0.96);
    moonMat.fogEnabled = false;
    this.moonDisc = MeshBuilder.CreateSphere("moonDisc", { diameter: 62, segments: 8 }, scene);
    this.moonDisc.material = moonMat;
    this.moonDisc.infiniteDistance = true;
    this.moonDisc.isPickable = false;
    this.moonDisc.applyFog = false;

    const starMat = new StandardMaterial("starMat", scene);
    starMat.disableLighting = true;
    starMat.emissiveColor = new Color3(0.9, 0.95, 1);
    starMat.fogEnabled = false;
    const starProto = MeshBuilder.CreateSphere("starProto", { diameter: 7, segments: 3 }, scene);
    starProto.material = starMat;
    starProto.isVisible = false;
    starProto.isPickable = false;
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 170; i++) {
      const el = rnd() * Math.PI * 0.48 + 0.08;
      const az = rnd() * Math.PI * 2;
      const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const star = starProto.createInstance(`star${i}`);
      star.position.copyFrom(dir.scale(2000));
      star.scaling.setAll(0.6 + rnd() * 1.4);
      this.starRoot.push(star);
    }

    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0032;
    scene.fogColor = new Color3(0.55, 0.65, 0.76);
    scene.fogEnabled = true;

    this.update(9.5, 0);
  }

  setRenderDistance(distance: number): void {
    // Keep the far plane comfortably beyond the streaming radius.
    this.scene.fogDensity = 1.05 / Math.max(160, distance);
  }

  /** hour: 0-24. rain: 0-1. */
  update(hour: number, rain: number): void {
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const dir = new Vector3(Math.cos(angle) * 0.86, Math.sin(angle), 0.42).normalize();
    this.sunDirection.copyFrom(dir);

    const elevation = dir.y;
    const daylight = Math.max(0, Math.min(1, elevation * 2.4 + 0.08));
    const golden = Math.max(0, 1 - Math.abs(elevation) * 4.2) * daylight;
    const night = 1 - daylight;
    const bucket = Math.floor(hour * 4) * 100 + Math.round(rain * 4);
    if (bucket !== this.lastBucket) {
      this.lastBucket = bucket;
      this.paintSky(daylight, golden, night, rain);
    }

    this.sun.direction = dir.scale(-1);
    this.sun.position.copyFrom(dir.scale(420));
    this.sun.intensity = 0.14 + daylight * 2.5 * (1 - rain * 0.55);
    this.sun.diffuse = Color3.Lerp(
      new Color3(1, 0.6, 0.35),
      new Color3(1, 0.95, 0.86),
      Math.max(0, Math.min(1, elevation * 3 + 0.25)),
    );
    this.ambient.intensity = 0.3 + daylight * 0.46 * (1 - rain * 0.25) + night * 0.26;
    this.moon.direction = dir;
    this.moon.position.copyFrom(dir.scale(-420));
    this.moon.intensity = night * 0.72 * (1 - rain * 0.35);
    this.ambient.diffuse = Color3.Lerp(
      new Color3(0.16, 0.22, 0.36),
      new Color3(0.66, 0.77, 0.92),
      daylight,
    );
    this.ambient.groundColor = Color3.Lerp(
      new Color3(0.09, 0.1, 0.14),
      new Color3(0.2, 0.2, 0.19),
      daylight,
    );

    this.sunDisc.position.copyFrom(dir.scale(1900));
    this.sunDisc.setEnabled(elevation > -0.08);
    this.moonDisc.position.copyFrom(dir.scale(-1900));
    this.moonDisc.setEnabled(elevation <= 0.02);
    for (const star of this.starRoot) {
      star.setEnabled(elevation < -0.02);
    }
  }

  private paintSky(daylight: number, golden: number, night: number, rain: number): void {
    const ctx = this.skyTexture.getContext() as CanvasRenderingContext2D;
    const h = 512;
    const top = Color3.Lerp(new Color3(0.015, 0.03, 0.07), new Color3(0.16, 0.42, 0.72), daylight);
    const horizon = Color3.Lerp(new Color3(0.06, 0.1, 0.16), new Color3(0.68, 0.8, 0.91), daylight);
    const goldenTint = new Color3(0.98, 0.55, 0.28);
    const topC = Color3.Lerp(top, goldenTint, golden * 0.22);
    const horizonC = Color3.Lerp(horizon, goldenTint, golden * 0.7);
    const rainGrey = new Color3(0.36, 0.4, 0.45);
    const finalTop = Color3.Lerp(topC, rainGrey.scale(0.45 + daylight * 0.5), rain * 0.7);
    const finalHorizon = Color3.Lerp(horizonC, rainGrey.scale(0.55 + daylight * 0.45), rain * 0.65);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, finalTop.toHexString());
    grad.addColorStop(0.42, Color3.Lerp(finalTop, finalHorizon, 0.65).toHexString());
    grad.addColorStop(0.62, finalHorizon.toHexString());
    grad.addColorStop(0.72, Color3.Lerp(finalHorizon, new Color3(0.1, 0.13, 0.16), 0.55).toHexString());
    grad.addColorStop(1, Color3.Lerp(finalHorizon, new Color3(0.02, 0.04, 0.06), night * 0.85).toHexString());
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, h);

    // Subtle horizon haze band.
    ctx.fillStyle = `rgba(255,255,255,${0.05 + daylight * 0.05})`;
    ctx.fillRect(0, h * 0.6, 64, h * 0.06);
    this.skyTexture.update();

    const fog = Color3.Lerp(finalHorizon, new Color3(0.3, 0.35, 0.4), rain * 0.5);
    this.scene.fogColor = fog;
    this.scene.clearColor.set(fog.r * 0.55, fog.g * 0.6, fog.b * 0.65, 1);
  }

  /** Warm street-light intensity 0..1 based on sun elevation. */
  get nightFactor(): number {
    return Math.max(0, Math.min(1, 1 - this.sunDirection.y * 3.5));
  }

  get sunColor(): Color3 {
    return this.sun.diffuse;
  }

  dispose(): void {
    this.skyTexture.dispose();
    this.dome.dispose();
    this.sunDisc.dispose();
    this.moonDisc.dispose();
    for (const star of this.starRoot) star.dispose();
    this.sun.dispose();
    this.moon.dispose();
    this.ambient.dispose();
  }
}
