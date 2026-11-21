import { Vector3 } from "@babylonjs/core";
import { METROPOLIS } from "../cities/Metropolis";

export interface MinimapState {
  player: Vector3;
  facing: number;
  npcs: Vector3[];
  vehicles: Vector3[];
  missionTarget: Vector3 | null;
  hour: number;
}

/** Round HUD minimap drawn on a 2D canvas, independent from the 3D render loop. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 176;
  private range = 150;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = canvas.clientWidth || 176;
    canvas.width = this.size * dpr;
    canvas.height = this.size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Minimap canvas unavailable");
    this.ctx = ctx;
    this.ctx.scale(dpr, dpr);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = this.canvas.clientWidth || 176;
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  render(state: MinimapState): void {
    const ctx = this.ctx;
    const s = this.ctx.canvas.width;
    const size = this.size;
    const scale = size / (this.range * 2);

    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#0a1119";
    ctx.fillRect(0, 0, size, size);

    const toX = (x: number) => size / 2 + (x - state.player.x) * scale;
    const toY = (z: number) => size / 2 + (z - state.player.z) * scale;

    // City blocks.
    for (const block of METROPOLIS.blocks) {
      const bx = toX(block.x - 50);
      const by = toY(block.z - 50);
      const bw = 100 * scale;
      ctx.fillStyle =
        block.kind === "park" ? "#1c2b1d" : block.kind === "plaza" ? "#3a3327" : "#1b2530";
      ctx.fillRect(bx, by, bw, bw);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bw);
    }

    // Roads.
    ctx.strokeStyle = "#2a3542";
    ctx.lineWidth = Math.max(3, 20 * scale);
    const roadExtent = 300;
    for (const axis of [-120, 0, 120]) {
      ctx.beginPath();
      ctx.moveTo(toX(axis), toY(-roadExtent));
      ctx.lineTo(toX(axis), toY(roadExtent));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-roadExtent), toY(axis));
      ctx.lineTo(toX(roadExtent), toY(axis));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(242,181,68,0.22)";
    ctx.lineWidth = 1;
    for (const axis of [-120, 0, 120]) {
      ctx.beginPath();
      ctx.moveTo(toX(axis), toY(-roadExtent));
      ctx.lineTo(toX(axis), toY(roadExtent));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-roadExtent), toY(axis));
      ctx.lineTo(toX(roadExtent), toY(axis));
      ctx.stroke();
    }

    // Vehicles.
    for (const v of state.vehicles) {
      if (Math.abs(v.x - state.player.x) > this.range || Math.abs(v.z - state.player.z) > this.range) continue;
      ctx.fillStyle = "#59d7ff";
      ctx.fillRect(toX(v.x) - 2, toY(v.z) - 2, 4, 4);
    }

    // NPCs.
    for (const n of state.npcs) {
      if (Math.abs(n.x - state.player.x) > this.range || Math.abs(n.z - state.player.z) > this.range) continue;
      ctx.fillStyle = "#e8eef4";
      ctx.beginPath();
      ctx.arc(toX(n.x), toY(n.z), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mission marker.
    if (state.missionTarget) {
      const mx = toX(state.missionTarget.x);
      const my = toY(state.missionTarget.z);
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.25;
      ctx.strokeStyle = "#f2b544";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 7 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#f2b544";
      ctx.beginPath();
      ctx.arc(mx, my, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow.
    ctx.save();
    ctx.translate(toX(state.player.x), toY(state.player.z));
    ctx.rotate(-state.facing + Math.PI);
    ctx.fillStyle = "#f2b544";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Vignette ring.
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.5);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // Compass letter.
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", size / 2, 12);
    void s;
  }
}
