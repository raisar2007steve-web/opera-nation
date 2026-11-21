import { Vector3 } from "@babylonjs/core";
import type { Npc } from "../npcs/Npc";
import type { Economy } from "../economy/Economy";

export interface PoliceEvents {
  onChange: (level: number) => void;
  onArrest: (fine: number) => void;
}

/**
 * Wanted level + responding officer. Deliberately small for this build: crimes
 * raise heat, the officer closes in and an arrest issues a fine. Pursuit fleets
 * and investigation trees land in the police stage.
 */
export class PoliceSystem {
  wanted = 0;
  private events: PoliceEvents;
  private officer: Npc | null;
  private arrestCooldown = 0;

  constructor(officer: Npc | null, events: PoliceEvents) {
    this.officer = officer;
    this.events = events;
  }

  reportCrime(severity: number): void {
    const next = Math.min(5, this.wanted + Math.max(1, Math.round(severity)));
    if (next === this.wanted) return;
    this.wanted = next;
    this.events.onChange(this.wanted);
    this.officer?.chase(this.officer.home);
  }

  clear(): void {
    if (this.wanted === 0) return;
    this.wanted = 0;
    this.events.onChange(0);
    this.officer?.stopChase();
  }

  update(dt: number, playerPos: Vector3, economy: Economy): void {
    if (this.arrestCooldown > 0) this.arrestCooldown -= dt;
    if (this.wanted <= 0 || !this.officer) return;

    this.officer.chase(playerPos);
    const distance = Vector3.Distance(this.officer.position, playerPos);
    if (distance < 2.6 && this.arrestCooldown <= 0) {
      const fine = Math.min(economy.cash, 120 + this.wanted * 30);
      economy.spend(fine, "Police fine");
      this.arrestCooldown = 8;
      this.clear();
      this.events.onArrest(fine);
    }
  }
}
