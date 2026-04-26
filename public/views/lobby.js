// views/lobby.js — waiting room: player list + countdown timers
// Listens to ws:lobby:update events from the WebSocket client.

import { el, subscribe, unsubscribe, emit } from "../../framework/index.js";
import { setView } from "../../framework/index.js";
import { subscribeTo, unsubscribeFrom } from "../../framework/index.js";

export function renderLobbyView(container) {
  let players   = [];
  let countdown = null; // seconds remaining, or null

  const playerListEl  = el("ul",  { class: "player-list" });
  const countdownEl   = el("div", { class: "lobby-timer",  text: "" });
  const statusEl      = el("p",   { class: "lobby-status", text: "Waiting for players… (2-4)" });

  function renderList() {
    playerListEl.innerHTML = "";
    for (const p of players) {
      playerListEl.appendChild(
        el("li", { text: `Player ${p.playerIndex + 1}: ${p.nickname}` })
      );
    }
  }

  function onLobbyUpdate(msg) {
    players   = msg.players  ?? players;
    countdown = msg.countdown ?? null;

    renderList();

    if (countdown !== null) {
      countdownEl.textContent = countdown > 0 ? `Starting in ${countdown}s` : "GO!";
      statusEl.textContent    = players.length >= 4
        ? "4 players ready!"
        : `${players.length}/4 players — starting soon`;
    } else {
      countdownEl.textContent = "";
      statusEl.textContent    = `${players.length}/4 players — waiting…`;
    }
  }

  function onGameStart() {
    unsubscribeFrom("lobby:update", onLobbyUpdate);
    unsubscribeFrom("game:start",   onGameStart);
    setView("game");
  }

  subscribeTo("lobby:update", onLobbyUpdate);
  subscribeTo("game:start",   onGameStart);

  container.appendChild(
    el("div", { class: "lobby-view" }, [
      el("h2",  { text: "🎮 LOBBY" }),
      playerListEl,
      countdownEl,
      statusEl,
    ])
  );

  // Cleanup when view is replaced
  return () => {
    unsubscribeFrom("lobby:update", onLobbyUpdate);
    unsubscribeFrom("game:start",   onGameStart);
  };
}
