import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Texture,
  VertexBuffer,
} from "@babylonjs/core";

export const WORLD_SIZE = 2600;
export const INTERIOR_Y = -500;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.0062) * Math.cos(z * 0.0071) * 0.62 +
    Math.sin(x * 0.0143 + 1.7) * Math.cos(z * 0.0119 - 0.8) * 0.28 +
    Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027 + 2.1) * 0.1
  );
}

/**
 * Procedural terrain for the nation. Metropolis sits on a flattened coastal
 * shelf; hills rise as you leave the city and the land drops into a bay to the
 * south-east and a lake basin to the north-west.
 */
export class Terrain {
  readonly heightField: Mesh;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.heightField = this.build();
  }

  heightAt(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const urbanBlend = 1 - smoothstep(330, 470, r);

    // Rolling hills away from the city.
    let h = smoothstep(300, 1100, r) * (16 + noise2(x, z) * 26 + Math.sin(r * 0.006) * 9);

    // Bay / ocean shelf to the south-east.
    const bay = Math.hypot((x - 780) * 0.6, z - 820);
    h -= Math.max(0, 1 - bay / 620) * 26;

    // Lake basin to the north-west (visible water beyond the outskirts).
    const lake = Math.hypot((x + 700) * 0.8, z + 640);
    h -= Math.max(0, 1 - lake / 250) * 24;

    // Keep the playable city flat and readable.
    h *= 1 - urbanBlend;
    return h;
  }

  /** True when the point is under the water plane. */
  isUnderwater(x: number, z: number): boolean {
    return this.heightAt(x, z) < -1.1;
  }

  private build(): Mesh {
    const subdivisions = 168;
    const ground = MeshBuilder.CreateGround(
      "terrain",
      { width: WORLD_SIZE, height: WORLD_SIZE, subdivisions, updatable: true },
      this.scene,
    );

    const positions = ground.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        positions[i + 1] = this.heightAt(x, z);
      }
      ground.setVerticesData(VertexBuffer.PositionKind, positions, true);
      ground.createNormals(true);
    }
    ground.receiveShadows = true;
    ground.isPickable = false;

    const mat = new PBRMaterial("terrainMat", this.scene);
    const albedo = this.makeGroundTexture();
    albedo.uScale = 90;
    albedo.vScale = 90;
    albedo.wrapU = Texture.WRAP_ADDRESSMODE;
    albedo.wrapV = Texture.WRAP_ADDRESSMODE;
    mat.albedoTexture = albedo;
    mat.metallic = 0;
    mat.roughness = 0.96;
    mat.specularIntensity = 0.05;
    mat.usePhysicalLightFalloff = false;
    ground.material = mat;

    ground.freezeWorldMatrix();
    return ground;
  }

  private makeGroundTexture(): DynamicTexture {
    const size = 256;
    const tex = new DynamicTexture("terrainTex", { width: size, height: size }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#2c3329";
    ctx.fillRect(0, 0, size, size);

    // Grass / gravel patches.
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1 + rnd() * 7;
      const g = 38 + Math.floor(rnd() * 26);
      ctx.fillStyle = `rgba(${g - 6},${g + 6},${g - 12},${0.12 + rnd() * 0.22})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dry dirt streaks.
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(90,78,55,${0.05 + rnd() * 0.12})`;
      ctx.lineWidth = 1 + rnd() * 3;
      ctx.beginPath();
      const x = rnd() * size;
      ctx.moveTo(x, rnd() * size);
      ctx.lineTo(x + rnd() * 40 - 20, rnd() * size);
      ctx.stroke();
    }
    tex.update();
    return tex;
  }

  /** Capture-friendly tint of the horizon for the sky system. */
  static horizonColor(night: number): Color3 {
    return Color3.Lerp(new Color3(0.55, 0.68, 0.82), new Color3(0.03, 0.05, 0.09), night);
  }
}
