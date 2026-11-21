/**
 * Layout data for the first playable city: Metropolis — Harborview District.
 * Coordinates are metres in the shared national world (origin = city centre).
 */

export interface BlockSpec {
  x: number;
  z: number;
  kind: "city" | "plaza" | "park" | "home";
  /** Corner block gets the tallest towers. */
  tall?: boolean;
}

export interface VehicleSpawn {
  id: string;
  model: "kestrel" | "cruiser" | "taxi";
  x: number;
  z: number;
  heading: number;
  owned?: boolean;
}

export interface NpcSpawn {
  id: string;
  name: string;
  role: string;
  x: number;
  z: number;
  accent: string;
  lines: string[];
  route: { x: number; z: number }[];
  missionGiver?: boolean;
  officer?: boolean;
}

export interface Poi {
  name: string;
  x: number;
  z: number;
  kind: "plaza" | "home" | "park" | "garage" | "dock";
}

export const METROPOLIS = {
  city: "Metropolis",
  district: "Harborview",
  blockSize: 100,
  blockCenters: [-180, -60, 60, 180],
  roadWidth: 20,
  spawn: { x: 11, z: 36, heading: Math.PI },
  homeDoor: { x: -60, z: -63.5 },
  homeInterior: { x: 0, z: 3 },
  blocks: [
    { x: -180, z: -180, kind: "city", tall: true },
    { x: -60, z: -180, kind: "city" },
    { x: 60, z: -180, kind: "city", tall: true },
    { x: 180, z: -180, kind: "city" },
    { x: -180, z: -60, kind: "city" },
    { x: -60, z: -60, kind: "home" },
    { x: 60, z: -60, kind: "plaza" },
    { x: 180, z: -60, kind: "city", tall: true },
    { x: -180, z: 60, kind: "city" },
    { x: -60, z: 60, kind: "park" },
    { x: 60, z: 60, kind: "city" },
    { x: 180, z: 60, kind: "city" },
    { x: -180, z: 180, kind: "city" },
    { x: -60, z: 180, kind: "city", tall: true },
    { x: 60, z: 180, kind: "city" },
    { x: 180, z: 180, kind: "city" },
  ] as BlockSpec[],
  vehicleSpawns: [
    { id: "kestrel", model: "kestrel", x: 4, z: 22, heading: Math.PI, owned: true },
    { id: "cruiser", model: "cruiser", x: -4, z: -46, heading: 0 },
    { id: "taxi", model: "taxi", x: 64, z: -8, heading: Math.PI / 2 },
  ] as VehicleSpawn[],
  npcs: [
    {
      id: "mara",
      name: "Mara Voss",
      role: "Fixer · Harborview",
      x: 52,
      z: -48,
      accent: "#f2b544",
      lines: [
        "You're the new face on the avenue. Good — I need someone with no record in this district.",
        "Deke is holding a courier case by the fountain. Bring it back to me untouched and the money is yours.",
        "Don't open it. Curiosity is expensive around here.",
      ],
      route: [
        { x: 52, z: -48 },
        { x: 66, z: -56 },
        { x: 60, z: -44 },
      ],
      missionGiver: true,
    },
    {
      id: "deke",
      name: "Deke Marlow",
      role: "Courier",
      x: 70,
      z: -70,
      accent: "#59d7ff",
      lines: [
        "Mara sent you? Then you know the drill — sign nothing, say nothing.",
        "Here's the case. It's heavier than it looks. Take the avenue back and don't get creative.",
        "If the police stop you, you're carrying a lunchbox. Understood?",
      ],
      route: [{ x: 70, z: -70 }],
    },
    {
      id: "lin",
      name: "Lin Chow",
      role: "Barista · Kettle & Co.",
      x: 14,
      z: 44,
      accent: "#6ee7a8",
      lines: [
        "Morning. The harbour fog does half our advertising for us.",
        "Machine's still warming up, but I can do you a flat white in five.",
        "You look like someone who just moved in. Apartment above the lobby? Nice view, bad elevator.",
      ],
      route: [
        { x: 14, z: 44 },
        { x: 14, z: 28 },
        { x: 14, z: 44 },
      ],
    },
    {
      id: "reyes",
      name: "Officer Reyes",
      role: "Metropolis PD · Patrol",
      x: -8,
      z: -20,
      accent: "#7aa2ff",
      lines: [
        "Keep your nose clean on this block and we'll never have to talk again.",
        "You see anything unusual at the plaza, you call it in. That's how this works.",
        "Car theft is the fastest way to meet me twice. Believe me.",
      ],
      route: [
        { x: -8, z: -20 },
        { x: 0, z: -60 },
        { x: 12, z: -80 },
        { x: 0, z: -60 },
        { x: -8, z: -20 },
      ],
      officer: true,
    },
    {
      id: "ivo",
      name: "Ivo Petrov",
      role: "Runner",
      x: 22,
      z: 70,
      accent: "#ff9f6b",
      lines: [
        "Sixteen kilometres before breakfast. The hills outside the city will ruin your knees.",
        "If you can keep up with me to the north roundabout, I'll buy the coffee.",
        "No? Fair. The tram is faster anyway.",
      ],
      route: [
        { x: 22, z: 70 },
        { x: 22, z: 10 },
        { x: 40, z: 10 },
        { x: 40, z: 70 },
        { x: 22, z: 70 },
      ],
    },
    {
      id: "sana",
      name: "Sana Idris",
      role: "Visitor · Cartographer",
      x: 74,
      z: -58,
      accent: "#e6a8ff",
      lines: [
        "They say this harbour used to be a fishing village. Now look at it.",
        "I'm mapping the six cities. Metropolis is the easy one — everything else is a rumour.",
        "The military city to the east is closed to civilians. Even the maps are blank there.",
      ],
      route: [
        { x: 74, z: -58 },
        { x: 66, z: -72 },
        { x: 50, z: -66 },
        { x: 74, z: -58 },
      ],
    },
    {
      id: "oskar",
      name: "Oskar Bell",
      role: "Street vendor",
      x: 46,
      z: -72,
      accent: "#ffd166",
      lines: [
        "Roasted corn, two dollars. Best in Harborview, worst in Metropolis — depending who you ask.",
        "Mara's been standing by that pillar all morning. Fixers always make the square nervous.",
        "Buy something or move along, friend.",
      ],
      route: [{ x: 46, z: -72 }],
    },
    {
      id: "tavi",
      name: "Tavi Okonkwo",
      role: "Musician",
      x: 62,
      z: -52,
      accent: "#8affd7",
      lines: [
        "Ten years playing this square and nobody ever throws coins in the rain.",
        "You want a request? I only know three songs and two of them are the same song.",
        "Stay for the chorus if you like. It's the good part.",
      ],
      route: [{ x: 62, z: -52 }],
    },
  ] as NpcSpawn[],
  pois: [
    { name: "Harborview Plaza", x: 60, z: -60, kind: "plaza" },
    { name: "Skyline Residences", x: -60, z: -64, kind: "home" },
    { name: "Kestrel Park", x: -60, z: 60, kind: "park" },
    { name: "Avenue Garage", x: 2, z: 16, kind: "garage" },
    { name: "Old Harbour Walk", x: 0, z: 150, kind: "dock" },
  ] as Poi[],
};

/** Where the mission target stands (Deke) and where the parcel returns (Mara). */
export const MISSION = {
  id: "courier-run",
  title: "The Courier Run",
  giver: "mara",
  target: "deke",
  reward: 250,
  hint: "Mara waits beside the plaza columns.",
};

export interface CityMeta {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  x: number;
  z: number;
  color: string;
  status: "playable" | "planned";
}

/** The six cities of the nation, in world coordinates (km-scale layout). */
export const NATION_CITIES: CityMeta[] = [
  {
    id: "metropolis",
    name: "Metropolis",
    subtitle: "Financial capital",
    description:
      "Glass towers, harbour fog and money in a hurry. The playable district in this build.",
    x: 0,
    z: 0,
    color: "#f2b544",
    status: "playable",
  },
  {
    id: "industrial",
    name: "Industrial City",
    subtitle: "Factories & logistics",
    description: "Refineries, freight yards and the night shift that keeps the nation running.",
    x: -2400,
    z: -1600,
    color: "#9aa7b4",
    status: "planned",
  },
  {
    id: "coastal",
    name: "Coastal City",
    subtitle: "Beaches & seaports",
    description: "Boardwalks, container ports and the long road south along the water.",
    x: 1800,
    z: 2400,
    color: "#59d7ff",
    status: "planned",
  },
  {
    id: "historical",
    name: "Historical City",
    subtitle: "Old quarter & markets",
    description: "Stone arcades, spice markets and a cathedral older than the nation.",
    x: -2600,
    z: 900,
    color: "#e0a15c",
    status: "planned",
  },
  {
    id: "military",
    name: "Military City",
    subtitle: "Restricted zone",
    description: "Airfields, hangars and naval berths. Clearance required beyond the perimeter.",
    x: 2600,
    z: -900,
    color: "#8a9d6b",
    status: "planned",
  },
  {
    id: "adventure",
    name: "Adventure City",
    subtitle: "Mountains & racing",
    description: "Switchbacks, forest trails and a racing circuit carved into the ridge.",
    x: 600,
    z: 3400,
    color: "#ff8f6b",
    status: "planned",
  },
];
