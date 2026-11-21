export interface Item {
  id: string;
  name: string;
  tag: string;
  description: string;
  kind: "quest" | "wearable" | "utility";
}

const CATALOG: Record<string, Item> = {
  phone: {
    id: "phone",
    name: "Nation Phone",
    tag: "Utility",
    description: "Maps, messages and the address of your apartment. Battery 61%.",
    kind: "utility",
  },
  keys: {
    id: "keys",
    name: "Skyline Keys",
    tag: "Property",
    description: "Apartment 12B, Skyline Residences. Lobby door on the north side.",
    kind: "utility",
  },
  transit: {
    id: "transit",
    name: "Harbor Transit Card",
    tag: "Utility",
    description: "Load credits at any kiosk. Currently valid for the avenue line.",
    kind: "utility",
  },
  parcel: {
    id: "parcel",
    name: "Courier Case",
    tag: "Mission",
    description: "A sealed case from Deke. Mara wants it back untouched.",
    kind: "quest",
  },
  jacket: {
    id: "jacket",
    name: "Harbour Field Jacket",
    tag: "Wearable",
    description: "Waxed cotton, salt-stained collar. Worn by everyone who works the docks.",
    kind: "wearable",
  },
  formal: {
    id: "formal",
    name: "Metropolis Formal Shirt",
    tag: "Wearable",
    description: "Crisp enough for the financial district, comfortable enough for the plaza.",
    kind: "wearable",
  },
  sport: {
    id: "sport",
    name: "Kestrel Sportswear",
    tag: "Wearable",
    description: "Breathable training kit from the park gym. Smells faintly of chlorine.",
    kind: "wearable",
  },
};

export class Inventory {
  private items: Item[] = [CATALOG.phone, CATALOG.keys, CATALOG.transit, CATALOG.jacket, CATALOG.formal, CATALOG.sport];
  onChange: (items: Item[]) => void = () => {};

  get list(): Item[] {
    return [...this.items];
  }

  has(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  add(id: string): void {
    const item = CATALOG[id];
    if (!item || this.has(id)) return;
    this.items.push(item);
    this.onChange(this.list);
  }

  remove(id: string): void {
    const next = this.items.filter((i) => i.id !== id);
    if (next.length !== this.items.length) {
      this.items = next;
      this.onChange(this.list);
    }
  }

  hydrate(ids: string[]): void {
    const base = [CATALOG.phone, CATALOG.keys, CATALOG.transit, CATALOG.jacket, CATALOG.formal, CATALOG.sport];
    const extra = ids.map((id) => CATALOG[id]).filter((i): i is Item => Boolean(i));
    this.items = [...base, ...extra.filter((e) => !base.some((b) => b.id === e.id))];
    this.onChange(this.list);
  }

  serialize(): string[] {
    return this.items.map((i) => i.id);
  }
}
