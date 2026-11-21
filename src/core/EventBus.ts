type Handler<T> = (payload: T) => void;

/** Minimal typed pub/sub used to keep the render loop and the UI independent. */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      (handler as Handler<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export interface GameEvents {
  money: { cash: number; bank: number };
  wanted: { level: number };
  mission: { title: string; objectives: { text: string; done: boolean }[]; hint?: string };
  missionComplete: { title: string; reward: number };
  clock: { minutes: number };
  location: { name: string };
  prompt: { text: string | null };
  toast: { text: string; tone?: "info" | "good" | "bad" };
  dialogue: { speaker: string; role: string; accent: string; lines: string[]; choices?: { label: string; action: string }[] };
  dialogueClose: Record<string, never>;
  event: { text: string };
}
