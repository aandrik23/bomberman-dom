// classes.js — ported from make-your-game, adapted for multiplayer bomberman-dom
// Changes vs original:
//   - Tile and Entity accept a `container` element instead of querying #game directly
//   - Enemy class removed (players are human, controlled via WebSocket or local input)
//   - Objective (key/port) removed — single-player mechanic not needed
//   - Player supports a `playerIndex` (0-3) for sprite / color differentiation
//   - PowerUp types: "powerBomb" | "powerFlame" | "powerSpeed"

import { ExplosionSound } from "./audio.js";

// ─── Module-level state (set by buildMap) ─────────────────────────────────────
export let entities = [];
export let bricks   = [];
export let tileMap2D = [];
export let COLS = 0;
export let ROWS = 0;
let gameContainer = null;

export function setGameContainer(container) {
  gameContainer = container;
}

export function updateTileMap2D(x, y, char) {
  tileMap2D[y][x] = char;
}

// ─── Tile ─────────────────────────────────────────────────────────────────────
export class Tile {
  constructor(x, y, cssClass) {
    this.tile = document.createElement("div");
    this.tile.classList.add("tile", cssClass);
    this.tile.dataset.x = x;
    this.tile.dataset.y = y;
    gameContainer.appendChild(this.tile);
    this.x = x;
    this.y = y;
    this.cssClass = cssClass;
  }
}

// ─── Entity (base) ────────────────────────────────────────────────────────────
export class Entity {
  constructor(x, y, cssClass) {
    this.x = x;
    this.y = y;
    this.posX = x * 32;
    this.posY = y * 32;
    this.speed = 100;

    this.targetX = x;
    this.targetY = y;
    this.dirX = 0;
    this.dirY = 0;

    this.el = document.createElement("div");
    this.el.classList.add("tile", cssClass);
    this.el.style.position = "absolute";
    this.el.style.width = "32px";
    this.el.style.height = "32px";
    this.updatePosition();
    gameContainer.appendChild(this.el);
  }

  get width()  { return 32; }
  get height() { return 32; }

  get bounds() {
    return { x: this.posX, y: this.posY, width: this.width, height: this.height };
  }

  updatePosition() {
    this.el.style.left = `${this.posX}px`;
    this.el.style.top  = `${this.posY}px`;
  }

  move(delta) {
    const step = this.speed * (delta / 1000);
    const dx = this.targetX * 32 - this.posX;
    const dy = this.targetY * 32 - this.posY;

    if (Math.abs(dx) < step && Math.abs(dy) < step) {
      this.posX = this.targetX * 32;
      this.posY = this.targetY * 32;
      this.chooseDirection();
    } else {
      const angle = Math.atan2(dy, dx);
      this.posX += Math.cos(angle) * step;
      this.posY += Math.sin(angle) * step;
    }

    this.updatePosition();
  }

  chooseDirection() {}
}

// ─── Player ───────────────────────────────────────────────────────────────────
// playerIndex: 0-3, used for CSS class (player-0 … player-3) and spawn position
export class Player extends Entity {
  constructor(x, y, playerIndex, tileMap) {
    super(x, y, `player`);
    this.el.classList.add(`player-${playerIndex}`);
    this.playerIndex = playerIndex;
    this.tileMap = tileMap;

    this.nextDir = { dx: 0, dy: 0 };
    this.dir     = { dx: 0, dy: 0 };

    this.bombs      = [];
    this.bombRadius = 1;
    this.maxBombs   = 1;

    this.startX = x;
    this.startY = y;

    this.lives = 3;
    this.alive = true;

    // Invulnerability (after being hit)
    this.invulnerable    = false;
    this.invulTimer      = 0;
    this.invulDuration   = 2500;
    this.flickerElapsed  = 0;
    this.flickerInterval = 200;
  }

  resetPosition() {
    this.x = this.startX;
    this.y = this.startY;
    this.targetX = this.startX;
    this.targetY = this.startY;
    this.posX = this.startX * 32;
    this.posY = this.startY * 32;
    this.updatePosition();
  }

  activateInvulnerability() {
    this.invulnerable   = true;
    this.invulTimer     = 0;
    this.flickerElapsed = 0;
  }

  dropBomb() {
    // Remove references to bombs already gone from the world
    this.bombs = this.bombs.filter(b => entities.includes(b));
    if (this.bombs.length >= this.maxBombs) return;

    const tileSize = 32;
    const offsetX  = this.posX - this.x * tileSize;
    const offsetY  = this.posY - this.y * tileSize;

    let bombX = this.x;
    let bombY = this.y;
    if (offsetX >  tileSize / 2) bombX = this.x + 1;
    if (offsetX < -tileSize / 2) bombX = this.x - 1;
    if (offsetY >  tileSize / 2) bombY = this.y + 1;
    if (offsetY < -tileSize / 2) bombY = this.y - 1;

    const alreadyHasBomb = entities.some(
      e => e instanceof Bomb && e.x === bombX && e.y === bombY
    );
    if (alreadyHasBomb) return;

    const bomb = new Bomb(bombX, bombY, this.bombRadius, this.tileMap);
    entities.push(bomb);
    this.bombs.push(bomb);
  }

  chooseDirection() {
    const newX = this.x + this.nextDir.dx;
    const newY = this.y + this.nextDir.dy;

    const canTurn = this._passable(newX, newY);
    if (canTurn && (this.nextDir.dx !== this.dir.dx || this.nextDir.dy !== this.dir.dy)) {
      this.dir = { ...this.nextDir };
    }

    const fwdX = this.x + this.dir.dx;
    const fwdY = this.y + this.dir.dy;
    if (this._passable(fwdX, fwdY)) {
      this.targetX = fwdX;
      this.targetY = fwdY;
      this.x = fwdX;
      this.y = fwdY;
    }
  }

  _passable(x, y) {
    if (y < 0 || y >= tileMap2D.length || x < 0 || x >= tileMap2D[0].length) return false;
    const c = tileMap2D[y][x];
    if (c === "X" || c === "B" || c === "b" || c === "f" || c === "s") return false;
    if (entities.some(e => e instanceof Bomb && e.x === x && e.y === y)) return false;
    return true;
  }

  update(delta) {
    if (!this.alive) return;

    if (this.invulnerable) {
      this.invulTimer     += delta;
      this.flickerElapsed += delta;

      if (this.flickerElapsed >= this.flickerInterval) {
        this.el.style.visibility = this.el.style.visibility === "hidden" ? "visible" : "hidden";
        this.flickerElapsed = 0;
      }
      if (this.invulTimer >= this.invulDuration) {
        this.invulnerable = false;
        this.invulTimer   = 0;
        this.el.style.visibility = "visible";
      }
    }

    this.move(delta);
  }
}

// ─── Bomb ─────────────────────────────────────────────────────────────────────
export class Bomb extends Entity {
  constructor(x, y, radius, tileMap) {
    super(x, y, "bomb");
    this.fuse    = 3000;
    this.time    = 0;
    this.radius  = radius;
    this.tileMap = tileMap;
  }

  update(delta) {
    this.time += delta;
    if (this.time >= this.fuse) this._explode();
  }

  _explode() {
    this.el.remove();
    spawnExplosions(this.x, this.y, this.radius, this.tileMap);
    const i = entities.indexOf(this);
    if (i > -1) entities.splice(i, 1);
  }
}

// ─── Explosion ────────────────────────────────────────────────────────────────
export class Explosion extends Entity {
  constructor(x, y) {
    super(x, y, "explosion");
    this.fuse = 1000;
    this.time = 0;
  }

  update(delta) {
    this.time += delta;
    if (this.time >= this.fuse) {
      this.el.remove();
      const i = entities.indexOf(this);
      if (i > -1) entities.splice(i, 1);
    }
  }
}

// ─── PowerUp ──────────────────────────────────────────────────────────────────
// type: "powerBomb" | "powerFlame" | "powerSpeed"
export class PowerUp extends Entity {
  constructor(x, y, type) {
    super(x, y, type);
    this.type      = type;
    this.collected = false;
  }
}

// ─── Explosion spawning logic ─────────────────────────────────────────────────
function spawnExplosions(x, y, radius, tileMap2DRef) {
  entities.push(new Explosion(x, y));
  ExplosionSound(1000);

  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];

  dirs.forEach(dir => {
    for (let i = 1; i <= radius; i++) {
      const nx = x + dir.dx * i;
      const ny = y + dir.dy * i;

      if (ny < 0 || ny >= tileMap2DRef.length || nx < 0 || nx >= tileMap2DRef[0].length) break;

      const cell = tileMap2DRef[ny][nx];
      if (cell === "X") break;

      entities.push(new Explosion(nx, ny));

      const isBrick = cell === "B" || cell === "b" || cell === "f" || cell === "s";
      if (isBrick) {
        updateTileMap2D(nx, ny, " ");

        const brickIdx = bricks.findIndex(b => b.x === nx && b.y === ny);
        if (brickIdx !== -1) {
          const brick = bricks[brickIdx];
          brick.tile.className = "tile floor";
          bricks.splice(brickIdx, 1);

          // Power-up type is encoded in the map char (b/f/s); B = no power-up
          const powerUpMap = { b: "powerBomb", f: "powerFlame", s: "powerSpeed" };
          if (powerUpMap[cell]) {
            entities.push(new PowerUp(nx, ny, powerUpMap[cell]));
          }
        }
        break; // explosion stops at first brick
      }
    }
  });
}
