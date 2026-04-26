// gameLoop.js — ported from make-your-game, adapted for 4-player multiplayer
// Removed: enemy AI, story/video triggers, score/difficulty display, single-player HUD
// Added: multi-player collision, winner detection, power-up effects per player

import { entities, bricks, tileMap2D, COLS, ROWS } from "./classes.js";
import { Player, Bomb, Explosion, PowerUp } from "./classes.js";
import { playerHit, checkWinner } from "./gameState.js";
import { PlayPowerUpSound, PlayLevelClearedSound } from "./audio.js";
import { emit } from "../../framework/index.js";

let lastTime      = 0;
let fpsCounter    = 0;
let fps           = 0;
let lastFpsUpdate = 0;
let rafId         = null;
let running       = false;

export let players = []; // set by buildMap

export function setPlayers(playerArray) {
  players = playerArray;
}

export function startGameLoop() {
  if (running) return;
  running  = true;
  lastTime = performance.now();
  lastFpsUpdate = lastTime;
  rafId = requestAnimationFrame(gameLoop);
}

export function stopGameLoop() {
  running = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function gameLoop(time) {
  if (!running) return;

  const delta = time - lastTime;
  lastTime = time;

  // FPS counter
  fpsCounter++;
  if (time - lastFpsUpdate >= 1000) {
    fps = fpsCounter;
    fpsCounter = 0;
    lastFpsUpdate = time;
    const fpsEl = document.getElementById("fps");
    if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
  }

  // 1. Update players
  for (const p of players) {
    if (p.alive) p.update(delta);
  }

  // 2. Update bombs, explosions
  const snapshot = [...entities]; // iterate a copy — entities may mutate during update
  for (const e of snapshot) {
    if (e instanceof Bomb || e instanceof Explosion) e.update(delta);
  }

  // 3. Collision checks
  const snapshot2 = [...entities];
  for (const e of snapshot2) {
    if (e instanceof Explosion) {
      // Explosion vs players
      for (const p of players) {
        if (p.alive && collision(e.bounds, p.bounds)) {
          playerHit(p);
        }
      }
    }

    if (e instanceof PowerUp && !e.collected) {
      for (const p of players) {
        if (p.alive && collision(p.bounds, e.bounds)) {
          collectPowerUp(p, e);
        }
      }
    }
  }

  // Player vs player — no damage (classic bomberman: only explosions hurt)

  // 4. Clean up collected power-ups
  entities.splice(0, entities.length, ...entities.filter(e => {
    if (e instanceof PowerUp && e.collected) return false;
    return true;
  }));

  // 5. Check for winner
  const winner = checkWinner(players);
  if (winner !== null) {
    stopGameLoop();
    emit("game:over", winner);
    return;
  }

  rafId = requestAnimationFrame(gameLoop);
}

// ─── AABB collision (3px shrink to allow tight corridors) ─────────────────────
export function collision(a, b) {
  return (
    a.x < b.x + (b.width  - 3) &&
    a.x + a.width  - 3 > b.x   &&
    a.y < b.y + (b.height - 3) &&
    a.y + a.height - 3 > b.y
  );
}

// ─── Power-up effects ─────────────────────────────────────────────────────────
function collectPowerUp(player, powerUp) {
  PlayPowerUpSound();
  switch (powerUp.type) {
    case "powerBomb":  player.maxBombs++;   break;
    case "powerFlame": player.bombRadius++; break;
    case "powerSpeed": player.speed = Math.min(player.speed + 30, 220); break;
  }
  powerUp.el.remove();
  powerUp.collected = true;
  emit("hud:update");
}
