import type { Game } from "../core/Game";
import type { Appearance } from "../avatar/Avatar";
import {
  CLOTHING_COLORS,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  PANTS_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
} from "../avatar/Avatar";
import { QUALITY_PRESETS, type QualityPreset, type Settings } from "../core/Settings";
import { METROPOLIS, NATION_CITIES } from "../cities/Metropolis";
import type { MissionSnapshot } from "../missions/MissionManager";
import { Minimap } from "./Minimap";

type OverlayKind = "pause" | "settings" | "map" | "inventory" | "creator" | "controls";

export interface DialogueOptions {
  speaker: string;
  role: string;
  accent: string;
  lines: string[];
  onDone?: () => void;
}

/**
 * All DOM UI. Gameplay and rendering never touch HTML directly — they push state
 * into this manager, which keeps the simulation and the interface independent.
 */
export class UIManager {
  private game: Game;
  private root: HTMLElement;

  private menuEl!: HTMLDivElement;
  private hudEl!: HTMLDivElement;
  private dialogueEl!: HTMLDivElement;
  private overlayEl!: HTMLDivElement;
  private touchEl!: HTMLDivElement;
  private toastWrap!: HTMLDivElement;
  private minimap!: Minimap;

  private promptEl!: HTMLDivElement;
  private promptTextEl!: HTMLSpanElement;
  private cashEl!: HTMLElement;
  private deltaEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private weatherEl!: HTMLElement;
  private districtEl!: HTMLElement;
  private missionEl!: HTMLElement;
  private locationEl!: HTMLElement;
  private wantedEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private coordsEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private menuMetaEl!: HTMLElement;
  private continueBtn!: HTMLButtonElement;

  private overlayKind: OverlayKind | null = null;
  private dialogueLines: string[] = [];
  private dialogueIndex = 0;
  private dialogueDone: (() => void) | undefined;
  private creatorAppearance: Appearance = { ...DEFAULT_APPEARANCE };
  private lastMoney = 500;
  private promptText: string | null = null;
  private touchReady = false;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    this.overlayEl = document.createElement("div");
    this.overlayEl.id = "ui-overlay";
    this.root.appendChild(this.overlayEl);
    this.buildMenu();
    this.buildHud();
    this.buildDialogue();
    this.buildTouch();
  }

  /* ---------------------------------------------------------------- */
  /* Boot / splash                                                     */
  /* ---------------------------------------------------------------- */

  setLoading(percent: number, stage: string, detail: string): void {
    const fill = document.getElementById("load-fill");
    const pct = document.getElementById("load-percent");
    const stageEl = document.getElementById("load-stage");
    const detailEl = document.getElementById("load-detail");
    if (fill) fill.style.width = `${Math.round(percent)}%`;
    if (pct) pct.textContent = `${Math.round(percent)}%`;
    if (stageEl) stageEl.textContent = stage;
    if (detailEl) detailEl.textContent = detail;
  }

  hideSplash(): void {
    document.getElementById("splash")?.classList.add("hidden");
  }

  showBootError(message: string): void {
    const detail = document.getElementById("load-detail");
    if (detail) {
      detail.textContent = message;
      detail.style.color = "#ff6b6b";
    }
    const stage = document.getElementById("load-stage");
    if (stage) stage.textContent = "Unable to start";
  }

  /* ---------------------------------------------------------------- */
  /* Menu                                                              */
  /* ---------------------------------------------------------------- */

  private buildMenu(): void {
    const el = document.createElement("div");
    el.className = "menu screen hidden";
    el.id = "ui-menu";
    el.innerHTML = `
      <div class="menu-brand">
        <h1>OPERA<span>·</span><br />NATION</h1>
        <p>Metropolis · Harborview District</p>
      </div>
      <div class="menu-panel">
        <button class="btn primary" id="menu-play">Play<span class="sub">Begin a new life in Harborview</span></button>
        <button class="btn" id="menu-continue" disabled>Continue<span class="sub">Resume your saved session</span></button>
        <div class="btn-row">
          <button class="btn" id="menu-settings">Settings</button>
          <button class="btn" id="menu-controls">Controls</button>
          <button class="btn" id="menu-fullscreen">Fullscreen</button>
        </div>
        <div class="menu-meta" id="menu-meta"></div>
        <p class="menu-offline-note">
          Single-player · no account required. Save data stays in this browser via IndexedDB.
          This is the Stage 1–2 build: one detailed district, five more cities planned.
        </p>
      </div>
    `;
    this.root.appendChild(el);
    this.menuEl = el;
    this.menuMetaEl = el.querySelector("#menu-meta") as HTMLElement;
    this.continueBtn = el.querySelector("#menu-continue") as HTMLButtonElement;

    this.on("#menu-play", () => this.showCreator());
    this.on("#menu-continue", () => this.game.continueGame());
    this.on("#menu-settings", () => this.openSettings());
    this.on("#menu-controls", () => this.showControls());
    this.on("#menu-fullscreen", () => this.game.toggleFullscreen());
  }

  showMenu(hasSave: boolean): void {
    this.menuEl.classList.remove("hidden");
    this.hudEl.classList.add("hidden");
    this.dialogueEl.classList.add("hidden");
    this.closeOverlays();
    this.continueBtn.disabled = !hasSave;
  }

  hideMenu(): void {
    this.menuEl.classList.add("hidden");
  }

  setMenuMeta(backend: string, qualityLabel: string, savedAt: number | null): void {
    const saved = savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : "No saved session";
    this.menuMetaEl.innerHTML = `<span>${backend}</span><span>${qualityLabel} preset</span><span>${saved}</span>`;
  }

  /* ---------------------------------------------------------------- */
  /* HUD                                                               */
  /* ---------------------------------------------------------------- */

  private buildHud(): void {
    const el = document.createElement("div");
    el.className = "hud hidden";
    el.id = "ui-hud";
    el.innerHTML = `
      <div class="hud-money">
        <span class="cur">$</span><span class="val" id="hud-cash">500</span>
        <span class="delta" id="hud-delta"></span>
      </div>
      <div class="hud-clock">
        <div class="time" id="hud-time">09:20</div>
        <div class="meta"><span id="hud-weather">Clear</span> · <span id="hud-district">Harborview</span></div>
      </div>
      <div class="wanted" id="hud-wanted"></div>
      <div class="mission-tracker hidden" id="hud-mission"></div>
      <div class="toasts" id="hud-toasts"></div>
      <div class="minimap-meta" id="hud-coords">HARBORVIEW</div>
      <div class="minimap-wrap">
        <canvas id="hud-minimap"></canvas>
        <div class="minimap-north">N</div>
      </div>
      <div class="hud-location" id="hud-location"></div>
      <div class="hud-prompt" id="hud-prompt"><span class="keycap">E</span><span id="hud-prompt-text"></span></div>
      <div class="hud-speed" id="hud-speed"><div class="kmh">0</div><div class="unit">KM/H</div></div>
      <div class="hud-help" id="hud-help">TAB INVENTORY · M MAP · C CAMERA · ESC PAUSE</div>
    `;
    this.root.appendChild(el);
    this.hudEl = el;
    this.cashEl = el.querySelector("#hud-cash") as HTMLElement;
    this.deltaEl = el.querySelector("#hud-delta") as HTMLElement;
    this.timeEl = el.querySelector("#hud-time") as HTMLElement;
    this.weatherEl = el.querySelector("#hud-weather") as HTMLElement;
    this.districtEl = el.querySelector("#hud-district") as HTMLElement;
    this.missionEl = el.querySelector("#hud-mission") as HTMLElement;
    this.locationEl = el.querySelector("#hud-location") as HTMLElement;
    this.wantedEl = el.querySelector("#hud-wanted") as HTMLElement;
    this.speedEl = el.querySelector("#hud-speed") as HTMLElement;
    this.coordsEl = el.querySelector("#hud-coords") as HTMLElement;
    this.promptEl = el.querySelector("#hud-prompt") as HTMLDivElement;
    this.promptTextEl = el.querySelector("#hud-prompt-text") as HTMLSpanElement;
    this.toastWrap = el.querySelector("#hud-toasts") as HTMLDivElement;
    this.helpEl = el.querySelector("#hud-help") as HTMLElement;
    const canvas = el.querySelector("#hud-minimap") as HTMLCanvasElement;
    this.minimap = new Minimap(canvas);
  }

  showHud(): void {
    this.hudEl.classList.remove("hidden");
  }

  hideHud(): void {
    this.hudEl.classList.add("hidden");
    this.hudEl.querySelector(".hud-prompt")?.classList.remove("show");
    this.speedEl.classList.remove("show");
  }

  setMoney(cash: number, bank: number): void {
    const diff = cash - this.lastMoney;
    this.lastMoney = cash;
    this.cashEl.textContent = cash.toLocaleString("en-US");
    if (diff !== 0) {
      this.deltaEl.textContent = `${diff > 0 ? "+" : "−"}$${Math.abs(diff).toLocaleString("en-US")}`;
      this.deltaEl.style.color = diff > 0 ? "#6ee7a8" : "#ff6b6b";
      this.deltaEl.classList.add("show");
      window.setTimeout(() => this.deltaEl.classList.remove("show"), 1600);
    }
    if (this.overlayKind === "inventory") this.refreshInventoryValues(cash, bank);
  }

  setClock(time: string, weather: string): void {
    this.timeEl.textContent = time;
    this.weatherEl.textContent = weather;
  }

  setDistrict(name: string): void {
    this.districtEl.textContent = name;
    this.coordsEl.textContent = name.toUpperCase();
  }

  setMission(snapshot: MissionSnapshot): void {
    const items = snapshot.objectives
      .map((o) => `<li class="${o.done ? "done" : ""}">${o.text}</li>`)
      .join("");
    this.missionEl.innerHTML = `
      <div class="label">Mission</div>
      <div class="title">${snapshot.title}</div>
      <ul>${items}</ul>
      <div class="hint">${snapshot.hint}</div>
    `;
    this.missionEl.classList.remove("hidden");
  }

  setPrompt(text: string | null): void {
    if (text === this.promptText) return;
    this.promptText = text;
    if (text) {
      this.promptTextEl.textContent = text;
      this.promptEl.classList.add("show");
    } else {
      this.promptEl.classList.remove("show");
    }
  }

  setLocation(name: string): void {
    this.locationEl.innerHTML = `<b>${name}</b>METROPOLIS · HARBORVIEW`;
  }

  setWanted(level: number): void {
    if (level <= 0) {
      this.wantedEl.classList.remove("show");
      this.wantedEl.textContent = "";
      return;
    }
    this.wantedEl.textContent = "★".repeat(level);
    this.wantedEl.classList.add("show");
  }

  setSpeed(kmh: number | null): void {
    if (kmh === null) {
      this.speedEl.classList.remove("show");
      return;
    }
    this.speedEl.classList.add("show");
    const val = this.speedEl.querySelector(".kmh");
    if (val) val.textContent = String(Math.round(kmh));
  }

  setHelp(visible: boolean): void {
    this.helpEl.style.opacity = visible ? "1" : "0";
  }

  updateMinimap(state: Parameters<Minimap["render"]>[0]): void {
    this.minimap.render(state);
  }

  resizeMinimap(): void {
    this.minimap.resize();
  }

  toast(text: string, tone: "info" | "good" | "bad" = "info"): void {
    const el = document.createElement("div");
    el.className = `toast ${tone === "info" ? "" : tone}`;
    el.textContent = text;
    this.toastWrap.appendChild(el);
    window.setTimeout(() => el.classList.add("fade"), 3200);
    window.setTimeout(() => el.remove(), 3800);
    while (this.toastWrap.children.length > 4) this.toastWrap.firstElementChild?.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Dialogue                                                          */
  /* ---------------------------------------------------------------- */

  private buildDialogue(): void {
    const el = document.createElement("div");
    el.className = "dialogue hidden";
    el.id = "ui-dialogue";
    el.innerHTML = `
      <div class="dialogue-head">
        <div class="avatar-dot" id="dlg-dot">M</div>
        <div class="who"><b id="dlg-name"></b><span id="dlg-role"></span></div>
      </div>
      <div class="dialogue-body" id="dlg-body"></div>
      <div class="dialogue-foot">
        <span class="hint">E / ENTER · CONTINUE</span>
        <div class="btn-row">
          <button class="btn ghost" id="dlg-close">Step away</button>
          <button class="btn primary" id="dlg-next">Continue</button>
        </div>
      </div>
    `;
    this.root.appendChild(el);
    this.dialogueEl = el;
    this.on("#dlg-next", () => this.advanceDialogue());
    this.on("#dlg-close", () => this.closeDialogue(true));
  }

  showDialogue(options: DialogueOptions): void {
    this.dialogueLines = options.lines;
    this.dialogueIndex = 0;
    this.dialogueDone = options.onDone;
    const dot = this.dialogueEl.querySelector("#dlg-dot") as HTMLElement;
    dot.textContent = options.speaker
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2);
    dot.style.background = options.accent;
    (this.dialogueEl.querySelector("#dlg-name") as HTMLElement).textContent = options.speaker;
    (this.dialogueEl.querySelector("#dlg-role") as HTMLElement).textContent = options.role;
    this.dialogueEl.classList.remove("hidden");
    this.game.setDialogueOpen(true);
    this.renderDialogueLine();
  }

  private renderDialogueLine(): void {
    const body = this.dialogueEl.querySelector("#dlg-body") as HTMLElement;
    body.textContent = this.dialogueLines[this.dialogueIndex] ?? "";
    const next = this.dialogueEl.querySelector("#dlg-next") as HTMLElement;
    next.textContent = this.dialogueIndex >= this.dialogueLines.length - 1 ? "Finish" : "Continue";
  }

  advanceDialogue(): void {
    if (this.dialogueEl.classList.contains("hidden")) return;
    if (this.dialogueIndex < this.dialogueLines.length - 1) {
      this.dialogueIndex += 1;
      this.renderDialogueLine();
    } else {
      this.closeDialogue(false);
    }
  }

  closeDialogue(cancelled: boolean): void {
    if (this.dialogueEl.classList.contains("hidden")) return;
    this.dialogueEl.classList.add("hidden");
    this.game.setDialogueOpen(false);
    const done = this.dialogueDone;
    this.dialogueDone = undefined;
    if (!cancelled) done?.();
  }

  isDialogueOpen(): boolean {
    return !this.dialogueEl.classList.contains("hidden");
  }

  /* ---------------------------------------------------------------- */
  /* Overlay panels                                                    */
  /* ---------------------------------------------------------------- */

  private mountPanel(kind: OverlayKind, panelHtml: string): void {
    this.overlayKind = kind;
    this.overlayEl.innerHTML = `<div class="overlay">${panelHtml}</div>`;
    this.game.setModalOpen(true);
  }

  hasOverlay(): boolean {
    return this.overlayKind !== null;
  }

  get overlay(): OverlayKind | null {
    return this.overlayKind;
  }

  closeOverlays(): void {
    this.overlayEl.innerHTML = "";
    this.overlayKind = null;
  }

  private panel(head: string, kicker: string, body: string, foot: string, wide = false): string {
    return `
      <div class="panel ${wide ? "wide" : ""}" role="dialog" aria-label="${head}">
        <div class="panel-head">
          <div><h2>${head}</h2><div class="kicker">${kicker}</div></div>
          <button class="btn ghost" id="panel-close" aria-label="Close">Esc</button>
        </div>
        <div class="panel-body">${body}</div>
        <div class="panel-foot">${foot}</div>
      </div>
    `;
  }

  private bindPanelClose(): void {
    this.on("#panel-close", () => this.game.closeOverlay());
  }

  showPause(): void {
    const profile = QUALITY_PRESETS[this.game.settings.quality];
    const body = `
      <div class="pause-grid">
        <button class="btn primary" id="pause-resume">Resume</button>
        <button class="btn" id="pause-save">Save progress</button>
        <button class="btn" id="pause-map">World map</button>
        <button class="btn" id="pause-inventory">Inventory</button>
        <button class="btn" id="pause-settings">Settings</button>
        <button class="btn" id="pause-controls">Controls</button>
      </div>
      <div>
        <div class="stat-line"><span>Rendering backend</span><b>${this.game.renderer.backendNote}</b></div>
        <div class="stat-line"><span>Quality preset</span><b>${profile.label}</b></div>
        <div class="stat-line"><span>Render distance</span><b>${profile.renderDistance} m</b></div>
        <div class="stat-line"><span>Active resolution</span><b>${this.game.quality.resolutionScaleLabel}</b></div>
        <div class="stat-line"><span>Frame rate</span><b>${this.game.fps.toFixed(0)} fps</b></div>
        <div class="stat-line"><span>Position</span><b>${this.game.player.position.x.toFixed(0)}, ${this.game.player.position.z.toFixed(0)}</b></div>
      </div>
      <button class="btn danger" id="pause-quit">Save &amp; quit to main menu</button>
    `;
    this.mountPanel(
      "pause",
      this.panel("Paused", "Harborview · session", body, `<button class="btn ghost" id="pause-foot-resume">Resume</button>`),
    );
    this.bindPanelClose();
    this.on("#pause-resume", () => this.game.closeOverlay());
    this.on("#pause-foot-resume", () => this.game.closeOverlay());
    this.on("#pause-save", () => this.game.saveGame(true));
    this.on("#pause-map", () => this.openMap());
    this.on("#pause-inventory", () => this.openInventory());
    this.on("#pause-settings", () => this.openSettings());
    this.on("#pause-controls", () => this.showControls());
    this.on("#pause-quit", () => this.game.quitToMenu());
  }

  openSettings(): void {
    const s = this.game.settings;
    const profile = QUALITY_PRESETS[s.quality];
    const presets = (Object.keys(QUALITY_PRESETS) as QualityPreset[])
      .map(
        (key) =>
          `<button class="preset ${s.quality === key ? "active" : ""}" data-preset="${key}">${QUALITY_PRESETS[key].label}</button>`,
      )
      .join("");
    const body = `
      <div class="field">
        <label>Graphics preset <span class="value">${profile.label}</span></label>
        <div class="preset-grid">${presets}</div>
      </div>
      <div class="field">
        <label>Adaptive resolution <span class="value">${s.adaptiveResolution ? "On" : "Off"}</span></label>
        <select id="set-adaptive">
          <option value="1" ${s.adaptiveResolution ? "selected" : ""}>On — adjust to hold frame rate</option>
          <option value="0" ${!s.adaptiveResolution ? "selected" : ""}>Off — fixed resolution</option>
        </select>
      </div>
      <div class="field">
        <label>Mouse sensitivity <span class="value" id="sens-val">${s.mouseSensitivity.toFixed(2)}</span></label>
        <input type="range" id="set-sens" min="0.3" max="2.5" step="0.05" value="${s.mouseSensitivity}" />
      </div>
      <div class="field">
        <label>Master volume <span class="value" id="vol-val">${Math.round(s.masterVolume * 100)}%</span></label>
        <input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.masterVolume}" />
      </div>
      <div class="field">
        <label>Invert camera Y</label>
        <select id="set-invert">
          <option value="0" ${!s.invertY ? "selected" : ""}>No</option>
          <option value="1" ${s.invertY ? "selected" : ""}>Yes</option>
        </select>
      </div>
      <div>
        <div class="stat-line"><span>Rendering backend</span><b>${this.game.renderer.backendNote}</b></div>
        <div class="stat-line"><span>Draw distance</span><b>${profile.renderDistance} m</b></div>
        <div class="stat-line"><span>Shadows</span><b>${profile.shadows ? `${profile.shadowMapSize}px` : "Off"}</b></div>
        <div class="stat-line"><span>Depth of field</span><b>${profile.depthOfField ? "On" : "Off"}</b></div>
        <div class="stat-line"><span>Resolution scale</span><b>${this.game.quality.resolutionScaleLabel}</b></div>
      </div>
      <div class="field">
        <label>WebGPU preference</label>
        <select id="set-webgpu">
          <option value="1" ${s.preferWebGPU ? "selected" : ""}>Auto — WebGPU, fall back to WebGL 2</option>
          <option value="0" ${!s.preferWebGPU ? "selected" : ""}>WebGL 2 only</option>
        </select>
        <button class="btn" id="set-reload">Apply backend &amp; reload</button>
      </div>
    `;
    this.mountPanel(
      "settings",
      this.panel("Settings", "Graphics · input · audio", body, `<button class="btn ghost" id="settings-close">Back</button>`),
    );
    this.bindPanelClose();
    this.on("#settings-close", () => this.game.closeOverlay());

    this.overlayEl.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.game.audio.uiClick();
        this.game.setQuality(btn.dataset.preset as QualityPreset);
        this.openSettings();
      });
    });
    this.on("#set-adaptive", (ev) => {
      const el = ev.target as HTMLSelectElement;
      this.game.updateSettings({ adaptiveResolution: el.value === "1" });
    });
    this.on("#set-sens", (ev) => {
      const el = ev.target as HTMLInputElement;
      const val = document.getElementById("sens-val");
      if (val) val.textContent = Number(el.value).toFixed(2);
      this.game.updateSettings({ mouseSensitivity: Number(el.value) });
    });
    this.on("#set-vol", (ev) => {
      const el = ev.target as HTMLInputElement;
      const val = document.getElementById("vol-val");
      if (val) val.textContent = `${Math.round(Number(el.value) * 100)}%`;
      this.game.updateSettings({ masterVolume: Number(el.value) });
    });
    this.on("#set-invert", (ev) => {
      this.game.updateSettings({ invertY: (ev.target as HTMLSelectElement).value === "1" });
    });
    this.on("#set-webgpu", (ev) => {
      this.game.updateSettings({ preferWebGPU: (ev.target as HTMLSelectElement).value === "1" });
    });
    this.on("#set-reload", () => window.location.reload());
  }

  showControls(): void {
    const rows: [string, string][] = [
      ["W A S D", "Move"],
      ["Mouse", "Camera"],
      ["Shift", "Sprint"],
      ["Space", "Jump"],
      ["E", "Interact / enter vehicle"],
      ["F", "Exit vehicle"],
      ["C", "Change camera"],
      ["M", "World map"],
      ["Tab", "Inventory"],
      ["Esc", "Pause / close"],
      ["Wheel", "Camera zoom"],
      ["Gamepad", "Left stick / RT / A"],
      ["Touch", "On-screen stick + buttons"],
    ];
    const body = `<div class="controls-table">${rows
      .map(([k, v]) => `<div class="row"><span>${v}</span><span class="keycap">${k}</span></div>`)
      .join("")}</div>
      <p style="font-size:11px;color:#7d8d9f;line-height:1.6;margin:0">
        Pointer lock is used for mouse look. Press Esc at any time to release the cursor.
      </p>`;
    this.mountPanel("controls", this.panel("Controls", "Keyboard · mouse · gamepad · touch", body, `<button class="btn ghost" id="controls-close">Back</button>`));
    this.bindPanelClose();
    this.on("#controls-close", () => this.game.closeOverlay());
  }

  openMap(): void {
    const cities = NATION_CITIES.map(
      (c) => `
        <div class="map-city ${c.status === "playable" ? "active" : ""}">
          <b>${c.name}<span>${c.status === "playable" ? "Playable" : "Stage 6"}</span></b>
          <p>${c.description}</p>
        </div>`,
    ).join("");
    const body = `
      <div class="map-wrap">
        <div class="map-canvas"><canvas id="world-map"></canvas></div>
        <div class="map-side">
          <div style="font-family:var(--mono);font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)">The nation</div>
          ${cities}
        </div>
      </div>`;
    this.mountPanel(
      "map",
      `<div class="panel wide" role="dialog" aria-label="World map">
        <div class="panel-head"><div><h2>World Map</h2><div class="kicker">Six cities · one connected nation</div></div>
        <button class="btn ghost" id="panel-close">Esc</button></div>
        <div class="panel-body" style="padding:0">${body}</div>
        <div class="panel-foot"><button class="btn ghost" id="map-close">Close</button></div>
      </div>`,
    );
    this.bindPanelClose();
    this.on("#map-close", () => this.game.closeOverlay());
    requestAnimationFrame(() => this.drawWorldMap());
  }

  private drawWorldMap(): void {
    const canvas = document.getElementById("world-map") as HTMLCanvasElement | null;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(320, rect.width) * dpr;
    canvas.height = Math.max(240, rect.height) * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = "#060d14";
    ctx.fillRect(0, 0, w, h);

    // Grid.
    ctx.strokeStyle = "rgba(89,215,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const bounds = 4000;
    const scale = Math.min(w, h) / (bounds * 2);
    const toX = (x: number) => w / 2 + x * scale;
    const toY = (z: number) => h / 2 + z * scale;

    // Landmass silhouette.
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.4, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(38,58,48,0.5)";
    ctx.fill();
    ctx.strokeStyle = "rgba(110,231,168,0.16)";
    ctx.stroke();

    // Highway links between cities.
    ctx.strokeStyle = "rgba(242,181,68,0.22)";
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    for (const city of NATION_CITIES) {
      ctx.lineTo(toX(city.x), toY(city.z));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // District road grid around the player.
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    for (const axis of [-120, 0, 120]) {
      ctx.beginPath();
      ctx.moveTo(toX(axis), toY(-300));
      ctx.lineTo(toX(axis), toY(300));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-300), toY(axis));
      ctx.lineTo(toX(300), toY(axis));
      ctx.stroke();
    }

    // Cities.
    for (const city of NATION_CITIES) {
      const x = toX(city.x);
      const y = toY(city.z);
      const planned = city.status !== "playable";
      ctx.beginPath();
      ctx.arc(x, y, planned ? 4 : 7, 0, Math.PI * 2);
      ctx.fillStyle = city.color;
      ctx.globalAlpha = planned ? 0.55 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!planned) {
        ctx.strokeStyle = `${city.color}66`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = planned ? "#8d9bab" : "#edf2f8";
      ctx.font = `${planned ? 10 : 12}px Inter, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(city.name, x + 10, y + 4);
      if (!planned) {
        ctx.fillStyle = "#f2b544";
        ctx.font = "9px monospace";
        ctx.fillText("YOU ARE HERE", x + 10, y + 17);
      }
    }

    // Player position arrow.
    const player = this.game.player.position;
    const px = toX(player.x);
    const py = toY(player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.game.player.facing + Math.PI);
    ctx.fillStyle = "#f2b544";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  openInventory(): void {
    const items = this.game.inventory.list;
    const body = `
      <div class="stat-line"><span>Cash on hand</span><b id="inv-cash">$${this.game.economy.cash.toLocaleString("en-US")}</b></div>
      <div class="stat-line"><span>Bank account</span><b id="inv-bank">$${this.game.economy.bank.toLocaleString("en-US")}</b></div>
      <div class="btn-row">
        <button class="btn" id="inv-deposit">Deposit $100</button>
        <button class="btn" id="inv-withdraw">Withdraw $100</button>
      </div>
      <div class="inv-grid">
        ${items
          .map(
            (item) => `
          <div class="inv-item">
            <span class="tag">${item.tag}</span>
            <b>${item.name}</b>
            <p>${item.description}</p>
            ${item.kind === "wearable" ? `<button class="btn" data-equip="${item.id}">Wear</button>` : ""}
          </div>`,
          )
          .join("")}
      </div>
    `;
    this.mountPanel("inventory", this.panel("Inventory", "Harborview · personal effects", body, `<button class="btn ghost" id="inv-close">Close</button>`));
    this.bindPanelClose();
    this.on("#inv-close", () => this.game.closeOverlay());
    this.on("#inv-deposit", () => {
      this.game.economy.deposit(100);
      this.openInventory();
    });
    this.on("#inv-withdraw", () => {
      this.game.economy.withdraw(100);
      this.openInventory();
    });
    this.overlayEl.querySelectorAll<HTMLButtonElement>("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.game.equipItem(btn.dataset.equip!);
        this.openInventory();
      });
    });
  }

  private refreshInventoryValues(cash: number, bank: number): void {
    const c = document.getElementById("inv-cash");
    const b = document.getElementById("inv-bank");
    if (c) c.textContent = `$${cash.toLocaleString("en-US")}`;
    if (b) b.textContent = `$${bank.toLocaleString("en-US")}`;
  }

  /* ---------------------------------------------------------------- */
  /* Character creator                                                 */
  /* ---------------------------------------------------------------- */

  showCreator(): void {
    this.creatorAppearance = { ...DEFAULT_APPEARANCE };
    this.renderCreator();
  }

  private renderCreator(): void {
    const a = this.creatorAppearance;
    const swatchRow = (role: keyof Appearance, colors: string[], label: string) => `
      <div class="field">
        <label>${label}</label>
        <div class="swatches">
          ${colors
            .map(
              (c) =>
                `<button class="swatch ${a[role] === c ? "active" : ""}" data-swatch="${role}" data-color="${c}" style="background:${c}" aria-label="${label} ${c}"></button>`,
            )
            .join("")}
        </div>
      </div>`;

    const body = `
      <div class="creator-grid">
        <div>
          ${swatchRow("skin", SKIN_TONES, "Skin tone")}
          ${swatchRow("hair", HAIR_COLORS, "Hair colour")}
          ${swatchRow("shirt", CLOTHING_COLORS, "Top")}
          ${swatchRow("pants", PANTS_COLORS, "Trousers")}
          ${swatchRow("shoes", SHOE_COLORS, "Shoes")}
        </div>
        <div>
          <div class="field">
            <label>Hair style</label>
            <div class="preset-grid">
              ${["Short", "Swept", "Long", "Buzz"]
                .map(
                  (label, i) =>
                    `<button class="preset ${a.hairStyle === i ? "active" : ""}" data-hair="${i}">${label}</button>`,
                )
                .join("")}
            </div>
          </div>
          <div class="field">
            <label>Build <span class="value">${a.build.toFixed(2)}</span></label>
            <input type="range" id="cr-build" min="0.85" max="1.15" step="0.01" value="${a.build}" />
          </div>
          <div class="field">
            <label>Height <span class="value">${a.height.toFixed(2)}</span></label>
            <input type="range" id="cr-height" min="0.92" max="1.08" step="0.01" value="${a.height}" />
          </div>
          <div class="field">
            <label>Accessories</label>
            <div class="preset-grid" style="grid-template-columns:repeat(3,1fr)">
              <button class="preset ${a.backpack ? "active" : ""}" data-toggle="backpack">Backpack</button>
              <button class="preset ${a.hat ? "active" : ""}" data-toggle="hat">Hat</button>
              <button class="preset ${a.glasses ? "active" : ""}" data-toggle="glasses">Glasses</button>
            </div>
          </div>
          <div class="creator-preview">
            Your avatar is generated as a rigged placeholder mesh in this build.<br />
            Outfit colours, proportions and accessories carry into gameplay immediately.
          </div>
        </div>
      </div>
    `;
    this.mountPanel(
      "creator",
      this.panel(
        "Create your resident",
        "Stage 3 preview · appearance",
        body,
        `<button class="btn ghost" id="cr-back">Back</button><button class="btn primary" id="cr-start">Enter Harborview</button>`,
        true,
      ),
    );
    this.bindPanelClose();
    this.on("#cr-back", () => this.game.closeOverlay());
    this.on("#cr-start", () => {
      this.hideMenu();
      this.game.startNewGame({ ...this.creatorAppearance });
    });
    this.overlayEl.querySelectorAll<HTMLButtonElement>("[data-swatch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.dataset.swatch as keyof Appearance;
        (this.creatorAppearance as unknown as Record<string, unknown>)[role] = btn.dataset.color;
        this.game.audio.uiClick();
        this.renderCreator();
      });
    });
    this.overlayEl.querySelectorAll<HTMLButtonElement>("[data-hair]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.creatorAppearance.hairStyle = Number(btn.dataset.hair);
        this.renderCreator();
      });
    });
    this.overlayEl.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.toggle as "backpack" | "hat" | "glasses";
        this.creatorAppearance[key] = !this.creatorAppearance[key];
        this.renderCreator();
      });
    });
    const buildInput = this.overlayEl.querySelector("#cr-build") as HTMLInputElement | null;
    buildInput?.addEventListener("input", () => {
      this.creatorAppearance.build = Number(buildInput.value);
      const label = buildInput.previousElementSibling?.querySelector(".value");
      if (label) label.textContent = this.creatorAppearance.build.toFixed(2);
    });
    const heightInput = this.overlayEl.querySelector("#cr-height") as HTMLInputElement | null;
    heightInput?.addEventListener("input", () => {
      this.creatorAppearance.height = Number(heightInput.value);
      const label = heightInput.previousElementSibling?.querySelector(".value");
      if (label) label.textContent = this.creatorAppearance.height.toFixed(2);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Touch controls                                                    */
  /* ---------------------------------------------------------------- */

  private buildTouch(): void {
    const el = document.createElement("div");
    el.className = "touch-ui hidden";
    el.id = "ui-touch";
    el.innerHTML = `
      <div class="touch-stick" id="touch-stick"><i id="touch-knob"></i></div>
      <div class="touch-buttons">
        <button id="touch-run">RUN</button>
        <button id="touch-jump">JUMP</button>
        <button id="touch-interact">USE</button>
        <button id="touch-map">MAP</button>
      </div>
    `;
    this.root.appendChild(el);
    this.touchEl = el;

    const stick = el.querySelector("#touch-stick") as HTMLDivElement;
    const knob = el.querySelector("#touch-knob") as HTMLElement;
    let offset = { x: 0, y: 0 };
    const move = (dx: number, dy: number) => {
      const max = 40;
      const len = Math.hypot(dx, dy);
      const scale = len > max ? max / len : 1;
      offset = { x: dx * scale, y: dy * scale };
      knob.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
      this.game.input.touchMove = { x: offset.x / max, y: offset.y / max };
    };
    const reset = () => {
      offset = { x: 0, y: 0 };
      knob.style.transform = "translate(0, 0)";
      this.game.input.touchMove = { x: 0, y: 0 };
    };

    stick.addEventListener("pointerdown", (e) => {
      stick.setPointerCapture(e.pointerId);
      const rect = stick.getBoundingClientRect();
      move(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    });
    stick.addEventListener("pointermove", (e) => {
      if (!stick.hasPointerCapture(e.pointerId)) return;
      const rect = stick.getBoundingClientRect();
      move(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    });
    stick.addEventListener("pointerup", reset);
    stick.addEventListener("pointercancel", reset);

    const jump = el.querySelector("#touch-jump") as HTMLButtonElement;
    jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.game.input.touchJump = true;
    });
    const run = el.querySelector("#touch-run") as HTMLButtonElement;
    run.addEventListener("pointerdown", () => {
      this.game.input.touchSprint = true;
      run.style.background = "rgba(242,181,68,0.5)";
    });
    run.addEventListener("pointerup", () => {
      this.game.input.touchSprint = false;
      run.style.background = "";
    });
    const use = el.querySelector("#touch-interact") as HTMLButtonElement;
    use.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.game.interact();
    });
    const map = el.querySelector("#touch-map") as HTMLButtonElement;
    map.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.game.toggleMap();
    });
  }

  setTouchVisible(visible: boolean): void {
    const enable = visible && (navigator.maxTouchPoints > 0 || this.touchReady);
    this.touchEl.classList.toggle("hidden", !enable);
  }

  enableTouchUI(): void {
    this.touchReady = true;
    this.setTouchVisible(!this.hudEl.classList.contains("hidden"));
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  openUrlHint(): void {
    /* reserved for future account links */
  }

  private on(selector: string, handler: (ev: Event) => void): void {
    const el = this.overlayEl.querySelector(selector) ?? this.root.querySelector(selector);
    if (!el) return;
    el.addEventListener("click", (ev) => {
      this.game.audio.uiClick();
      handler(ev);
    });
  }

  applySettingsToUI(_settings: Settings): void {
    // Panels rebuild themselves from game.settings when opened.
  }
}
