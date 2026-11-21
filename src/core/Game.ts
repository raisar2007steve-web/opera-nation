import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { DEFAULT_APPEARANCE, type Appearance } from "../avatar/Avatar";
import { METROPOLIS, MISSION } from "../cities/Metropolis";
import { Input } from "./Input";
import {
  mergeSettings,
  QUALITY_PRESETS,
  type QualityPreset,
  type QualityProfile,
  type Settings,
} from "./Settings";
import { QualityManager } from "../engine/QualityManager";
import { Renderer } from "../engine/Renderer";
import { Economy } from "../economy/Economy";
import { Inventory } from "../inventory/Inventory";
import { MissionManager } from "../missions/MissionManager";
import { NPCManager } from "../npcs/NPCManager";
import type { Npc } from "../npcs/Npc";
import { CameraController } from "../player/CameraController";
import { Player } from "../player/Player";
import { PoliceSystem } from "../police/PoliceSystem";
import { PostFX } from "../rendering/PostFX";
import { AudioSystem } from "../audio/AudioSystem";
import { SaveManager, type SaveData } from "../storage/SaveManager";
import { UIManager } from "../ui/UIManager";
import { VehicleManager, type Vehicle } from "../vehicles/Vehicle";
import { WeatherSystem } from "../weather/WeatherSystem";
import { World, type Interactable } from "../world/World";

export type GameMode = "boot" | "menu" | "playing" | "paused";

/**
 * Application shell. Owns the engine, the world, every gameplay system and the
 * update loop. The UI is pushed state; the simulation never queries the DOM.
 */
export class Game {
  canvas: HTMLCanvasElement;

  renderer!: Renderer;
  scene!: Scene;
  ui!: UIManager;
  input!: Input;
  settings: Settings = mergeSettings(null);
  quality!: QualityManager;
  post!: PostFX;
  world!: World;
  player!: Player;
  cameraCtl!: CameraController;
  vehicles!: VehicleManager;
  npcs!: NPCManager;
  weather!: WeatherSystem;
  police!: PoliceSystem;

  readonly missions = new MissionManager();
  readonly economy = new Economy();
  readonly inventory = new Inventory();
  readonly audio = new AudioSystem();
  readonly save = new SaveManager();

  mode: GameMode = "boot";
  fps = 60;
  character: Appearance = { ...DEFAULT_APPEARANCE };

  private modalOpen = false;
  private dialogueActive = false;
  private activeVehicle: Vehicle | null = null;
  private markerRoot!: TransformNode;
  private markerRing!: Mesh;
  private saveTimer = 0;
  private hudTimer = 0;
  private minimapTimer = 0;
  private fpsTimer = 0;
  private fpsFrames = 0;
  private lastPrompt: string | null = null;
  private lastDistrict = "";
  private startPointerLockPending = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.economy.onChange = (cash, bank) => {
      if (this.ui) this.ui.setMoney(cash, bank);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  async boot(): Promise<void> {
    const uiRoot = document.getElementById("ui-root");
    if (!uiRoot) throw new Error("UI root missing");

    this.ui = new UIManager(this, uiRoot);
    this.ui.setLoading(4, "Restoring preferences", "Reading local settings");
    const savedSettings = await this.save.loadSettings();
    this.settings = mergeSettings(savedSettings);
    const savedGame = await this.save.loadSave();

    this.ui.setLoading(10, "Checking rendering backend", "WebGPU first, WebGL 2 fallback");
    await this.wait(40);

    await this.buildRenderStack(this.settings.preferWebGPU);

    this.ui.setLoading(34, "Generating terrain", "Coastal shelf · hills · harbour bay");
    await this.wait(30);

    try {
      await this.buildSceneContent();
    } catch (error) {
      if (this.renderer.backend !== "webgpu") throw error;
      console.warn("[NATION] WebGPU content build failed, retrying on WebGL 2", error);
      this.ui.setLoading(46, "Switching to WebGL 2", "WebGPU texture upload unavailable");
      await this.wait(60);
      await this.restartOnWebGL2();
      await this.buildSceneContent();
    }

    this.ui.setLoading(58, "Raising Harborview", "16 blocks · roads · plaza · residences");
    await this.wait(30);

    this.ui.setLoading(70, "Populating the district", "Citizens, traffic and street life");
    await this.wait(20);

    this.ui.setLoading(86, "Wiring simulation", "NPC schedules · economy · save slots");
    this.ui.setMoney(this.economy.cash, this.economy.bank);
    this.ui.setMission(this.missions.snapshot());
    this.ui.setDistrict("Harborview");
    this.ui.setLocation("Harborview Plaza");
    this.inventory.onChange = () => {
      if (this.ui.overlay === "inventory") this.ui.openInventory();
    };
    await this.wait(40);

    this.ui.setLoading(100, "Ready", "Harborview is waiting");
    await this.wait(120);
    this.ui.hideSplash();
    this.ui.setMenuMeta(
      this.renderer.backendNote,
      QUALITY_PRESETS[this.settings.quality].label,
      this.save.lastSave?.savedAt ?? null,
    );
    this.ui.showMenu(Boolean(savedGame));
    this.mode = "menu";
    this.setupMenuCamera();

    this.installGlobalHandlers();
    this.renderer.runLoop(this.tick);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private async buildRenderStack(preferWebGPU: boolean): Promise<void> {
    this.renderer = await Renderer.create(this.canvas, {
      preferWebGPU,
      onWarn: (message) => this.ui.toast(message, "info"),
    });
    this.scene = this.renderer.scene;
    this.cameraCtl = new CameraController(this.scene);
    this.quality = new QualityManager(this.renderer, this.settings, (profile) => this.applyProfile(profile));
    this.post = new PostFX(this.scene, this.cameraCtl.camera, this.quality.profile);
    this.post.build();
    this.applyProfile(this.quality.profile);
  }

  /** World, player, traffic and street life — everything that touches the GPU. */
  private async buildSceneContent(): Promise<void> {
    this.world = new World(this.scene);
    this.input = new Input(this.canvas);

    this.character = { ...DEFAULT_APPEARANCE };
    this.player = new Player(this.scene, this.character, {
      onFootstep: (sprinting) => this.audio.footstep(sprinting),
      onJump: () => this.audio.jump(),
      onLand: () => this.audio.land(),
    });
    this.player.spawn(this.world.spawnPoint, METROPOLIS.spawn.heading);

    this.vehicles = new VehicleManager(this.scene, this.world, METROPOLIS.vehicleSpawns);
    this.npcs = new NPCManager(this.scene, this.world, METROPOLIS.npcs);
    this.weather = new WeatherSystem(this.scene, this.world.sky);
    this.police = new PoliceSystem(this.npcs.officer, {
      onChange: (level) => {
        this.ui.setWanted(level);
        if (level > 0) this.ui.toast("Wanted level increased — MPD responding", "bad");
      },
      onArrest: (fine) => {
        this.ui.toast(`Fined $${fine}. Wanted level cleared.`, "bad");
        this.audio.fail();
      },
    });

    this.buildMissionMarker();
  }

  /**
   * A canvas cannot switch context types once claimed, so a mid-boot WebGPU
   * failure tears the GPU stack down and rebuilds everything on WebGL 2 with a
   * fresh canvas. The preference is persisted so the next boot goes straight to
   * WebGL 2.
   */
  private async restartOnWebGL2(): Promise<void> {
    try {
      this.post?.dispose();
    } catch {
      // ignore
    }
    try {
      this.renderer.dispose();
    } catch {
      // ignore
    }

    const oldCanvas = this.canvas;
    const fresh = document.createElement("canvas");
    fresh.id = "game-canvas";
    fresh.setAttribute("aria-label", "Game viewport");
    oldCanvas.replaceWith(fresh);
    this.canvas = fresh;

    this.settings.preferWebGPU = false;
    void this.save.saveSettings(this.settings);
    await this.buildRenderStack(false);
    this.ui.toast("Running on WebGL 2 (WebGPU unsupported by this driver)", "info");
  }

  private installGlobalHandlers(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.canvas.addEventListener("mousedown", this.handleCanvasMouseDown);
    this.input.onGameKey((code) => {
      if (code === "KeyC" && this.mode === "playing" && !this.modalOpen) this.toggleCamera();
    });
  }

  private handleResize = (): void => {
    this.renderer.resize();
    this.ui.resizeMinimap();
  };

  private handleVisibility = (): void => {
    if (document.hidden && this.mode === "playing" && !this.modalOpen) {
      void this.saveGame(false);
      this.pauseGame();
    }
  };

  private handleCanvasMouseDown = (): void => {
    if (this.mode === "playing" && !this.modalOpen && !this.dialogueActive) {
      this.input.requestPointerLock();
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.mode === "boot") return;
    if (event.code === "Escape") {
      event.preventDefault();
      this.onEscape();
      return;
    }
    if (this.dialogueActive) {
      if (event.code === "KeyE" || event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        this.ui.advanceDialogue();
      }
      return;
    }
    if (this.mode !== "playing" || this.modalOpen) return;
    switch (event.code) {
      case "KeyE":
        event.preventDefault();
        this.interact();
        break;
      case "KeyF":
        event.preventDefault();
        if (this.activeVehicle) this.exitVehicle();
        break;
      case "KeyM":
        event.preventDefault();
        this.toggleMap();
        break;
      case "Tab":
        event.preventDefault();
        this.toggleInventory();
        break;
      case "KeyC":
        event.preventDefault();
        this.toggleCamera();
        break;
      default:
        break;
    }
  };

  private onEscape(): void {
    if (this.dialogueActive) {
      this.ui.closeDialogue(true);
      return;
    }
    if (this.ui.hasOverlay()) {
      this.closeOverlay();
      return;
    }
    if (this.mode === "playing") this.pauseGame();
    else if (this.mode === "paused") this.resumeGame();
  }

  /* ---------------------------------------------------------------- */
  /* Loop                                                              */
  /* ---------------------------------------------------------------- */

  private tick = (): void => {
    const dtRaw = Math.min(0.05, this.renderer.engine.getDeltaTime() / 1000);
    const dt = dtRaw || 0.016;

    if (this.mode === "menu") this.updateMenu(dt);
    else if (this.mode === "playing") this.updatePlaying(dt);
    else this.updatePaused(dt);

    this.fpsFrames += 1;
    this.fpsTimer += dt;
    if (this.fpsTimer > 0.6) {
      this.fps = this.fpsFrames / this.fpsTimer;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }
    this.quality.update(dtRaw * 1000);
    this.renderer.scene.render();
  };

  private updateMenu(dt: number): void {
    const cam = this.cameraCtl.camera;
    cam.alpha += dt * 0.035;
    cam.beta += (1.06 - cam.beta) * Math.min(1, dt * 1.5);
    cam.radius += (92 - cam.radius) * Math.min(1, dt * 1.5);
    cam.target.set(56, 16, -58);

    const focus = new Vector3(56, 0, -58);
    this.weather.update(dt * 0.08, focus);
    this.world.applyNight(this.world.sky.nightFactor);
    this.world.update(dt, focus, 620);
    this.post.setFocusDistance(cam.radius);
    this.audio.setRain(this.weather.rain);
  }

  private updatePaused(dt: number): void {
    this.world.applyNight(this.world.sky.nightFactor);
    this.audio.setEngine(false, 0);
    void dt;
  }

  private updatePlaying(dt: number): void {
    const simulating = !this.modalOpen && !this.dialogueActive;

    this.weather.update(dt, this.player.position);
    this.world.applyNight(this.world.sky.nightFactor);
    this.audio.setRain(this.weather.rain);

    if (simulating) {
      this.vehicles.update(dt, this.input, this.world, this.weather.hour);

      if (this.activeVehicle) {
        const v = this.activeVehicle;
        this.player.position.copyFrom(v.position);
        this.player.avatar.setVisible(false);
        this.player.avatar.setPosition(v.position.x, v.position.y, v.position.z);
        const focus = v.position.add(new Vector3(0, 1.5, 0));
        const autoYaw = Math.atan2(-Math.cos(v.heading), -Math.sin(v.heading));
        this.cameraCtl.update(dt, this.input, focus, this.world, autoYaw);
        this.ui.setSpeed(v.speedKmh);
        this.audio.setEngine(true, v.speedKmh);
        this.ui.setPrompt("F — Exit " + v.spec.name);
      } else {
        this.player.avatar.setVisible(true);
        this.player.update(dt, this.input, this.world, this.cameraCtl.forward);
        const focus = this.player.position.add(new Vector3(0, 1.45, 0));
        this.cameraCtl.update(dt, this.input, focus, this.world);
        this.ui.setSpeed(null);
        this.audio.setEngine(false, 0);
        this.updatePrompt();
      }

      this.npcs.update(dt, this.world, this.weather.hour, this.player.position);
      this.police.update(dt, this.player.position, this.economy);
      this.world.update(dt, this.player.position, this.quality.profile.renderDistance);
      this.post.setFocusDistance(this.cameraCtl.radius);
      this.updateMissionMarker(dt);
      this.saveTimer += dt;
      if (this.saveTimer > 45) {
        this.saveTimer = 0;
        void this.saveGame(false);
      }
    }

    this.hudTimer += dt;
    if (this.hudTimer > 0.25) {
      this.hudTimer = 0;
      this.ui.setClock(this.weather.clockLabel, this.weather.weatherLabel);
      this.updateDistrict();
    }

    this.minimapTimer += dt;
    if (this.minimapTimer > 0.1) {
      this.minimapTimer = 0;
      this.ui.updateMinimap({
        player: this.player.position,
        facing: this.player.facing,
        npcs: this.npcs.npcs.map((n) => n.position),
        vehicles: this.vehicles.vehicles.map((v) => v.position),
        missionTarget: this.missions.markerPosition(),
        hour: this.weather.hour,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Interaction                                                       */
  /* ---------------------------------------------------------------- */

  private updatePrompt(): void {
    let text: string | null = null;
    const npc = this.npcs.closest(this.player.position, 3.4);
    if (npc) {
      text = `Talk to ${npc.spec.name}`;
    } else {
      const vehicle = this.vehicles.nearest(this.player.position, 4.6);
      if (vehicle) {
        text = vehicle.owned ? `Drive ${vehicle.spec.name}` : `Steal ${vehicle.spec.name}`;
      } else {
        const item = this.world.getInteractable(this.player.position, 3.0);
        if (item) text = item.label;
      }
    }
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      this.ui.setPrompt(text);
    }
  }

  interact(): void {
    if (this.mode !== "playing" || this.modalOpen) return;
    if (this.dialogueActive) {
      this.ui.advanceDialogue();
      return;
    }
    if (this.activeVehicle) {
      this.exitVehicle();
      return;
    }
    const npc = this.npcs.nearest(this.player.position, 3.4);
    if (npc) {
      this.talkTo(npc);
      return;
    }
    const vehicle = this.vehicles.nearest(this.player.position, 4.6);
    if (vehicle) {
      this.enterVehicle(vehicle);
      return;
    }
    const item = this.world.getInteractable(this.player.position, 3.0);
    if (item) this.useInteractable(item);
  }

  private talkTo(npc: Npc): void {
    const missionLines = this.missions.linesFor(npc);
    const lines = missionLines ?? npc.getDialogue(this.weather.hour);
    const stage = this.missions.stage;
    const isGiver = npc.spec.id === MISSION.giver;
    const isTarget = npc.spec.id === MISSION.target;

    this.ui.showDialogue({
      speaker: npc.spec.name,
      role: npc.spec.role,
      accent: npc.spec.accent,
      lines,
      onDone: () => {
        this.npcs.endConversation(npc);
        if (isGiver && stage === "available") {
          this.missions.accept();
          this.inventory.add("parcel");
          this.ui.setMission(this.missions.snapshot());
          this.ui.toast("Mission accepted — collect the case from Deke", "good");
          this.audio.success();
          this.refreshMarker();
        } else if (isTarget && stage === "go-to-deke") {
          this.missions.deliver();
          this.ui.setMission(this.missions.snapshot());
          this.ui.toast("Case collected — return it to Mara", "good");
          this.audio.success();
          this.refreshMarker();
        } else if (isGiver && stage === "return-to-mara") {
          if (this.missions.turnIn()) {
            this.inventory.remove("parcel");
            this.economy.add(MISSION.reward, "Mission: " + MISSION.title);
            this.ui.setMission(this.missions.snapshot());
            this.ui.toast(`Mission complete · +$${MISSION.reward}`, "good");
            this.audio.success();
            this.refreshMarker();
            void this.saveGame(false);
          }
        }
      },
    });
  }

  private enterVehicle(vehicle: Vehicle): void {
    vehicle.enter();
    this.activeVehicle = vehicle;
    this.player.inVehicle = true;
    this.player.avatar.setVisible(false);
    this.cameraCtl.setMode("far");
    this.ui.setPrompt(null);
    this.audio.uiClick();
    if (!vehicle.owned) {
      this.police.reportCrime(1);
      this.ui.toast("Vehicle reported stolen — police alerted", "bad");
    } else {
      this.ui.toast(`Driving ${vehicle.spec.name}`);
    }
  }

  private exitVehicle(): void {
    const vehicle = this.activeVehicle;
    if (!vehicle) return;
    vehicle.exit();
    const door = vehicle.doorPosition;
    door.y = this.world.groundHeight(door.x, door.z);
    this.player.teleport(door.x, door.y, door.z);
    this.world.resolveCollisions(this.player.position, this.player.radius);
    this.player.inVehicle = false;
    this.player.avatar.setVisible(true);
    this.player.avatar.setPosition(this.player.position.x, this.player.position.y, this.player.position.z);
    this.activeVehicle = null;
    this.cameraCtl.setMode("near");
    this.ui.setSpeed(null);
    this.audio.setEngine(false, 0);
    void this.saveGame(false);
  }

  private useInteractable(item: Interactable): void {
    switch (item.kind) {
      case "door": {
        const spawn = this.world.enterInterior();
        this.player.teleport(spawn.x, spawn.y, spawn.z);
        this.player.avatar.setVisible(true);
        this.cameraCtl.snapTo(new Vector3(spawn.x, spawn.y + 1.45, spawn.z), 4.6);
        this.ui.setLocation("Skyline Residences");
        this.ui.toast("Apartment 12B — home at last");
        this.audio.uiClick();
        break;
      }
      case "exit": {
        const outside = this.world.exitInterior();
        this.player.teleport(outside.x, outside.y, outside.z);
        this.cameraCtl.snapTo(new Vector3(outside.x, outside.y + 1.45, outside.z), 5.4);
        this.ui.setLocation("Harborview Plaza");
        this.audio.uiClick();
        break;
      }
      case "bed": {
        const hour = this.weather.hour;
        let delta = 7 - hour;
        if (delta <= 0) delta += 24;
        this.weather.hydrate(this.weather.clockMinutes + delta * 60);
        this.audio.success();
        this.ui.toast("You slept until 07:00. Progress saved.", "good");
        this.ui.setClock(this.weather.clockLabel, this.weather.weatherLabel);
        void this.saveGame(false);
        break;
      }
      case "wardrobe": {
        this.ui.openInventory();
        this.ui.toast("Wardrobe open — wear any clothing you own");
        break;
      }
      case "computer": {
        this.ui.showDialogue({
          speaker: "NATION NET",
          role: "Apartment terminal",
          accent: "#59d7ff",
          lines: [
            "WELCOME HOME, RESIDENT 12B.",
            "Metropolis is online. Harborview District is the only region currently simulated in this build.",
            "Five cities are mapped but not yet streamed: Industrial, Coastal, Historical, Military and Adventure.",
            "Balance synced. Mission work available from local fixers.",
          ],
        });
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* World state                                                       */
  /* ---------------------------------------------------------------- */

  private buildMissionMarker(): void {
    this.markerRoot = new TransformNode("missionMarker", this.scene);
    this.markerRing = MeshBuilder.CreateTorus(
      "missionRing",
      { diameter: 3.4, thickness: 0.18, tessellation: 32 },
      this.scene,
    );
    this.markerRing.parent = this.markerRoot;
    this.markerRing.position.y = 0.15;
    const ringMat = new StandardMaterial("missionRingMat", this.scene);
    ringMat.emissiveColor = new Color3(0.95, 0.7, 0.24);
    ringMat.diffuseColor = new Color3(0.4, 0.28, 0.08);
    ringMat.alpha = 0.92;
    this.markerRing.material = ringMat;
    this.markerRing.isPickable = false;

    const beam = MeshBuilder.CreateCylinder(
      "missionBeam",
      { height: 30, diameterTop: 1.2, diameterBottom: 2.4, tessellation: 20 },
      this.scene,
    );
    beam.parent = this.markerRoot;
    beam.position.y = 15;
    const beamMat = new StandardMaterial("missionBeamMat", this.scene);
    beamMat.emissiveColor = new Color3(0.95, 0.7, 0.24);
    beamMat.diffuseColor = new Color3(0.1, 0.08, 0.02);
    beamMat.alpha = 0.16;
    beamMat.backFaceCulling = false;
    beam.material = beamMat;
    beam.isPickable = false;
    this.markerRoot.setEnabled(false);
  }

  private updateMissionMarker(dt: number): void {
    const target = this.missions.markerPosition();
    if (!target || this.world.interiorActive) {
      this.markerRoot.setEnabled(false);
      return;
    }
    this.markerRoot.setEnabled(true);
    this.markerRoot.position.set(target.x, 0, target.z);
    this.markerRing.rotation.y += dt * 1.2;
    const pulse = 1 + Math.sin(performance.now() * 0.0035) * 0.09;
    this.markerRing.scaling.setAll(pulse);
  }

  private refreshMarker(): void {
    this.refreshMarkerState();
  }

  private refreshMarkerState(): void {
    this.updateMissionMarker(0);
  }

  private updateDistrict(): void {
    let name = "Harborview";
    let closest = 48;
    for (const poi of METROPOLIS.pois) {
      const d = Math.hypot(this.player.position.x - poi.x, this.player.position.z - poi.z);
      if (d < closest) {
        closest = d;
        name = poi.name;
      }
    }
    if (name !== this.lastDistrict) {
      this.lastDistrict = name;
      this.ui.setLocation(name);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Session lifecycle                                                 */
  /* ---------------------------------------------------------------- */

  async startNewGame(appearance: Appearance): Promise<void> {
    await this.audio.start();
    this.character = { ...appearance };
    this.ui.hideMenu();
    this.ui.closeOverlays();
    this.ui.showHud();
    this.ui.setTouchVisible(true);
    this.mode = "playing";

    this.economy.hydrate(500, 1250);
    this.inventory.hydrate([]);
    this.missions.reset();
    this.weather.hydrate(9 * 60 + 20);
    this.police.clear();
    this.ui.setWanted(0);
    this.world.exitInterior();

    this.player.setAppearance(this.character);
    const spawn = this.world.spawnPoint;
    this.player.spawn(spawn, METROPOLIS.spawn.heading);
    this.player.avatar.setVisible(true);
    this.activeVehicle?.exit();
    this.activeVehicle = null;
    this.setModalOpen(false);
    this.setDialogueOpen(false);

    const forward = new Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    this.cameraCtl.alpha = Math.atan2(-forward.z, -forward.x);
    this.cameraCtl.beta = 1.22;
    this.cameraCtl.setMode("near");
    this.cameraCtl.snapTo(this.player.position.add(new Vector3(0, 1.45, 0)), 5.4);

    this.vehicles.vehicles.find((v) => v.owned)?.repair();
    this.ui.setMission(this.missions.snapshot());
    this.ui.setClock(this.weather.clockLabel, this.weather.weatherLabel);
    this.updateDistrict();
    this.ui.toast("Click the world to capture the mouse · W A S D to move", "info");
    this.startPointerLockPending = true;
    window.setTimeout(() => {
      if (this.startPointerLockPending && this.mode === "playing") {
        this.input.requestPointerLock();
        this.startPointerLockPending = false;
      }
    }, 250);
  }

  async continueGame(): Promise<void> {
    const data = this.save.lastSave ?? (await this.save.loadSave());
    if (!data) {
      this.ui.toast("No saved session found", "bad");
      return;
    }
    await this.audio.start();
    this.ui.hideMenu();
    this.ui.closeOverlays();
    this.ui.showHud();
    this.ui.setTouchVisible(true);
    this.mode = "playing";

    this.character = { ...DEFAULT_APPEARANCE, ...data.appearance };
    this.player.setAppearance(this.character);
    this.economy.hydrate(data.cash, data.bank);
    this.inventory.hydrate(data.inventory ?? []);
    this.missions.hydrate(data.missionStage);
    this.weather.hydrate(data.clockMinutes);
    this.police.clear();
    this.ui.setWanted(0);

    if (data.insideInterior) {
      const spawn = this.world.enterInterior();
      this.player.spawn(new Vector3(spawn.x, spawn.y, spawn.z), 0);
    } else {
      this.world.exitInterior();
      this.player.spawn(new Vector3(data.position.x, data.position.y, data.position.z), data.facing);
    }
    this.player.avatar.setVisible(true);
    this.activeVehicle = null;

    if (data.ownedVehicle) {
      const owned = this.vehicles.vehicles.find((v) => v.id === data.ownedVehicle?.id);
      if (owned) {
        owned.position.set(data.ownedVehicle.x, this.world.groundHeight(data.ownedVehicle.x, data.ownedVehicle.z), data.ownedVehicle.z);
        owned.heading = data.ownedVehicle.heading;
        owned.root.position.copyFrom(owned.position);
        owned.root.rotation.y = owned.heading;
      }
    }

    this.setModalOpen(false);
    this.setDialogueOpen(false);
    const forward = new Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    this.cameraCtl.alpha = Math.atan2(-forward.z, -forward.x);
    this.cameraCtl.beta = 1.22;
    this.cameraCtl.setMode("near");
    this.cameraCtl.snapTo(this.player.position.add(new Vector3(0, 1.45, 0)), 5.4);

    this.ui.setMission(this.missions.snapshot());
    this.ui.setClock(this.weather.clockLabel, this.weather.weatherLabel);
    this.updateDistrict();
    this.ui.toast("Session restored", "good");
    this.startPointerLockPending = true;
    window.setTimeout(() => {
      if (this.startPointerLockPending && this.mode === "playing") {
        this.input.requestPointerLock();
        this.startPointerLockPending = false;
      }
    }, 300);
  }

  pauseGame(): void {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.ui.setPrompt(null);
    this.ui.setSpeed(null);
    this.audio.setEngine(false, 0);
    this.ui.showPause();
    void this.saveGame(false);
  }

  resumeGame(): void {
    if (this.mode === "menu") return;
    this.ui.closeOverlays();
    this.mode = "playing";
    this.modalOpen = false;
    this.input.enabled = !this.dialogueActive;
    if (!this.dialogueActive) this.input.requestPointerLock();
  }

  closeOverlay(): void {
    const wasPause = this.ui.overlay === "pause";
    this.ui.closeOverlays();
    if (this.mode === "paused") {
      this.setModalOpen(false);
      if (!wasPause) {
        this.ui.showPause();
        this.setModalOpen(true);
        return;
      }
      this.resumeGame();
    } else {
      this.setModalOpen(false);
    }
  }

  quitToMenu(): void {
    void this.saveGame(false);
    this.ui.closeOverlays();
    this.ui.closeDialogue(true);
    this.ui.hideHud();
    this.ui.setTouchVisible(false);
    this.ui.setPrompt(null);
    if (this.activeVehicle) this.exitVehicle();
    this.input.exitPointerLock();
    this.input.enabled = false;
    this.audio.setEngine(false, 0);
    this.mode = "menu";
    this.setupMenuCamera();
    this.ui.showMenu(this.save.hasSave);
    this.ui.setMenuMeta(
      this.renderer.backendNote,
      QUALITY_PRESETS[this.settings.quality].label,
      this.save.lastSave?.savedAt ?? null,
    );
  }

  private setupMenuCamera(): void {
    const cam = this.cameraCtl.camera;
    cam.target.set(56, 16, -58);
    cam.radius = 92;
    cam.alpha = -1.1;
    cam.beta = 1.06;
    this.input.enabled = false;
    this.ui.setTouchVisible(false);
  }

  setModalOpen(open: boolean): void {
    this.modalOpen = open;
    this.input.enabled = !open && this.mode === "playing" && !this.dialogueActive;
    if (open) this.input.exitPointerLock();
  }

  setDialogueOpen(open: boolean): void {
    this.dialogueActive = open;
    this.input.enabled = !open && !this.modalOpen && this.mode === "playing";
    if (open) this.input.exitPointerLock();
  }

  toggleMap(): void {
    if (this.mode !== "playing" && this.mode !== "paused") return;
    if (this.ui.overlay === "map") this.closeOverlay();
    else this.ui.openMap();
  }

  toggleInventory(): void {
    if (this.mode !== "playing" && this.mode !== "paused") return;
    if (this.ui.overlay === "inventory") this.closeOverlay();
    else this.ui.openInventory();
  }

  toggleCamera(): void {
    if (this.mode !== "playing") return;
    const mode = this.cameraCtl.cycleMode();
    this.player.avatar.setVisible(mode !== "first" && !this.activeVehicle);
    this.ui.toast(`Camera: ${mode === "first" ? "first person" : mode === "far" ? "far chase" : "close chase"}`);
  }

  toggleFullscreen(): void {
    const doc = document;
    if (!doc.fullscreenElement) {
      void doc.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      void doc.exitFullscreen?.();
    }
  }

  equipItem(id: string): void {
    const shirt =
      id === "jacket" ? "#3f4a3d" : id === "formal" ? "#dfe4ea" : id === "sport" ? "#3f6b57" : null;
    if (!shirt) return;
    this.character = { ...this.character, shirt };
    this.player.setAppearance(this.character);
    this.ui.toast("Outfit changed", "good");
    this.audio.uiClick();
    void this.saveGame(false);
  }

  setQuality(preset: QualityPreset): void {
    this.settings.quality = preset;
    this.quality.applyPreset(preset, this.settings.adaptiveResolution);
    void this.save.saveSettings(this.settings);
    this.ui.toast(`Graphics preset: ${QUALITY_PRESETS[preset].label}`);
  }

  updateSettings(partial: Partial<Settings>): void {
    this.settings = { ...this.settings, ...partial };
    if (partial.masterVolume !== undefined) this.audio.setVolume(this.settings.masterVolume);
    if (partial.adaptiveResolution !== undefined) {
      this.quality.applyPreset(this.settings.quality, this.settings.adaptiveResolution);
    }
    if (partial.mouseSensitivity !== undefined) {
      // Read by the camera each frame via the shared settings object.
    }
    void this.save.saveSettings(this.settings);
  }

  private applyProfile(profile: QualityProfile): void {
    if (this.post) this.post.applyProfile(profile);
    if (this.scene) this.scene.shadowsEnabled = profile.shadows;
    if (this.world) this.world.sky.setRenderDistance(profile.renderDistance);
  }

  async saveGame(notify: boolean): Promise<void> {
    if (this.mode === "menu" || this.mode === "boot") return;
    const owned = this.vehicles.vehicles.find((v) => v.owned);
    const data: SaveData = {
      version: 1,
      savedAt: Date.now(),
      appearance: this.character,
      position: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
      },
      facing: this.player.facing,
      cash: this.economy.cash,
      bank: this.economy.bank,
      inventory: this.inventory.serialize(),
      missionStage: this.missions.stage,
      clockMinutes: this.weather.clockMinutes,
      insideInterior: this.world.interiorActive,
      ownedVehicle: owned
        ? { id: owned.id, x: owned.position.x, z: owned.position.z, heading: owned.heading }
        : null,
    };
    const ok = await this.save.save(data);
    this.ui.setMenuMeta(
      this.renderer.backendNote,
      QUALITY_PRESETS[this.settings.quality].label,
      this.save.lastSave?.savedAt ?? null,
    );
    if (notify) {
      this.ui.toast(ok ? "Progress saved" : "Could not write save data", ok ? "good" : "bad");
      if (ok) this.audio.uiClick();
    }
  }

  get activeVehicleName(): string | null {
    return this.activeVehicle?.spec.name ?? null;
  }
}
