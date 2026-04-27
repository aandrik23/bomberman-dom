// views/lobby.js — waiting room: player list + countdown timers

import { el, setView, subscribeTo, unsubscribeFrom } from "../../framework/index.js";

export function renderLobbyView(container) {
  let players   = [];
  let countdown = null;
  let phase     = ""; // "waiting" | "ready" | ""

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
    phase     = msg.phase    ?? "";

    renderList();

    if (countdown !== null && phase === "waiting") {
      countdownEl.textContent = countdown > 0
        ? `Waiting ${countdown}s for more players…`
        : "Checking for players…";
      countdownEl.style.color = "#f39c12";
      statusEl.textContent    = `${players.length}/4 players — timer resets if someone joins or leaves`;
    } else if (countdown !== null && phase === "ready") {
      countdownEl.textContent = countdown > 0 ? `Game starts in ${countdown}s` : "GO!";
      countdownEl.style.color = "#e74c3c";
      statusEl.textContent    = "Lobby locked — get ready!";
    } else {
      countdownEl.textContent = "";
      countdownEl.style.color = "";
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
