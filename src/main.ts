import "./styles.css";
import { Game } from "./core/Game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Game canvas missing from document");

const game = new Game(canvas);

game.boot().catch((error: unknown) => {
  console.error("[NATION] boot failed", error);
  const message = error instanceof Error ? error.message : String(error);
  const stage = document.getElementById("load-stage");
  const detail = document.getElementById("load-detail");
  if (stage) stage.textContent = "Unable to start";
  if (detail) {
    detail.style.color = "#ff6b6b";
    detail.textContent =
      `This browser could not initialise the 3D renderer (${message}). ` +
      "Try a recent Chrome, Edge, Firefox or Safari build with WebGL 2 enabled.";
  }
});

declare global {
  interface Window {
    nationGame?: Game;
  }
}
window.nationGame = game;
