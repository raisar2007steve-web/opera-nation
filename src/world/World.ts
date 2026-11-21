import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Terrain, INTERIOR_Y, WORLD_SIZE } from "../terrain/Terrain";
import { METROPOLIS, type BlockSpec } from "../cities/Metropolis";
import { Sky } from "../rendering/Sky";

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export type InteractKind = "door" | "bed" | "wardrobe" | "computer" | "exit";
export interface Interactable {
  id: string;
  kind: InteractKind;
  label: string;
  position: Vector3;
  radius: number;
  interior: boolean;
}

interface BlockGroup {
  center: Vector3;
  root: TransformNode;
  enabled: boolean;
}

const FACADE_STYLES = ["glass", "concrete", "brick", "shop"] as const;
type FacadeStyle = (typeof FACADE_STYLES)[number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The playable world. Builds Metropolis/Harborview procedurally, keeps a spatial
 * hash of colliders, streams block groups by distance and owns all interactables.
 *
 * Placeholder notice: environment meshes are generated primitives in this
 * build; the art pipeline (GLB + KTX2) plugs into the same block APIs later.
 */
export class World {
  readonly terrain: Terrain;
  readonly sky: Sky;
  readonly shadow: ShadowGenerator | null;

  private scene: Scene;
  private colliders: BoxCollider[] = [];
  private grid = new Map<string, BoxCollider[]>();
  private gridCell = 32;
  private groups: BlockGroup[] = [];
  private interactables: Interactable[] = [];
  private interiorRoot: TransformNode;
  private water!: Mesh;
  private waterMat!: PBRMaterial;
  private windowMats: StandardMaterial[] = [];
  private streetLampMats: StandardMaterial[] = [];
  private doorGlowMat: StandardMaterial;
  private facadeCache = new Map<FacadeStyle, { diffuse: DynamicTexture; emissive: DynamicTexture }>();
  private roadMats: StandardMaterial[] = [];
  private night = 0;

  interiorActive = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.terrain = new Terrain(scene);
    this.sky = new Sky(scene);
    this.sky.setRenderDistance(460);

    this.shadow = this.sky.sun ? new ShadowGenerator(2048, this.sky.sun) : null;
    if (this.shadow) {
      this.shadow.useBlurExponentialShadowMap = true;
      this.shadow.blurKernel = 24;
      this.shadow.bias = 0.0012;
      this.shadow.normalBias = 0.02;
      this.shadow.darkness = 0.42;
    }

    this.interiorRoot = new TransformNode("interiorRoot", scene);
    this.interiorRoot.position.y = INTERIOR_Y;
    this.interiorRoot.setEnabled(false);

    this.buildWater();
    this.doorGlowMat = this.makeEmissiveMat("doorGlow", "#f2b544");
    this.createSharedMaterials();

    this.buildRoads();
    for (const block of METROPOLIS.blocks) this.buildBlock(block);
    this.buildOuterWorld();
    this.buildInterior();
    this.rebuildGrid();
  }

  /* ---------------------------------------------------------------- */
  /* Construction                                                      */
  /* ---------------------------------------------------------------- */

  private createSharedMaterials(): void {
    const trunkMat = new StandardMaterial("trunkMat", this.scene);
    trunkMat.diffuseColor = new Color3(0.2, 0.15, 0.11);
    trunkMat.specularColor = Color3.Black();
    const leafMat = new StandardMaterial("leafMat", this.scene);
    leafMat.diffuseColor = new Color3(0.13, 0.23, 0.14);
    leafMat.specularColor = new Color3(0.02, 0.02, 0.02);
    const metalMat = new StandardMaterial("metalMat", this.scene);
    metalMat.diffuseColor = new Color3(0.18, 0.19, 0.2);
    metalMat.specularColor = new Color3(0.25, 0.25, 0.25);
    const woodMat = new StandardMaterial("woodMat", this.scene);
    woodMat.diffuseColor = new Color3(0.3, 0.21, 0.13);
    void trunkMat;
    void leafMat;
    void metalMat;
    void woodMat;
  }

  private buildWater(): void {
    const tex = new DynamicTexture("waterTex", { width: 256, height: 256 }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#12384f";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 7;
    for (let i = 0; i < 260; i++) {
      seed = (seed * 49979687) % 4294967296;
      const x = (seed / 4294967296) * 256;
      seed = (seed * 49979687) % 4294967296;
      const y = (seed / 4294967296) * 256;
      ctx.strokeStyle = "rgba(200,235,255,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 12, y - 4, x + 26, y);
      ctx.stroke();
    }
    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = 24;
    tex.vScale = 24;

    const mesh = MeshBuilder.CreateGround(
      "water",
      { width: WORLD_SIZE * 1.4, height: WORLD_SIZE * 1.4, subdivisions: 2 },
      this.scene,
    );
    mesh.position.y = -1.15;
    mesh.isPickable = false;

    const mat = new PBRMaterial("waterMat", this.scene);
    mat.albedoTexture = tex;
    mat.albedoColor = new Color3(0.18, 0.42, 0.56);
    mat.metallic = 0.85;
    mat.roughness = 0.16;
    mat.alpha = 0.9;
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.receiveShadows = false;
    this.water = mesh;
    this.waterMat = mat;
  }

  private makeEmissiveMat(name: string, hex: string): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(hex).scale(0.55);
    m.emissiveColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    return m;
  }

  private buildRoads(): void {
    const asphalt = new DynamicTexture("asphalt", { width: 256, height: 256 }, this.scene, true);
    const ctx = asphalt.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#22262c";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 31;
    for (let i = 0; i < 2200; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const x = (seed / 4294967296) * 256;
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const y = (seed / 4294967296) * 256;
      const v = 30 + Math.floor((seed / 4294967296) * 30);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // Lane dashes down the centre.
    ctx.fillStyle = "rgba(226,214,178,0.55)";
    for (let y = 0; y < 256; y += 42) ctx.fillRect(125, y, 5, 22);
    asphalt.update();
    asphalt.wrapU = Texture.WRAP_ADDRESSMODE;
    asphalt.wrapV = Texture.WRAP_ADDRESSMODE;

    const sidewalks = new StandardMaterial("sidewalkMat", this.scene);
    const swTex = new DynamicTexture("sidewalkTex", { width: 128, height: 128 }, this.scene, true);
    const swCtx = swTex.getContext() as CanvasRenderingContext2D;
    swCtx.fillStyle = "#7b7f84";
    swCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 160; i++) {
      const g = 96 + Math.floor(Math.random() * 40);
      swCtx.fillStyle = `rgba(${g},${g},${g + 4},0.35)`;
      swCtx.fillRect(Math.random() * 128, Math.random() * 128, 6, 6);
    }
    swCtx.strokeStyle = "rgba(40,44,48,0.5)";
    swCtx.lineWidth = 1;
    for (let i = 0; i <= 128; i += 32) {
      swCtx.beginPath();
      swCtx.moveTo(i, 0);
      swCtx.lineTo(i, 128);
      swCtx.stroke();
    }
    swTex.update();
    swTex.wrapU = Texture.WRAP_ADDRESSMODE;
    swTex.wrapV = Texture.WRAP_ADDRESSMODE;
    sidewalks.diffuseTexture = swTex;
    sidewalks.specularColor = new Color3(0.03, 0.03, 0.03);
    swTex.uScale = 14;
    swTex.vScale = 14;

    const makeRoadMat = (uScale: number, vScale: number) => {
      const mat = new StandardMaterial("roadMat", this.scene);
      const tex = asphalt.clone();
      tex.uScale = uScale;
      tex.vScale = vScale;
      mat.diffuseTexture = tex;
      mat.specularColor = new Color3(0.05, 0.05, 0.06);
      mat.specularPower = 40;
      return mat;
    };
    this.roadMats.push(makeRoadMat(1, 12), makeRoadMat(1, 12));

    const roadLen = 590;
    const axes = [-120, 0, 120];
    axes.forEach((axis, idx) => {
      const vertical = MeshBuilder.CreateGround(
        `roadV${idx}`,
        { width: METROPOLIS.roadWidth, height: roadLen },
        this.scene,
      );
      vertical.position.set(axis, 0.03, 0);
      vertical.material = this.roadMats[0];
      vertical.receiveShadows = true;
      vertical.isPickable = false;

      const horizontal = MeshBuilder.CreateGround(
        `roadH${idx}`,
        { width: roadLen, height: METROPOLIS.roadWidth },
        this.scene,
      );
      horizontal.position.set(0, 0.035, axis);
      horizontal.material = this.roadMats[1];
      horizontal.receiveShadows = true;
      horizontal.isPickable = false;
    });

    // Perimeter road ring.
    const ringOuter = 300;
    for (const [w, h, x, z] of [
      [ringOuter * 2 + METROPOLIS.roadWidth, METROPOLIS.roadWidth, 0, -ringOuter],
      [ringOuter * 2 + METROPOLIS.roadWidth, METROPOLIS.roadWidth, 0, ringOuter],
      [METROPOLIS.roadWidth, ringOuter * 2, -ringOuter, 0],
      [METROPOLIS.roadWidth, ringOuter * 2, ringOuter, 0],
    ] as const) {
      const strip = MeshBuilder.CreateGround(`ring`, { width: w, height: h }, this.scene);
      strip.position.set(x, 0.03, z);
      strip.material = this.roadMats[0];
      strip.isPickable = false;
    }

    // Painted crossings at the central intersection.
    for (let i = 0; i < 5; i++) {
      const stripe = MeshBuilder.CreateGround(
        `crossing${i}`,
        { width: 0.9, height: 6 },
        this.scene,
      );
      stripe.position.set(-9 + i * 4.4, 0.06, -13);
      stripe.isPickable = false;
      const m = new StandardMaterial("stripeMat", this.scene);
      m.diffuseColor = new Color3(0.85, 0.85, 0.8);
      m.specularColor = Color3.Black();
      m.alpha = 0.8;
      stripe.material = m;
    }
  }

  private facadeFor(style: FacadeStyle): { diffuse: DynamicTexture; emissive: DynamicTexture } {
    const cached = this.facadeCache.get(style);
    if (cached) return cached;

    const size = 256;
    const diffuse = new DynamicTexture(`facade-${style}`, { width: size, height: size }, this.scene, true);
    const emissive = new DynamicTexture(`facadeGlow-${style}`, { width: size, height: size }, this.scene, true);
    const ctx = diffuse.getContext() as CanvasRenderingContext2D;
    const ectx = emissive.getContext() as CanvasRenderingContext2D;

    const palettes: Record<FacadeStyle, { wall: string; panel: string; frame: string; lit: string }> = {
      glass: { wall: "#1d2a34", panel: "#33556b", frame: "#16212a", lit: "#ffd7a1" },
      concrete: { wall: "#4c5057", panel: "#242b33", frame: "#3b4046", lit: "#ffca7a" },
      brick: { wall: "#5f4034", panel: "#202226", frame: "#4a3128", lit: "#ffcf8a" },
      shop: { wall: "#3a3f46", panel: "#15202b", frame: "#2b3036", lit: "#ffe0b0" },
    };
    const pal = palettes[style];
    ctx.fillStyle = pal.wall;
    ctx.fillRect(0, 0, size, size);
    ectx.fillStyle = "#000000";
    ectx.fillRect(0, 0, size, size);

    // Wall grain.
    let seed = style.length * 991;
    for (let i = 0; i < 900; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const x = (seed / 4294967296) * size;
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const y = (seed / 4294967296) * size;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      ctx.fillRect(x, y, 3, 3);
    }

    if (style === "brick") {
      ctx.strokeStyle = "rgba(20,14,12,0.35)";
      ctx.lineWidth = 1;
      for (let y = 0; y < size; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    }

    const cols = style === "glass" ? 6 : style === "shop" ? 4 : 5;
    const rows = style === "glass" ? 9 : style === "shop" ? 2 : 6;
    const cellW = size / cols;
    const cellH = size / rows;
    const padX = cellW * (style === "glass" ? 0.1 : 0.2);
    const padY = cellH * (style === "glass" ? 0.12 : 0.24);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + padX;
        const y = r * cellH + padY;
        const w = cellW - padX * 2;
        const h = cellH - padY * 2;
        ctx.fillStyle = pal.frame;
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        ctx.fillStyle = pal.panel;
        ctx.fillRect(x, y, w, h);
        // Glass sheen.
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, "rgba(180,215,240,0.20)");
        grad.addColorStop(0.5, "rgba(180,215,240,0.02)");
        grad.addColorStop(1, "rgba(255,255,255,0.10)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        if (Math.random() < 0.29) {
          ectx.fillStyle = pal.lit;
          ectx.fillRect(x, y, w, h);
          ectx.fillStyle = "rgba(0,0,0,0.28)";
          ectx.fillRect(x + w * 0.45, y, w * 0.1, h);
        }
      }
    }

    if (style === "shop") {
      // Ground-floor shopfront.
      ctx.fillStyle = "#14191f";
      ctx.fillRect(6, size * 0.58, size - 12, size * 0.4);
      ctx.fillStyle = "rgba(255,222,170,0.5)";
      ctx.fillRect(12, size * 0.63, size - 24, size * 0.31);
      ectx.fillStyle = "#ffd9a0";
      ectx.fillRect(12, size * 0.63, size - 24, size * 0.31);
      ctx.fillStyle = "#b4472f";
      ctx.fillRect(0, size * 0.52, size, 8);
    }

    diffuse.update();
    emissive.update();
    for (const t of [diffuse, emissive]) {
      t.wrapU = Texture.WRAP_ADDRESSMODE;
      t.wrapV = Texture.WRAP_ADDRESSMODE;
    }
    const entry = { diffuse, emissive };
    this.facadeCache.set(style, entry);
    return entry;
  }

  private buildBlock(block: BlockSpec): void {
    const root = new TransformNode(`block_${block.x}_${block.z}`, this.scene);
    root.position.set(block.x, 0, block.z);
    const group: BlockGroup = { center: new Vector3(block.x, 0, block.z), root, enabled: true };
    this.groups.push(group);

    const sidewalk = MeshBuilder.CreateBox(
      "blockSidewalk",
      { width: METROPOLIS.blockSize, height: 0.18, depth: METROPOLIS.blockSize },
      this.scene,
    );
    sidewalk.position.set(0, 0.09, 0);
    sidewalk.parent = root;
    sidewalk.isPickable = false;
    const swMat = this.scene.getMaterialByName("sidewalkMat");
    if (swMat) sidewalk.material = swMat;
    sidewalk.receiveShadows = true;

    const rng = mulberry32(Math.abs(block.x * 31 + block.z * 17) + 5);

    if (block.kind === "plaza") {
      this.buildPlaza(root, rng);
    } else if (block.kind === "park") {
      this.buildPark(root, rng);
    } else if (block.kind === "home") {
      this.buildResidences(root);
    } else {
      const slots = [
        [-25, -25],
        [25, -25],
        [-25, 25],
        [25, 25],
      ] as const;
      const count = block.tall ? 3 : 2 + Math.floor(rng() * 2);
      const chosen = [...slots].sort(() => rng() - 0.5).slice(0, count);
      for (const [sx, sz] of chosen) {
        const style: FacadeStyle =
          block.tall && rng() > 0.35
            ? "glass"
            : rng() > 0.6
              ? "concrete"
              : rng() > 0.45
                ? "brick"
                : "shop";
        const baseHeight = block.tall ? 34 + rng() * 34 : 13 + rng() * 22;
        const height = style === "shop" ? 7 + rng() * 3 : baseHeight;
        const width = 20 + rng() * 9;
        const depth = 20 + rng() * 9;
        this.addBuilding(root, block.x + sx, block.z + sz, width, depth, height, style, rng);
      }
    }

    // Street furniture on every block edge.
    for (let i = 0; i < 3; i++) {
      const t = -40 + i * 40;
      this.addLamp(root, t, -46);
      this.addLamp(root, -46, t);
    }
    for (let i = 0; i < 4; i++) {
      this.addTree(root, -44 + rng() * 88, 42 + rng() * 6, 0.8 + rng() * 0.5);
    }
  }

  private addBuilding(
    parent: TransformNode,
    worldX: number,
    worldZ: number,
    width: number,
    depth: number,
    height: number,
    style: FacadeStyle,
    rng: () => number,
  ): void {
    const baseY = 0.18;
    const mesh = MeshBuilder.CreateBox(
      `building_${style}`,
      { width, height, depth },
      this.scene,
    );
    mesh.parent = parent;
    mesh.position.set(worldX - parent.position.x, baseY + height / 2, worldZ - parent.position.z);
    mesh.receiveShadows = true;
    mesh.isPickable = false;

    const facades = this.facadeFor(style);
    const diffuse = facades.diffuse.clone();
    const emissive = facades.emissive.clone();
    const uScale = Math.max(1, Math.round(width / 16));
    const vScale = Math.max(1, Math.round(height / 13));
    for (const tex of [diffuse, emissive]) {
      tex.uScale = uScale;
      tex.vScale = vScale;
    }
    const mat = new StandardMaterial(`bmat_${style}`, this.scene);
    mat.diffuseTexture = diffuse;
    mat.emissiveTexture = emissive;
    mat.emissiveColor = new Color3(this.night, this.night * 0.92, this.night * 0.78);
    mat.specularColor =
      style === "glass" ? new Color3(0.35, 0.4, 0.45) : new Color3(0.06, 0.06, 0.06);
    mat.specularPower = style === "glass" ? 90 : 24;
    mesh.material = mat;
    this.windowMats.push(mat);

    // Roof lip + rooftop clutter.
    const lip = MeshBuilder.CreateBox("roofLip", { width: width + 0.7, height: 0.5, depth: depth + 0.7 }, this.scene);
    lip.parent = parent;
    lip.position.set(mesh.position.x, baseY + height + 0.25, mesh.position.z);
    lip.material = mat;
    lip.receiveShadows = true;
    lip.isPickable = false;

    if (height > 20) {
      const units = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < units; i++) {
        const unit = MeshBuilder.CreateBox(
          "roofUnit",
          { width: 2 + rng() * 3, height: 1 + rng() * 1.4, depth: 2 + rng() * 3 },
          this.scene,
        );
        unit.parent = parent;
        unit.position.set(
          mesh.position.x + (rng() - 0.5) * (width - 8),
          baseY + height + 0.5 + 0.6,
          mesh.position.z + (rng() - 0.5) * (depth - 8),
        );
        unit.material = mat;
        unit.receiveShadows = true;
        unit.isPickable = false;
      }
      // Aircraft warning light on the tallest towers.
      if (height > 48) {
        const beacon = MeshBuilder.CreateSphere("beacon", { diameter: 0.7, segments: 6 }, this.scene);
        beacon.parent = parent;
        beacon.position.set(mesh.position.x, baseY + height + 2.4, mesh.position.z);
        beacon.material = this.makeEmissiveMat("beaconMat", "#ff5b4a");
        beacon.isPickable = false;
      }
    }

    this.shadow?.addShadowCaster(mesh);
    this.addCollider(
      worldX - width / 2,
      worldX + width / 2,
      worldZ - depth / 2,
      worldZ + depth / 2,
      0,
      baseY + height,
    );
  }

  private buildResidences(root: TransformNode): void {
    // The enterable building. Deliberately lower and warmer than the towers.
    const width = 34;
    const depth = 26;
    const height = 24;
    const centerX = -60;
    const centerZ = -77;
    const mesh = MeshBuilder.CreateBox("skylineResidences", { width, height, depth }, this.scene);
    mesh.parent = root;
    mesh.position.set(0, 0.18 + height / 2, centerZ - root.position.z);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    const facades = this.facadeFor("brick");
    const mat = new StandardMaterial("residencesMat", this.scene);
    const dTex = facades.diffuse.clone();
    dTex.uScale = 3;
    dTex.vScale = 3;
    mat.diffuseTexture = dTex;
    const eTex = facades.emissive.clone();
    eTex.uScale = 3;
    eTex.vScale = 3;
    mat.emissiveTexture = eTex;
    mat.emissiveColor = new Color3(this.night, this.night * 0.9, this.night * 0.7);
    mesh.material = mat;
    this.windowMats.push(mat);
    this.shadow?.addShadowCaster(mesh);
    this.addCollider(
      centerX - width / 2,
      centerX + width / 2,
      centerZ - depth / 2,
      centerZ + depth / 2,
      0,
      height,
    );

    // Entrance canopy, doors and a warm sign.
    const canopy = MeshBuilder.CreateBox("canopy", { width: 9, height: 0.4, depth: 3.4 }, this.scene);
    canopy.parent = root;
    canopy.position.set(0, 4.2, -62.4);
    canopy.material = mat;
    canopy.isPickable = false;

    const door = MeshBuilder.CreateBox("lobbyDoor", { width: 3.4, height: 3.5, depth: 0.25 }, this.scene);
    door.parent = root;
    door.position.set(0, 1.95, -63.85);
    door.material = this.makeEmissiveMat("lobbyGlass", "#8fd8ff");
    (door.material as StandardMaterial).emissiveColor = new Color3(0.5, 0.72, 0.85);

    const sign = MeshBuilder.CreatePlane("residenceSign", { width: 8, height: 1.4 }, this.scene);
    sign.parent = root;
    sign.position.set(0, 5.4, -63.7);
    sign.rotation.y = Math.PI;
    const signMat = new StandardMaterial("signMat", this.scene);
    const signTex = new DynamicTexture("signTex", { width: 512, height: 96 }, this.scene, true);
    const sctx = signTex.getContext() as CanvasRenderingContext2D;
    sctx.fillStyle = "#0a1017";
    sctx.fillRect(0, 0, 512, 96);
    sctx.fillStyle = "#f2b544";
    sctx.font = "bold 40px Inter, sans-serif";
    sctx.textAlign = "center";
    sctx.fillText("SKYLINE RESIDENCES", 256, 60);
    signTex.update();
    signMat.diffuseTexture = signTex;
    signMat.emissiveTexture = signTex;
    signMat.emissiveColor = new Color3(0.95, 0.72, 0.28);
    signMat.specularColor = Color3.Black();
    signMat.backFaceCulling = false;
    sign.material = signMat;
    sign.isPickable = false;

    this.interactables.push({
      id: "home-door",
      kind: "door",
      label: "Enter Skyline Residences",
      position: new Vector3(METROPOLIS.homeDoor.x, 0, METROPOLIS.homeDoor.z + 0.6),
      radius: 3.2,
      interior: false,
    });
  }

  private buildPlaza(root: TransformNode, rng: () => number): void {
    const stone = new StandardMaterial("plazaStone", this.scene);
    const tex = new DynamicTexture("plazaTex", { width: 128, height: 128 }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#8b8578";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(50,48,42,0.4)";
    for (let i = 0; i <= 128; i += 21) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
    }
    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    stone.diffuseTexture = tex;
    stone.specularColor = new Color3(0.04, 0.04, 0.04);
    tex.uScale = 8;
    tex.vScale = 8;

    const paving = MeshBuilder.CreateBox("plazaPaving", { width: 82, height: 0.1, depth: 82 }, this.scene);
    paving.parent = root;
    paving.position.y = 0.24;
    paving.material = stone;
    paving.receiveShadows = true;
    paving.isPickable = false;

    // Fountain.
    const basin = MeshBuilder.CreateCylinder("fountainBasin", { height: 0.9, diameter: 11, tessellation: 24 }, this.scene);
    basin.parent = root;
    basin.position.set(0, 0.7, 0);
    const stoneMat = new StandardMaterial("basinMat", this.scene);
    stoneMat.diffuseColor = new Color3(0.55, 0.53, 0.48);
    basin.material = stoneMat;
    basin.receiveShadows = true;
    basin.isPickable = false;

    const water = MeshBuilder.CreateCylinder("fountainWater", { height: 0.1, diameter: 9.8, tessellation: 24 }, this.scene);
    water.parent = root;
    water.position.set(0, 1.05, 0);
    const waterMat = new StandardMaterial("fountainWaterMat", this.scene);
    waterMat.diffuseColor = new Color3(0.25, 0.55, 0.66);
    waterMat.emissiveColor = new Color3(0.06, 0.16, 0.2);
    waterMat.alpha = 0.85;
    water.material = waterMat;
    water.isPickable = false;

    const column = MeshBuilder.CreateCylinder("fountainColumn", { height: 3.4, diameter: 1.5, tessellation: 16 }, this.scene);
    column.parent = root;
    column.position.set(0, 2.5, 0);
    column.material = stoneMat;
    column.isPickable = false;
    this.addCollider(54.5, 65.5, -65.5, -54.5, 0, 4.5);

    // Plaza colonnade.
    const pillarMat = new StandardMaterial("pillarMat", this.scene);
    pillarMat.diffuseColor = new Color3(0.66, 0.64, 0.58);
    for (let i = 0; i < 4; i++) {
      const pillar = MeshBuilder.CreateCylinder("pillar", { height: 8, diameter: 1.6, tessellation: 12 }, this.scene);
      pillar.parent = root;
      pillar.position.set(-36 + i * 24, 4.2, -40);
      pillar.material = pillarMat;
      pillar.receiveShadows = true;
      pillar.isPickable = false;
      this.shadow?.addShadowCaster(pillar);
    }

    // Market kiosk.
    const kiosk = MeshBuilder.CreateBox("kiosk", { width: 6, height: 3, depth: 4 }, this.scene);
    kiosk.parent = root;
    kiosk.position.set(-14, 1.7, -26);
    kiosk.material = this.makeEmissiveMat("kioskMat", "#d9a35c");
    (kiosk.material as StandardMaterial).emissiveColor = new Color3(0.24, 0.15, 0.05);
    kiosk.isPickable = false;
    this.addCollider(43, 49, -88, -84, 0, 3.5);

    for (let i = 0; i < 6; i++) {
      this.addBench(root, -28 + i * 11, 30);
      this.addTree(root, -38 + i * 15, 34 + rng() * 4, 1 + rng() * 0.3);
    }

    const plazaLight = new PointLight("plazaLight", new Vector3(0, 9, 0), this.scene);
    plazaLight.parent = root;
    plazaLight.diffuse = new Color3(1, 0.82, 0.58);
    plazaLight.intensity = 0.55;
    plazaLight.range = 48;
  }

  private buildPark(root: TransformNode, rng: () => number): void {
    const grassMat = new StandardMaterial("parkGrass", this.scene);
    grassMat.diffuseColor = new Color3(0.18, 0.27, 0.15);
    grassMat.specularColor = Color3.Black();
    const lawn = MeshBuilder.CreateGround("lawn", { width: 86, height: 86 }, this.scene);
    lawn.parent = root;
    lawn.position.y = 0.2;
    lawn.material = grassMat;
    lawn.receiveShadows = true;
    lawn.isPickable = false;

    const pathMat = new StandardMaterial("pathMat", this.scene);
    pathMat.diffuseColor = new Color3(0.45, 0.4, 0.32);
    const path = MeshBuilder.CreateGround("parkPath", { width: 3.4, height: 84 }, this.scene);
    path.parent = root;
    path.position.y = 0.23;
    path.material = pathMat;
    path.isPickable = false;

    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const r = 8 + rng() * 32;
      this.addTree(root, Math.cos(a) * r, Math.sin(a) * r, 0.9 + rng() * 0.7);
    }
    for (let i = 0; i < 4; i++) {
      this.addBench(root, -20 + i * 13, -8 + (i % 2) * 20);
    }
    const fountain = MeshBuilder.CreateCylinder("parkFountain", { height: 0.7, diameter: 7, tessellation: 20 }, this.scene);
    fountain.parent = root;
    fountain.position.set(0, 0.55, 0);
    fountain.material = pathMat;
    fountain.isPickable = false;
    this.addCollider(-63.6, -56.4, -63.6, -56.4, 0, 1.2);
  }

  private addTree(parent: TransformNode, x: number, z: number, scale: number): void {
    const trunk = MeshBuilder.CreateCylinder("trunk", { height: 3.4 * scale, diameter: 0.5 * scale, tessellation: 6 }, this.scene);
    trunk.parent = parent;
    trunk.position.set(x, 1.7 * scale, z);
    const trunkMat = this.scene.getMaterialByName("trunkMat");
    if (trunkMat) trunk.material = trunkMat;
    trunk.isPickable = false;
    trunk.receiveShadows = true;

    const foliage = MeshBuilder.CreateSphere("foliage", { diameter: 5 * scale, segments: 8 }, this.scene);
    foliage.parent = parent;
    foliage.position.set(x, 4.6 * scale, z);
    foliage.scaling.y = 0.92;
    const leafMat = this.scene.getMaterialByName("leafMat");
    if (leafMat) foliage.material = leafMat;
    foliage.receiveShadows = true;
    foliage.isPickable = false;
    this.shadow?.addShadowCaster(foliage);
  }

  private addLamp(parent: TransformNode, x: number, z: number): void {
    const pole = MeshBuilder.CreateCylinder("lampPole", { height: 6.5, diameter: 0.22, tessellation: 6 }, this.scene);
    pole.parent = parent;
    pole.position.set(x, 3.4, z);
    const metalMat = this.scene.getMaterialByName("metalMat");
    if (metalMat) pole.material = metalMat;
    pole.isPickable = false;

    const head = MeshBuilder.CreateBox("lampHead", { width: 0.6, height: 0.22, depth: 1.6 }, this.scene);
    head.parent = parent;
    head.position.set(x, 6.7, z + 0.6);
    const lampMat = new StandardMaterial("lampMat", this.scene);
    lampMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
    lampMat.emissiveColor = new Color3(0.2, 0.16, 0.09);
    head.material = lampMat;
    head.isPickable = false;
    this.streetLampMats.push(lampMat);
  }

  private addBench(parent: TransformNode, x: number, z: number): void {
    const seat = MeshBuilder.CreateBox("bench", { width: 3, height: 0.18, depth: 0.7 }, this.scene);
    seat.parent = parent;
    seat.position.set(x, 0.62, z);
    const woodMat = this.scene.getMaterialByName("woodMat");
    if (woodMat) seat.material = woodMat;
    seat.receiveShadows = true;
    seat.isPickable = false;
    const back = MeshBuilder.CreateBox("benchBack", { width: 3, height: 0.7, depth: 0.12 }, this.scene);
    back.parent = parent;
    back.position.set(x, 0.95, z - 0.32);
    if (woodMat) back.material = woodMat;
    back.isPickable = false;
  }

  private buildOuterWorld(): void {
    // Distant skyline silhouettes just outside the playable district.
    const rng = mulberry32(4242);
    const silhouetteMat = new StandardMaterial("silhouetteMat", this.scene);
    silhouetteMat.diffuseColor = new Color3(0.1, 0.13, 0.17);
    silhouetteMat.specularColor = Color3.Black();
    for (let i = 0; i < 44; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = 420 + rng() * 380;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const h = 14 + rng() * 60;
      const w = 18 + rng() * 26;
      const box = MeshBuilder.CreateBox("distantBlock", { width: w, height: h, depth: w }, this.scene);
      box.position.set(x, this.terrain.heightAt(x, z) + h / 2, z);
      box.material = silhouetteMat;
      box.isPickable = false;
      box.receiveShadows = false;
    }

    // Harbour edge: a low sea wall and cargo cranes to the south.
    const wallMat = new StandardMaterial("seawallMat", this.scene);
    wallMat.diffuseColor = new Color3(0.32, 0.33, 0.31);
    const wall = MeshBuilder.CreateBox("seawall", { width: 520, height: 2.4, depth: 6 }, this.scene);
    wall.position.set(0, 0.3, 205);
    wall.material = wallMat;
    wall.isPickable = false;
    wall.receiveShadows = true;

    for (let i = 0; i < 3; i++) {
      const x = -120 + i * 120;
      const craneMat = new StandardMaterial("craneMat", this.scene);
      craneMat.diffuseColor = new Color3(0.7, 0.26, 0.16);
      const leg = MeshBuilder.CreateBox("craneLeg", { width: 1.4, height: 26, depth: 1.4 }, this.scene);
      leg.position.set(x, 13, 232);
      leg.material = craneMat;
      const arm = MeshBuilder.CreateBox("craneArm", { width: 1.2, height: 1.2, depth: 26 }, this.scene);
      arm.position.set(x, 25, 220);
      arm.material = craneMat;
      leg.isPickable = false;
      arm.isPickable = false;
    }

    // A ribbon of highway leaving the district (future city connection).
    const highway = MeshBuilder.CreateGround("highway", { width: 26, height: 900 }, this.scene);
    highway.position.set(-330, 0.02, 0);
    highway.rotation.y = Math.PI / 2;
    highway.material = this.roadMats[0];
    highway.isPickable = false;

    // Street lamps outside the blocks (instanced-style repeated placement).
    for (let i = 0; i < 10; i++) {
      const z = -280 + i * 60;
      const lampRoot = new TransformNode("outerLamp", this.scene);
      lampRoot.position.set(0, 0, 0);
      this.addLamp(lampRoot, 8, z);
      this.addLamp(lampRoot, -8, z);
    }
  }

  private buildInterior(): void {
    const floorMat = new StandardMaterial("intFloor", this.scene);
    const tex = new DynamicTexture("woodFloor", { width: 256, height: 256 }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#4a3627";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`;
      ctx.fillRect(0, y, 256, 2);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(255,220,180,${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 22, 1);
    }
    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMat.diffuseTexture = tex;
    tex.uScale = 4;
    tex.vScale = 4;
    floorMat.specularColor = new Color3(0.08, 0.07, 0.06);

    const floor = MeshBuilder.CreateBox("intFloor", { width: 20, height: 0.3, depth: 16 }, this.scene);
    floor.parent = this.interiorRoot;
    floor.position.set(0, -0.15, 0);
    floor.material = floorMat;
    floor.receiveShadows = true;

    const wallMat = new StandardMaterial("intWall", this.scene);
    wallMat.diffuseColor = new Color3(0.55, 0.52, 0.47);
    wallMat.specularColor = Color3.Black();
    const ceilMat = new StandardMaterial("intCeil", this.scene);
    ceilMat.diffuseColor = new Color3(0.32, 0.31, 0.3);

    const wall = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: StandardMaterial,
    ) => {
      const m = MeshBuilder.CreateBox("intWall", { width: w, height: h, depth: d }, this.scene);
      m.parent = this.interiorRoot;
      m.position.set(x, y, z);
      m.material = mat;
      m.receiveShadows = true;
      return m;
    };

    wall(20, 3.6, 0.3, 0, 1.8, -8, wallMat);
    wall(0.3, 3.6, 16, -10, 1.8, 0, wallMat);
    wall(0.3, 3.6, 16, 10, 1.8, 0, wallMat);
    // Front wall with a doorway gap.
    wall(8.4, 3.6, 0.3, -5.8, 1.8, 8, wallMat);
    wall(8.4, 3.6, 0.3, 5.8, 1.8, 8, wallMat);
    wall(3.2, 1.1, 0.3, 0, 2.9, 8, wallMat);
    wall(20, 0.3, 16, 0, 3.65, 0, ceilMat);

    this.addInteriorColliders();

    // Bed.
    const bedMat = new StandardMaterial("bedMat", this.scene);
    bedMat.diffuseColor = new Color3(0.16, 0.2, 0.28);
    const bed = MeshBuilder.CreateBox("bed", { width: 3.4, height: 0.6, depth: 5.2 }, this.scene);
    bed.parent = this.interiorRoot;
    bed.position.set(-6.6, 0.4, -4.2);
    bed.material = bedMat;
    const pillow = MeshBuilder.CreateBox("pillow", { width: 2.4, height: 0.28, depth: 1.1 }, this.scene);
    pillow.parent = this.interiorRoot;
    pillow.position.set(-6.6, 0.82, -6.1);
    pillow.material = new StandardMaterial("pillowMat", this.scene);
    (pillow.material as StandardMaterial).diffuseColor = new Color3(0.8, 0.78, 0.72);

    // Wardrobe.
    const wardrobe = MeshBuilder.CreateBox("wardrobe", { width: 3.6, height: 2.8, depth: 1.1 }, this.scene);
    wardrobe.parent = this.interiorRoot;
    wardrobe.position.set(-6.6, 1.55, 5.2);
    wardrobe.material = new StandardMaterial("wardrobeMat", this.scene);
    (wardrobe.material as StandardMaterial).diffuseColor = new Color3(0.24, 0.17, 0.12);

    // Desk + computer.
    const desk = MeshBuilder.CreateBox("desk", { width: 4, height: 0.18, depth: 2 }, this.scene);
    desk.parent = this.interiorRoot;
    desk.position.set(6.4, 0.9, -5.6);
    desk.material = new StandardMaterial("deskMat", this.scene);
    (desk.material as StandardMaterial).diffuseColor = new Color3(0.22, 0.16, 0.11);
    for (const dx of [-1.7, 1.7]) {
      const leg = MeshBuilder.CreateBox("deskLeg", { width: 0.16, height: 0.9, depth: 0.16 }, this.scene);
      leg.parent = this.interiorRoot;
      leg.position.set(6.4 + dx, 0.45, -5.6);
      leg.material = desk.material;
    }
    const screen = MeshBuilder.CreateBox("screen", { width: 2, height: 1.2, depth: 0.12 }, this.scene);
    screen.parent = this.interiorRoot;
    screen.position.set(6.4, 1.65, -6.2);
    const screenMat = new StandardMaterial("screenMat", this.scene);
    const screenTex = new DynamicTexture("screenTex", { width: 512, height: 320 }, this.scene, true);
    const sctx = screenTex.getContext() as CanvasRenderingContext2D;
    sctx.fillStyle = "#07131c";
    sctx.fillRect(0, 0, 512, 320);
    sctx.fillStyle = "#59d7ff";
    sctx.font = "bold 26px monospace";
    sctx.fillText("NATION NET", 26, 48);
    sctx.font = "16px monospace";
    sctx.fillStyle = "#9fd7e8";
    sctx.fillText("> welcome home, resident", 26, 96);
    sctx.fillText("> 6 cities linked · 1 online", 26, 124);
    sctx.fillText("> account balance: live", 26, 152);
    sctx.fillStyle = "#f2b544";
    sctx.fillText("> district: HARBORVIEW", 26, 200);
    screenTex.update();
    screenMat.emissiveTexture = screenTex;
    screenMat.emissiveColor = new Color3(0.85, 0.9, 1);
    screenMat.diffuseColor = Color3.Black();
    screen.material = screenMat;

    // Rug and plant for warmth.
    const rug = MeshBuilder.CreateGround("rug", { width: 7, height: 5 }, this.scene);
    rug.parent = this.interiorRoot;
    rug.position.set(0, 0.02, 1);
    const rugMat = new StandardMaterial("rugMat", this.scene);
    rugMat.diffuseColor = new Color3(0.26, 0.11, 0.11);
    rug.material = rugMat;
    rug.isPickable = false;

    const plantPot = MeshBuilder.CreateCylinder("plantPot", { height: 0.7, diameter: 0.8, tessellation: 10 }, this.scene);
    plantPot.parent = this.interiorRoot;
    plantPot.position.set(8.4, 0.35, 6.4);
    plantPot.material = new StandardMaterial("potMat", this.scene);
    (plantPot.material as StandardMaterial).diffuseColor = new Color3(0.3, 0.2, 0.16);
    const plant = MeshBuilder.CreateSphere("plant", { diameter: 1.6, segments: 6 }, this.scene);
    plant.parent = this.interiorRoot;
    plant.position.set(8.4, 1.4, 6.4);
    plant.material = new StandardMaterial("plantMat", this.scene);
    (plant.material as StandardMaterial).diffuseColor = new Color3(0.15, 0.3, 0.17);

    // Exit door marker.
    const exitDoor = MeshBuilder.CreateBox("exitDoor", { width: 3.2, height: 3.2, depth: 0.16 }, this.scene);
    exitDoor.parent = this.interiorRoot;
    exitDoor.position.set(0, 1.6, 8.15);
    exitDoor.material = this.makeEmissiveMat("exitDoorMat", "#59d7ff");
    (exitDoor.material as StandardMaterial).emissiveColor = new Color3(0.15, 0.35, 0.45);

    const light = new PointLight("intLight", new Vector3(0, 3.2, 0), this.scene);
    light.parent = this.interiorRoot;
    light.diffuse = new Color3(1, 0.86, 0.68);
    light.intensity = 0.85;
    light.range = 22;

    const windowPane = MeshBuilder.CreatePlane("intWindow", { width: 6, height: 2 }, this.scene);
    windowPane.parent = this.interiorRoot;
    windowPane.position.set(0, 2.2, -7.83);
    const windowMat = new StandardMaterial("intWindowMat", this.scene);
    windowMat.diffuseColor = new Color3(0.18, 0.35, 0.48);
    windowMat.emissiveColor = new Color3(0.28, 0.42, 0.55);
    windowPane.material = windowMat;

    this.interactables.push(
      {
        id: "bed",
        kind: "bed",
        label: "Sleep",
        position: new Vector3(-6.6, INTERIOR_Y, -1.4),
        radius: 2.4,
        interior: true,
      },
      {
        id: "wardrobe",
        kind: "wardrobe",
        label: "Wardrobe",
        position: new Vector3(-6.6, INTERIOR_Y, 6.1),
        radius: 2.4,
        interior: true,
      },
      {
        id: "computer",
        kind: "computer",
        label: "Use computer",
        position: new Vector3(6.4, INTERIOR_Y, -4.2),
        radius: 2.6,
        interior: true,
      },
      {
        id: "exit-door",
        kind: "exit",
        label: "Leave apartment",
        position: new Vector3(0, INTERIOR_Y, 7.4),
        radius: 2.4,
        interior: true,
      },
    );
  }

  private addInteriorColliders(): void {
    const y0 = INTERIOR_Y - 0.5;
    const y1 = INTERIOR_Y + 3.8;
    const add = (minX: number, maxX: number, minZ: number, maxZ: number) =>
      this.addCollider(minX, maxX, minZ, maxZ, y0, y1);

    add(-10.2, 10.2, -8.2, -7.8); // back wall
    add(-10.2, -9.8, -8.2, 8.2); // left
    add(9.8, 10.2, -8.2, 8.2); // right
    add(-10.2, -1.6, 7.8, 8.2); // front left
    add(1.6, 10.2, 7.8, 8.2); // front right
    add(-8.4, -4.8, -6.9, -1.5); // bed
    add(-8.5, -4.7, 4.6, 5.8); // wardrobe
    add(4.3, 8.5, -6.7, -4.5); // desk
  }

  /* ---------------------------------------------------------------- */
  /* Collision + streaming                                              */
  /* ---------------------------------------------------------------- */

  private addCollider(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    minY: number,
    maxY: number,
  ): void {
    this.colliders.push({ minX, maxX, minZ, maxZ, minY, maxY });
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const c of this.colliders) {
      const x0 = Math.floor(c.minX / this.gridCell);
      const x1 = Math.floor(c.maxX / this.gridCell);
      const z0 = Math.floor(c.minZ / this.gridCell);
      const z1 = Math.floor(c.maxZ / this.gridCell);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = `${x},${z}`;
          let list = this.grid.get(key);
          if (!list) {
            list = [];
            this.grid.set(key, list);
          }
          list.push(c);
        }
      }
    }
  }

  groundHeight(x: number, z: number): number {
    if (this.interiorActive && Math.abs(x) < 10 && Math.abs(z) < 8) return INTERIOR_Y;
    return this.terrain.heightAt(x, z);
  }

  isWater(x: number, z: number): boolean {
    return !this.interiorActive && this.terrain.heightAt(x, z) < -0.5;
  }

  /**
   * Push a circle out of every nearby box collider. Mutates the position.
   * Returns true when a collision was resolved this frame.
   */
  resolveCollisions(position: Vector3, radius: number): boolean {
    const r = radius;
    const cx = Math.floor(position.x / this.gridCell);
    const cz = Math.floor(position.z / this.gridCell);
    let hit = false;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const bucket = this.grid.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const c of bucket) {
          const feet = position.y;
          const head = position.y + 1.75;
          if (head < c.minY + 0.05 || feet > c.maxY - 0.05) continue;
          if (
            position.x > c.minX - r &&
            position.x < c.maxX + r &&
            position.z > c.minZ - r &&
            position.z < c.maxZ + r
          ) {
            const dxL = position.x - (c.minX - r);
            const dxR = c.maxX + r - position.x;
            const dzL = position.z - (c.minZ - r);
            const dzR = c.maxZ + r - position.z;
            const min = Math.min(dxL, dxR, dzL, dzR);
            if (min === dxL) position.x = c.minX - r;
            else if (min === dxR) position.x = c.maxX + r;
            else if (min === dzL) position.z = c.minZ - r;
            else position.z = c.maxZ + r;
            hit = true;
          }
        }
      }
    }
    return hit;
  }

  /** Distance from origin to the first collider along a direction (for cameras). */
  rayDistance(origin: Vector3, direction: Vector3, maxDist: number): number {
    const cx = Math.floor(origin.x / this.gridCell);
    const cz = Math.floor(origin.z / this.gridCell);
    const pad = Math.ceil(maxDist / this.gridCell);
    let best = maxDist;
    for (let gx = cx - pad; gx <= cx + pad; gx++) {
      for (let gz = cz - pad; gz <= cz + pad; gz++) {
        const bucket = this.grid.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const c of bucket) {
          if (origin.y > c.maxY || origin.y < c.minY) continue;
          let tmin = 0;
          let tmax = best;
          const axes: [number, number, number, number][] = [
            [origin.x, direction.x, c.minX, c.maxX],
            [origin.z, direction.z, c.minZ, c.maxZ],
          ];
          let valid = true;
          for (const [o, d, lo, hi] of axes) {
            if (Math.abs(d) < 1e-6) {
              if (o < lo || o > hi) {
                valid = false;
                break;
              }
              continue;
            }
            let t1 = (lo - o) / d;
            let t2 = (hi - o) / d;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) {
              valid = false;
              break;
            }
          }
          if (valid && tmin > 0.05 && tmin < best) best = tmin;
        }
      }
    }
    return best;
  }

  update(dt: number, playerPos: Vector3, renderDistance: number): void {
    // Block streaming.
    for (const group of this.groups) {
      const dist = Vector3.Distance(group.center, new Vector3(playerPos.x, 0, playerPos.z));
      const shouldEnable = !this.interiorActive && dist < renderDistance + 75;
      if (shouldEnable !== group.enabled) {
        group.root.setEnabled(shouldEnable);
        group.enabled = shouldEnable;
      }
    }

    // Water shimmer.
    const tex = this.waterMat.albedoTexture as Texture | null;
    if (tex) {
      tex.uOffset = (tex.uOffset + dt * 0.008) % 1;
      tex.vOffset = (tex.vOffset + dt * 0.012) % 1;
    }
  }

  applyNight(night: number): void {
    this.night = night;
    for (const mat of this.windowMats) {
      mat.emissiveColor.set(night, night * 0.93, night * 0.78);
    }
    for (const mat of this.streetLampMats) {
      mat.emissiveColor.set(0.22 + night * 1.25, 0.16 + night * 0.95, 0.08 + night * 0.5);
    }
    this.doorGlowMat.emissiveColor = new Color3(0.8 + night * 0.3, 0.62, 0.22);
  }

  /* ---------------------------------------------------------------- */
  /* Interactables + interior                                          */
  /* ---------------------------------------------------------------- */

  getInteractable(position: Vector3, maxDist = 2.8): Interactable | null {
    let best: Interactable | null = null;
    let bestDist = maxDist;
    for (const item of this.interactables) {
      if (item.interior !== this.interiorActive) continue;
      const d = Math.hypot(item.position.x - position.x, item.position.z - position.z);
      const dy = Math.abs(item.position.y - position.y);
      if (dy > 2.5) continue;
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  enterInterior(): Vector3 {
    this.interiorActive = true;
    this.interiorRoot.setEnabled(true);
    for (const group of this.groups) {
      group.root.setEnabled(false);
      group.enabled = false;
    }
    return new Vector3(METROPOLIS.homeInterior.x, INTERIOR_Y, METROPOLIS.homeInterior.z);
  }

  exitInterior(): Vector3 {
    this.interiorActive = false;
    this.interiorRoot.setEnabled(false);
    return new Vector3(METROPOLIS.homeDoor.x, 0, METROPOLIS.homeDoor.z + 2.4);
  }

  get spawnPoint(): Vector3 {
    return new Vector3(METROPOLIS.spawn.x, 0, METROPOLIS.spawn.z);
  }

  dispose(): void {
    this.shadow?.dispose();
    this.sky.dispose();
    this.scene.dispose();
  }
}
