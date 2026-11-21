import { Scene, Vector3 } from "@babylonjs/core";
import type { NpcSpawn } from "../cities/Metropolis";
import type { World } from "../world/World";
import { Npc } from "./Npc";

/** Owns every citizen, drives their simulation and handles proximity queries. */
export class NPCManager {
  readonly npcs: Npc[] = [];
  officer: Npc | null = null;

  constructor(scene: Scene, world: World, spawns: NpcSpawn[]) {
    for (const spawn of spawns) {
      const npc = new Npc(scene, spawn);
      this.npcs.push(npc);
      if (spawn.officer) this.officer = npc;
      void world;
    }
  }

  update(dt: number, world: World, hour: number, playerPos: Vector3): void {
    for (const npc of this.npcs) npc.update(dt, world, hour, playerPos);
  }

  /** Passive proximity query for prompts — never mutates NPC state. */
  closest(position: Vector3, maxDist = 2.8): Npc | null {
    let best: Npc | null = null;
    let bestDist = maxDist;
    for (const npc of this.npcs) {
      const d = Vector3.Distance(npc.position, position);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  }

  nearest(position: Vector3, maxDist = 2.8): Npc | null {
    const best = this.closest(position, maxDist);
    if (best) {
      best.state = "talk";
      best.faceTo(position);
    }
    return best;
  }

  findById(id: string): Npc | null {
    return this.npcs.find((n) => n.spec.id === id) ?? null;
  }

  endConversation(npc: Npc): void {
    if (npc.state === "talk") npc.state = "idle";
  }

  dispose(): void {
    for (const npc of this.npcs) npc.dispose();
    this.npcs.length = 0;
  }
}
