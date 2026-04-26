// Legend:
//   X  = indestructible wall
//   B  = destructible brick (randomly generated at runtime)
//   ' '= floor
//   1,2,3,4 = player spawn corners (treated as floor, players placed separately)
//
// Map is 17 cols × 13 rows — keeps 32px tiles within most screens.
// Corners are kept clear (3×3 safe zone) so players can survive their own bomb.

export const BASE_MAP = [
  "XXXXXXXXXXXXXXXXX",
  "X1  B   B   B  2X",
  "X X B X B X B X X",
  "X   B   B   B   X",
  "X X X X X X X X X",
  "X B   B   B   B X",
  "X X B X   X B X X",
  "X B   B   B   B X",
  "X X X X X X X X X",
  "X   B   B   B   X",
  "X X B X B X B X X",
  "X3  B   B   B  4X",
  "XXXXXXXXXXXXXXXXX",
];

// The four corner spawn positions (tile coordinates)
export const SPAWN_POSITIONS = [
  { x: 1, y: 1 },   // player 1 — top-left
  { x: 15, y: 1 },  // player 2 — top-right
  { x: 1, y: 11 },  // player 3 — bottom-left
  { x: 15, y: 11 }, // player 4 — bottom-right
];

export const COLS = BASE_MAP[0].length;
export const ROWS = BASE_MAP.length;

// Returns a fresh 2D char array with random brick placement.
// Corners (3×3 around each spawn) are always kept clear so players can survive.
export function generateTileMap() {
  const map = BASE_MAP.map(row => row.split(""));

  // Tiles that must stay floor (safe zones around spawns)
  const safe = new Set();
  for (const { x, y } of SPAWN_POSITIONS) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        safe.add(`${x + dx},${y + dy}`);
      }
    }
  }

  // Randomly place bricks on floor tiles that aren't in safe zones
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (map[y][x] === " " && !safe.has(`${x},${y}`)) {
        if (Math.random() < 0.5) map[y][x] = "B";
      }
      // Replace spawn markers with floor
      if (["1","2","3","4"].includes(map[y][x])) map[y][x] = " ";
    }
  }

  return map;
}
