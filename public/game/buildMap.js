// buildMap.js — constructs the game board and spawns players
// Called once when the game view is rendered.

import { Tile, Entity, Player, PowerUp, setGameContainer,
         entities, bricks, tileMap2D } from "./classes.js";
import { generateTileMap, SPAWN_POSITIONS, COLS, ROWS } from "./mapData.js";
import { setPlayers } from "./gameLoop.js";

// playerDefs: array of { playerIndex, nickname, isLocal }
// container: the #game DOM element
// serverMap: optional []string from server (ensures all clients share the same map)
export function buildMap(container, playerDefs, serverMap = null) {
  // Wire the container for Tile / Entity constructors
  setGameContainer(container);

  // Reset shared arrays
  entities.length = 0;
  bricks.length   = 0;
  container.innerHTML = "";

  // Set grid dimensions via CSS vars
  container.style.setProperty("--cols", COLS);
  container.style.setProperty("--rows", ROWS);

  // Use server-provided map if available, otherwise generate locally
  const map = serverMap
    ? serverMap.map(row => row.split(""))
    : generateTileMap();
  // Copy into the exported tileMap2D reference
  tileMap2D.length = 0;
  for (const row of map) tileMap2D.push(row);

  // Build tiles
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = map[y][x];
      if (c === "X") {
        new Tile(x, y, "wall");
      } else if (c === "B" || c === "b" || c === "f" || c === "s") {
        const t = new Tile(x, y, "brick");
        bricks.push(t);
      } else {
        new Tile(x, y, "floor");
      }
    }
  }

  // Spawn players at their corner positions
  const playerObjects = [];
  for (const def of playerDefs) {
    const spawn = SPAWN_POSITIONS[def.playerIndex];
    if (!spawn) continue;
    const p = new Player(spawn.x, spawn.y, def.playerIndex, tileMap2D);
    entities.push(p);
    playerObjects.push(p);
  }

  setPlayers(playerObjects);
  return playerObjects;
}
