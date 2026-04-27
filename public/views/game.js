// views/game.js — game view
// Framework renders this view once; the game loop owns the DOM from then on.

import { el, subscribeTo, unsubscribeFrom, emit } from "../../framework/index.js";
import { setView } from "../../framework/index.js";
import { buildMap }        from "../game/buildMap.js";
import { startGameLoop, stopGameLoop } from "../game/gameLoop.js";
import { getAllLives, initPlayerLives, killPlayer } from "../game/gameState.js";
import { startMusic, stopMusic } from "../game/audio.js";
import {
  getMyPlayerIndex,
  getMyNickname,
  getGameStartData,
  sendInput,
  sendChat,
  sendGameOver,
} from "../ws/client.js";

export function renderGameView(container) {
  // ── DOM structure ────────────────────────────────────────────
  const hudEl  = el("div", { id: "hud" });
  const fpsEl  = el("span", { id: "fps", text: "FPS: --" });
  const gameEl = el("div", { id: "game" });

  container.appendChild(el("div", { id: "game-wrap" }, [
    hudEl,
    el("div", {}, [fpsEl]),
    gameEl,
  ]));

  // ── Determine player list from server start message ──────────
  const startData  = getGameStartData();
  const myIndex    = getMyPlayerIndex();

  // If server gave us player data, use it; otherwise fall back to 2-player local dev mode
  const playerDefs = startData
    ? startData.players.map(p => ({ playerIndex: p.playerIndex, nickname: p.nickname }))
    : [
        { playerIndex: 0, nickname: getMyNickname() || "P1" },
        { playerIndex: 1, nickname: "P2" },
      ];

  // Assign a random color to each player's nickname (no red — reserved for system messages)
  const CHAT_COLORS = ["#00e5ff", "#ffd600", "#e040fb", "#00e60c"]; // cyan, yellow, magenta, green
  const shuffled = [...CHAT_COLORS].sort(() => Math.random() - 0.5);
  const nicknameColors = Object.fromEntries(playerDefs.map((p, i) => [p.nickname, shuffled[i]]));

  container.appendChild(buildChatUI(nicknameColors));

  // ── Build map, spawn players, init lives ─────────────────────
  const playerObjects = buildMap(gameEl, playerDefs, startData?.map ?? null);
  initPlayerLives(playerDefs.map(p => p.playerIndex));
  renderHUD(hudEl);

  // Nickname lookup by playerIndex
  const nicknames = Object.fromEntries(playerDefs.map(p => [p.playerIndex, p.nickname]));

  // ── Local player controls ────────────────────────────────────
  const localPlayer = playerObjects.find(p => p.playerIndex === myIndex)
                   ?? playerObjects[0];

  let lastSentDir = { dx: 0, dy: 0 };

  function onKeyDown(e) {
    if (!localPlayer) return;

    let moved = true;
    switch (e.code) {
      case "ArrowUp":    case "KeyW": localPlayer.nextDir = { dx: 0,  dy: -1 }; break;
      case "ArrowDown":  case "KeyS": localPlayer.nextDir = { dx: 0,  dy:  1 }; break;
      case "ArrowLeft":  case "KeyA": localPlayer.nextDir = { dx: -1, dy:  0 }; break;
      case "ArrowRight": case "KeyD": localPlayer.nextDir = { dx:  1, dy:  0 }; break;
      case "Space":
        e.preventDefault();
        localPlayer.dropBomb();
        sendInput(localPlayer.nextDir, true);
        return;
      default: moved = false;
    }
    if (moved) {
      const d = localPlayer.nextDir;
      if (d.dx !== lastSentDir.dx || d.dy !== lastSentDir.dy) {
        lastSentDir = { ...d };
        sendInput(d, false);
      }
    }
  }

  function onKeyUp(e) {
    if (!localPlayer) return;
    const stops = new Set(["ArrowUp","KeyW","ArrowDown","KeyS","ArrowLeft","KeyA","ArrowRight","KeyD"]);
    if (!stops.has(e.code)) return;
    // Only send stop if current nextDir matches this key
    const dir = localPlayer.nextDir;
    if (dir.dx !== 0 || dir.dy !== 0) {
      localPlayer.nextDir = { dx: 0, dy: 0 };
      lastSentDir = { dx: 0, dy: 0 };
      sendInput({ dx: 0, dy: 0 }, false);
    }
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  // ── Remote player inputs ─────────────────────────────────────
  function onRemoteInput({ playerIndex, dir, dropBomb }) {
    const remote = playerObjects.find(p => p.playerIndex === playerIndex);
    if (!remote || remote === localPlayer) return;
    remote.nextDir = dir;
    if (dropBomb) remote.dropBomb();
  }
  subscribeTo("game:remoteInput", onRemoteInput);

  // ── HUD updates (lives changed) ───────────────────────────────
  function onHudUpdate() { renderHUD(hudEl); }
  subscribeTo("hud:update", onHudUpdate);

  // ── Player died (explosion) ───────────────────────────────────
  function onPlayerDied(playerIndex) {
    const name = nicknames[playerIndex] ?? `P${playerIndex + 1}`;
    emit("chat:system", `💀 ${name} was eliminated!`);
  }
  subscribeTo("game:playerDied", onPlayerDied);

  // ── Player disconnected ───────────────────────────────────────
  function onPlayerLeft({ playerIndex, nickname }) {
    const p = playerObjects.find(p => p.playerIndex === playerIndex);
    if (p && p.alive) {
      p.alive = false;
      p.el.remove();
      killPlayer(playerIndex);
      renderHUD(hudEl);
    }
    emit("chat:system", `🔌 ${nickname} disconnected and was eliminated.`);
  }
  subscribeTo("game:playerLeft", onPlayerLeft);

  // ── Game over ─────────────────────────────────────────────────
  function onGameOver(winner) {
    stopMusic();
    sendGameOver(winner); // tell server so it can relay to others
    sessionStorage.setItem("bomberman-winner", String(winner));
    sessionStorage.setItem("bomberman-myIndex", String(myIndex));
    cleanup();
    setView("results");
  }
  subscribeTo("game:over", onGameOver);

  // ── Server-side game over (received from another client) ──────
  // (already routed to "game:over" by ws/client.js, so handled above)

  // ── Start ─────────────────────────────────────────────────────
  startMusic();
  startGameLoop();

  // ── Cleanup ───────────────────────────────────────────────────
  function cleanup() {
    stopGameLoop();
    stopMusic();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup",   onKeyUp);
    unsubscribeFrom("game:remoteInput",  onRemoteInput);
    unsubscribeFrom("hud:update",        onHudUpdate);
    unsubscribeFrom("game:playerDied",   onPlayerDied);
    unsubscribeFrom("game:playerLeft",   onPlayerLeft);
    unsubscribeFrom("game:over",         onGameOver);
  }

  return cleanup; // framework calls this when navigating away
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function renderHUD(hudEl) {
  hudEl.innerHTML = "";
  const lives = getAllLives();
  for (const [idx, count] of Object.entries(lives)) {
    hudEl.appendChild(
      el("div", { class: "player-hud" }, [
        el("span", { text: `P${Number(idx) + 1} ` }),
        el("span", { class: "hearts", text: "❤".repeat(Math.max(count, 0)) || "💀" }),
      ])
    );
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function buildChatUI(nicknameColors) {
  const messagesEl = el("div", { id: "chat-messages" });
  const inputEl    = el("input", {
    id: "chat-input",
    type: "text",
    placeholder: "Say something…",
    maxlength: "120",
  });
  const sendBtn = el("button", { id: "chat-send", text: "Send", onclick: send });

  function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    sendChat(text);
    inputEl.value = "";
  }

  inputEl.addEventListener("keydown", (e) => {
    // Don't propagate so game doesn't receive chat keypresses
    e.stopPropagation();
    if (e.key === "Enter") send();
  });

  subscribeTo("chat:message", ({ nickname, message }) => {
    const nameEl = el("span", { class: "name", text: `${nickname}: ` });
    nameEl.style.color = nicknameColors[nickname];
    messagesEl.appendChild(
      el("div", { class: "msg" }, [nameEl, el("span", { text: message })])
    );
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  subscribeTo("chat:system", (text) => {
    messagesEl.appendChild(el("div", { class: "msg msg-system", text }));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  return el("div", { id: "chat" }, [
    messagesEl,
    el("div", { id: "chat-input-row" }, [inputEl, sendBtn]),
  ]);
}
