import type { Appearance } from "../avatar/Avatar";
import type { MissionStage } from "../missions/MissionManager";
import type { Settings } from "../core/Settings";

export interface SaveData {
  version: number;
  savedAt: number;
  appearance: Appearance;
  position: { x: number; y: number; z: number };
  facing: number;
  cash: number;
  bank: number;
  inventory: string[];
  missionStage: MissionStage;
  clockMinutes: number;
  insideInterior: boolean;
  ownedVehicle: { id: string; x: number; z: number; heading: number } | null;
}

const DB_NAME = "nation-six-cities";
const DB_VERSION = 1;
const STORE = "kv";
const SAVE_KEY = "slot-1";
const SETTINGS_KEY = "settings";
const LS_SAVE_KEY = "nation-save-slot-1";
const LS_SETTINGS_KEY = "nation-settings";

/**
 * IndexedDB persistence with a localStorage safety net (private browsing /
 * blocked storage). Save games live in IndexedDB as required.
 */
export class SaveManager {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  lastSave: SaveData | null = null;
  readonly storageAvailable: boolean;

  constructor() {
    this.storageAvailable = typeof indexedDB !== "undefined";
    this.lastSave = this.readLocalSave();
  }

  get hasSave(): boolean {
    return this.lastSave !== null;
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (!this.storageAvailable) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  private async getValue<T>(key: string): Promise<T | null> {
    const db = await this.openDb();
    if (db) {
      try {
        return await new Promise<T | null>((resolve) => {
          const tx = db.transaction(STORE, "readonly");
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as T) ?? null);
          req.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    }
    return null;
  }

  private async setValue(key: string, value: unknown): Promise<boolean> {
    const db = await this.openDb();
    if (!db) return false;
    try {
      return await new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  private readLocalSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(LS_SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SaveData;
    } catch {
      return null;
    }
  }

  async loadSave(): Promise<SaveData | null> {
    const fromDb = await this.getValue<SaveData>(SAVE_KEY);
    const save = fromDb ?? this.readLocalSave();
    this.lastSave = save;
    return save;
  }

  async save(data: SaveData): Promise<boolean> {
    this.lastSave = data;
    let ok = await this.setValue(SAVE_KEY, data);
    try {
      localStorage.setItem(LS_SAVE_KEY, JSON.stringify(data));
      ok = true;
    } catch {
      // Ignore quota / disabled storage.
    }
    return ok;
  }

  async clear(): Promise<void> {
    this.lastSave = null;
    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(SAVE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    try {
      localStorage.removeItem(LS_SAVE_KEY);
    } catch {
      // Ignore.
    }
  }

  async loadSettings(): Promise<Partial<Settings> | null> {
    const fromDb = await this.getValue<Partial<Settings>>(SETTINGS_KEY);
    if (fromDb) return fromDb;
    try {
      const raw = localStorage.getItem(LS_SETTINGS_KEY);
      if (raw) return JSON.parse(raw) as Partial<Settings>;
    } catch {
      // Ignore.
    }
    return null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.setValue(SETTINGS_KEY, settings);
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore.
    }
  }
}
