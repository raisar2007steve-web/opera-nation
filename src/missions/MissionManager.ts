import { Vector3 } from "@babylonjs/core";
import { METROPOLIS, MISSION } from "../cities/Metropolis";
import type { Npc } from "../npcs/Npc";

export type MissionStage = "available" | "go-to-deke" | "return-to-mara" | "complete";

export interface MissionSnapshot {
  stage: MissionStage;
  title: string;
  objectives: { text: string; done: boolean }[];
  hint: string;
  target: Vector3 | null;
}

/**
 * The first playable mission: a courier hand-off across Harborview Plaza.
 * Pure logic — the UI renders whatever snapshot() returns.
 */
export class MissionManager {
  stage: MissionStage = "available";

  get title(): string {
    return MISSION.title;
  }

  accept(): void {
    if (this.stage === "available") this.stage = "go-to-deke";
  }

  deliver(): void {
    if (this.stage === "go-to-deke") this.stage = "return-to-mara";
  }

  turnIn(): boolean {
    if (this.stage !== "return-to-mara") return false;
    this.stage = "complete";
    return true;
  }

  reset(): void {
    this.stage = "available";
  }

  hydrate(stage: MissionStage): void {
    this.stage = stage;
  }

  get active(): boolean {
    return this.stage === "go-to-deke" || this.stage === "return-to-mara";
  }

  get targetId(): string | null {
    if (this.stage === "go-to-deke") return MISSION.target;
    if (this.stage === "return-to-mara") return MISSION.giver;
    return null;
  }

  markerPosition(): Vector3 | null {
    const id = this.targetId;
    if (!id) return null;
    const npc = METROPOLIS.npcs.find((n) => n.id === id);
    if (!npc) return null;
    return new Vector3(npc.x, 0, npc.z);
  }

  /** Dialogue lines when the mission-relevant NPC is engaged. */
  linesFor(npc: Npc): string[] | null {
    if (npc.spec.id === MISSION.giver) {
      if (this.stage === "available") {
        return [
          "You're the new face on the avenue. Good — I need someone with no record in this district.",
          "Deke is holding a courier case by the fountain. Bring it back to me untouched and the money is yours.",
          "Don't open it. Curiosity is expensive around here.",
        ];
      }
      if (this.stage === "go-to-deke") {
        return ["Deke is at the fountain, east side of the square. The clock is running, not the story."];
      }
      if (this.stage === "return-to-mara") {
        return ["That's the case. Untouched — good. Here's your cut.", "Come back when you need real work."];
      }
      return ["We're square. Harborview remembers people who deliver."];
    }
    if (npc.spec.id === MISSION.target) {
      if (this.stage === "go-to-deke") {
        return [
          "Mara sent you? Then you know the drill — sign nothing, say nothing.",
          "Here's the case. It's heavier than it looks. Take the avenue back and don't get creative.",
          "If the police stop you, you're carrying a lunchbox. Understood?",
        ];
      }
      if (this.stage === "return-to-mara") {
        return ["Case is yours now. Walk it back to Mara before the fog rolls in."];
      }
      return ["Nothing for you here, friend. Fountain's free to look at."];
    }
    return null;
  }

  snapshot(): MissionSnapshot {
    if (this.stage === "available") {
      return {
        stage: this.stage,
        title: MISSION.title,
        objectives: [{ text: "Speak to Mara Voss in Harborview Plaza", done: false }],
        hint: MISSION.hint,
        target: null,
      };
    }
    if (this.stage === "go-to-deke") {
      return {
        stage: this.stage,
        title: MISSION.title,
        objectives: [
          { text: "Collect the courier case from Deke", done: false },
          { text: "Return the case to Mara", done: false },
        ],
        hint: "Deke waits by the plaza fountain.",
        target: this.markerPosition(),
      };
    }
    if (this.stage === "return-to-mara") {
      return {
        stage: this.stage,
        title: MISSION.title,
        objectives: [
          { text: "Collect the courier case from Deke", done: true },
          { text: "Return the case to Mara", done: false },
        ],
        hint: "Mara is back at the plaza columns.",
        target: this.markerPosition(),
      };
    }
    return {
      stage: this.stage,
      title: MISSION.title,
      objectives: [
        { text: "Collect the courier case from Deke", done: true },
        { text: "Return the case to Mara", done: true },
      ],
      hint: "Mission complete. More work arrives in the next build stage.",
      target: null,
    };
  }
}
