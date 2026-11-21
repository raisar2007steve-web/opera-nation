import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

export interface Appearance {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  build: number;
  height: number;
  hairStyle: number;
  backpack: boolean;
  hat: boolean;
  glasses: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: "#c98d63",
  hair: "#241a16",
  shirt: "#2f3b4a",
  pants: "#1d2633",
  shoes: "#10141a",
  build: 1,
  height: 1,
  hairStyle: 0,
  backpack: false,
  hat: false,
  glasses: false,
};

export const SKIN_TONES = ["#f2d3b6", "#e0b48c", "#c98d63", "#9c6644", "#6d452f", "#4a2d21"];
export const HAIR_COLORS = ["#0f0d0c", "#241a16", "#5a3a22", "#8b6236", "#b98a4a", "#7d7f86", "#b6473a"];
export const CLOTHING_COLORS = [
  "#2f3b4a",
  "#7a4a3a",
  "#3f6b57",
  "#8b2f3d",
  "#c9b48a",
  "#1f2937",
  "#c7cbd1",
  "#5a6ea8",
];
export const PANTS_COLORS = ["#1d2633", "#2b2b30", "#3f4a3a", "#5c4a38", "#111318"];
export const SHOE_COLORS = ["#10141a", "#2b2b30", "#6b4f36", "#c7cbd1"];

/**
 * Procedural avatar built from primitives — clearly a placeholder mesh set
 * (no external GLB downloads in this build), but fully rigged for procedural
 * locomotion and outfit colour changes.
 */
export class Avatar {
  readonly root: TransformNode;
  private hips: TransformNode;
  private torso: Mesh;
  private head: Mesh;
  private armL: TransformNode;
  private armR: TransformNode;
  private legL: TransformNode;
  private legR: TransformNode;
  private hairMesh: Mesh;
  private hatMesh: Mesh;
  private glassesMesh: Mesh;
  private backpackMesh: Mesh;
  private torsoMat: StandardMaterial;
  private pantsMat: StandardMaterial;
  private shoeMat: StandardMaterial;
  private skinMat: StandardMaterial;
  private hairMat: StandardMaterial;
  private phase = Math.random() * Math.PI * 2;
  private appearance: Appearance;
  private heightScale: number;

  constructor(scene: Scene, appearance: Appearance = DEFAULT_APPEARANCE) {
    this.appearance = { ...appearance };
    this.heightScale = appearance.height;
    this.root = new TransformNode("avatar", scene);
    this.root.position = Vector3.Zero();

    const std = (name: string, hex: string) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(0.05, 0.05, 0.06);
      m.specularPower = 24;
      return m;
    };

    this.skinMat = std("skin", appearance.skin);
    this.hairMat = std("hair", appearance.hair);
    this.torsoMat = std("shirt", appearance.shirt);
    this.pantsMat = std("pants", appearance.pants);
    this.shoeMat = std("shoes", appearance.shoes);
    const eyeMat = std("eye", "#0b0d10");
    const whiteMat = std("eyeWhite", "#e8eef4");

    const build = appearance.build;
    const torsoW = 0.44 * build;

    this.hips = new TransformNode("hips", scene);
    this.hips.parent = this.root;
    this.hips.position.y = 0.86 * this.heightScale;

    const box = (
      name: string,
      size: { width: number; height: number; depth: number },
      parent: TransformNode,
      y: number,
      mat: StandardMaterial,
      z = 0,
    ) => {
      const m = MeshBuilder.CreateBox(name, size, scene);
      m.parent = parent;
      m.position.y = y;
      m.position.z = z;
      m.material = mat;
      m.receiveShadows = true;
      return m;
    };

    // Legs (pivot at the hip so they can swing).
    this.legL = new TransformNode("legL", scene);
    this.legL.parent = this.hips;
    this.legL.position.x = 0.12 * build;
    box("thighL", { width: 0.18 * build, height: 0.46, depth: 0.19 }, this.legL, -0.23, this.pantsMat);
    box("shinL", { width: 0.16 * build, height: 0.42, depth: 0.17 }, this.legL, -0.62, this.pantsMat);
    box("shoeL", { width: 0.17 * build, height: 0.11, depth: 0.27 }, this.legL, -0.84, this.shoeMat, 0.04);

    this.legR = new TransformNode("legR", scene);
    this.legR.parent = this.hips;
    this.legR.position.x = -0.12 * build;
    box("thighR", { width: 0.18 * build, height: 0.46, depth: 0.19 }, this.legR, -0.23, this.pantsMat);
    box("shinR", { width: 0.16 * build, height: 0.42, depth: 0.17 }, this.legR, -0.62, this.pantsMat);
    box("shoeR", { width: 0.17 * build, height: 0.11, depth: 0.27 }, this.legR, -0.84, this.shoeMat, 0.04);

    // Torso.
    const torsoRoot = new TransformNode("torsoRoot", scene);
    torsoRoot.parent = this.hips;
    this.torso = box(
      "torso",
      { width: torsoW, height: 0.6, depth: 0.26 },
      torsoRoot,
      0.31,
      this.torsoMat,
    );
    this.torso.scaling.x = build;

    // Neck + head.
    const neck = MeshBuilder.CreateCylinder("neck", { height: 0.1, diameter: 0.13 }, scene);
    neck.parent = torsoRoot;
    neck.position.y = 0.63;
    neck.material = this.skinMat;

    this.head = MeshBuilder.CreateSphere("head", { diameter: 0.26, segments: 12 }, scene);
    this.head.parent = torsoRoot;
    this.head.position.y = 0.79;
    this.head.scaling.set(0.92, 1.08, 0.98);
    this.head.material = this.skinMat;

    const nose = MeshBuilder.CreateBox("nose", { width: 0.05, height: 0.05, depth: 0.06 }, scene);
    nose.parent = this.head;
    nose.position.set(0, -0.01, 0.125);
    nose.material = this.skinMat;

    for (const side of [-1, 1]) {
      const white = MeshBuilder.CreateSphere("eyeW", { diameter: 0.062, segments: 6 }, scene);
      white.parent = this.head;
      white.position.set(0.062 * side, 0.035, 0.112);
      white.scaling.z = 0.55;
      white.material = whiteMat;
      const pupil = MeshBuilder.CreateSphere("eyeP", { diameter: 0.034, segments: 6 }, scene);
      pupil.parent = this.head;
      pupil.position.set(0.062 * side, 0.035, 0.14);
      pupil.material = eyeMat;
    }

    // Hair.
    this.hairMesh = MeshBuilder.CreateSphere("hair", { diameter: 0.285, segments: 12 }, scene);
    this.hairMesh.parent = this.head;
    this.hairMesh.material = this.hairMat;
    this.applyHairStyle();

    // Glasses.
    this.glassesMesh = MeshBuilder.CreateTorus("glasses", { diameter: 0.2, thickness: 0.012, tessellation: 24 }, scene);
    this.glassesMesh.parent = this.head;
    this.glassesMesh.position.set(0, 0.03, 0.075);
    this.glassesMesh.rotation.x = Math.PI / 2;
    this.glassesMesh.scaling.z = 0.6;
    this.glassesMesh.material = eyeMat;
    this.glassesMesh.setEnabled(appearance.glasses);

    // Hat.
    this.hatMesh = MeshBuilder.CreateCylinder("hat", { height: 0.09, diameter: 0.3, tessellation: 14 }, scene);
    this.hatMesh.parent = this.head;
    this.hatMesh.position.y = 0.12;
    this.hatMesh.material = this.torsoMat;
    this.hatMesh.setEnabled(appearance.hat);

    // Arms.
    const makeArm = (side: number) => {
      const pivot = new TransformNode(`armPivot${side}`, scene);
      pivot.parent = torsoRoot;
      pivot.position.set(0.27 * build * side, 0.55, 0);
      box("upperArm", { width: 0.13, height: 0.34, depth: 0.15 }, pivot, -0.17, this.torsoMat);
      box("foreArm", { width: 0.12, height: 0.3, depth: 0.14 }, pivot, -0.47, this.skinMat);
      const hand = MeshBuilder.CreateSphere("hand", { diameter: 0.14, segments: 8 }, scene);
      hand.parent = pivot;
      hand.position.y = -0.64;
      hand.scaling.y = 1.1;
      hand.material = this.skinMat;
      return pivot;
    };
    this.armL = makeArm(1);
    this.armR = makeArm(-1);

    // Backpack.
    this.backpackMesh = box(
      "backpack",
      { width: 0.34, height: 0.42, depth: 0.18 },
      torsoRoot,
      0.32,
      this.pantsMat,
      -0.21,
    );
    this.backpackMesh.setEnabled(appearance.backpack);

    this.root.scaling.y = this.heightScale;
  }

  private applyHairStyle(): void {
    const style = this.appearance.hairStyle;
    this.hairMesh.position.y = 0.06;
    this.hairMesh.scaling.set(1.02, 0.72, 1.02);
    if (style === 0) {
      this.hairMesh.position.y = 0.06;
      this.hairMesh.scaling.set(1.03, 0.62, 1.03);
    } else if (style === 1) {
      this.hairMesh.position.set(0, 0.07, -0.02);
      this.hairMesh.scaling.set(1.06, 0.72, 1.1);
    } else if (style === 2) {
      this.hairMesh.position.set(0, 0.03, -0.03);
      this.hairMesh.scaling.set(1.04, 0.94, 1.06);
    } else {
      this.hairMesh.position.y = 0.085;
      this.hairMesh.scaling.set(0.99, 0.42, 0.99);
    }
  }

  setAppearance(next: Appearance): void {
    this.appearance = { ...next };
    this.skinMat.diffuseColor = Color3.FromHexString(next.skin);
    this.hairMat.diffuseColor = Color3.FromHexString(next.hair);
    this.torsoMat.diffuseColor = Color3.FromHexString(next.shirt);
    this.pantsMat.diffuseColor = Color3.FromHexString(next.pants);
    this.shoeMat.diffuseColor = Color3.FromHexString(next.shoes);
    this.torso.scaling.x = next.build;
    this.legL.position.x = 0.12 * next.build;
    this.legR.position.x = -0.12 * next.build;
    this.armL.position.x = 0.27 * next.build;
    this.armR.position.x = -0.27 * next.build;
    this.applyHairStyle();
    this.glassesMesh.setEnabled(next.glasses);
    this.hatMesh.setEnabled(next.hat);
    this.backpackMesh.setEnabled(next.backpack);
    this.heightScale = next.height;
    this.root.scaling.y = next.height;
  }

  get faceDirection(): number {
    return this.root.rotation.y;
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setFacing(radians: number): void {
    this.root.rotation.y = radians;
  }

  /**
   * Procedural locomotion — a real walk/run cycle driven by speed and ground
   * state. No baked animation assets are required for this build.
   */
  animate(dt: number, speed: number, grounded: boolean, sitting = false): void {
    if (sitting) {
      this.hips.position.y = 0.5;
      this.legL.rotation.x = -Math.PI / 2.1;
      this.legR.rotation.x = -Math.PI / 2.1;
      this.armL.rotation.x = -0.2;
      this.armR.rotation.x = -0.2;
      return;
    }
    this.hips.position.y = 0.86 * this.heightScale;

    if (!grounded) {
      const tuck = 0.5;
      this.legL.rotation.x = -tuck;
      this.legR.rotation.x = tuck * 0.7;
      this.armL.rotation.x = -0.9;
      this.armR.rotation.x = -0.9;
      this.armL.rotation.z = 0.1;
      this.armR.rotation.z = -0.1;
      return;
    }

    if (speed > 0.18) {
      const run = Math.min(1, speed / 8);
      this.phase += dt * (4.4 + speed * 1.35);
      const amp = 0.38 + run * 0.55;
      const swing = Math.sin(this.phase);
      this.legL.rotation.x = swing * amp;
      this.legR.rotation.x = -swing * amp;
      this.armL.rotation.x = -swing * amp * 0.82;
      this.armR.rotation.x = swing * amp * 0.82;
      this.armL.rotation.z = 0.06;
      this.armR.rotation.z = -0.06;
      this.hips.position.y = (0.86 + Math.abs(Math.sin(this.phase * 2)) * 0.035) * this.heightScale;
      this.torso.rotation.x = 0.03 + run * 0.09;
      this.torso.rotation.z = Math.sin(this.phase) * 0.03 * run;
    } else {
      this.phase += dt * 1.5;
      const idle = Math.sin(this.phase) * 0.035;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = idle;
      this.armR.rotation.x = -idle;
      this.armL.rotation.z = 0.04;
      this.armR.rotation.z = -0.04;
      this.torso.rotation.x = 0.01;
      this.torso.rotation.z = idle * 0.4;
      this.hips.position.y = (0.86 + idle * 0.1) * this.heightScale;
    }
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}
