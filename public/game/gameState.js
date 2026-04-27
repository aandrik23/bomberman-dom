// gameState.js — per-player lives tracking for multiplayer
// No difficulty, no global score. Each player has 3 lives.
// Winner is the last player with lives > 0.

import { PlayerHitSound } from "./audio.js";
import { emit } from "../../framework/index.js";

// Keyed by playerIndex (0-3)
const playerLives = {};

export function initPlayerLives(playerIndices) {
  for (const i of playerIndices) {
    playerLives[i] = 3;
  }
}

export function getLives(playerIndex) {
  return playerLives[playerIndex] ?? 0;
}

export function getAllLives() {
  return { ...playerLives };
}

// Returns true if player died (lives hit 0)
export function playerHit(player) {
  if (player.invulnerable) return false;

  PlayerHitSound();
  player.lives--;
  playerLives[player.playerIndex] = player.lives;
  emit("hud:update");

  if (player.lives <= 0) {
    player.alive = false;
    player.el.remove();
    emit("game:playerDied", player.playerIndex);
    return true;
  }

  player.resetPosition();
  player.activateInvulnerability();
  return false;
}

// Returns playerIndex of the winner, or null if game isn't over yet
export function checkWinner(players) {
  const alive = players.filter(p => p.alive);
  if (alive.length === 1) return alive[0].playerIndex;
  if (alive.length === 0) return -1; // draw
  return null;
}

export function killPlayer(playerIndex) {
  playerLives[playerIndex] = 0;
}

export function resetGameState(playerIndices) {
  initPlayerLives(playerIndices);
}
