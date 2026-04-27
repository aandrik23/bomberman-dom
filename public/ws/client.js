// ws/client.js — WebSocket client
//
// Protocol (JSON over WebSocket):
//
//  Client → Server:
//    { type: "join",     nickname }
//    { type: "input",    dir: {dx,dy}, dropBomb }
//    { type: "chat",     nickname, message }
//    { type: "gameOver", winner }
//
//  Server → Client:
//    { type: "lobby",    players: [{nickname, playerIndex}], countdown: N|null }
//    { type: "start",    yourPlayerIndex: N, players: [...] }
//    { type: "input",    playerIndex: N, dir: {dx,dy}, dropBomb }
//    { type: "chat",     nickname, message }
//    { type: "gameOver", winner: N }

import { emit } from "../../framework/index.js";

let socket        = null;
let myNickname    = "";
let myPlayerIndex = -1;
let gameStartData = null; // populated when "start" is received

export function getMyPlayerIndex() { return myPlayerIndex; }
export function getMyNickname()    { return myNickname; }
export function getGameStartData() { return gameStartData; }

export function connect(nickname, serverUrl = `ws://${location.host}/ws`) {
  myNickname = nickname;
  socket = new WebSocket(serverUrl);

  socket.addEventListener("open", () => {
    send({ type: "join", nickname });
  });

  socket.addEventListener("message", ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    onMessage(msg);
  });

  socket.addEventListener("close", () => emit("ws:disconnected"));
  socket.addEventListener("error", () => emit("ws:error"));
}

function onMessage(msg) {
  switch (msg.type) {
    case "lobby":
      emit("lobby:update", msg);
      break;

    case "start":
      myPlayerIndex = msg.yourPlayerIndex;
      gameStartData = msg;
      emit("game:start", msg);
      break;

    case "input":
      // Remote player moved or dropped a bomb — forward to game view
      if (msg.playerIndex !== myPlayerIndex) {
        emit("game:remoteInput", msg);
      }
      break;

    case "chat":
      emit("chat:message", msg);
      break;

    case "playerLeft":
      emit("game:playerLeft", { playerIndex: msg.playerIndex, nickname: msg.nickname });
      break;

    case "gameOver":
      emit("game:over", msg.winner);
      break;

    case "error":
      console.warn("[ws] server error:", msg.message);
      emit("ws:error", msg.message);
      break;
  }
}

// Send the local player's movement / bomb input to the server.
export function sendInput(dir, dropBomb = false) {
  send({ type: "input", dir, dropBomb });
}

// Broadcast a chat message.
export function sendChat(message) {
  send({ type: "chat", nickname: myNickname, message });
}

// Report game-over winner to server (so it can broadcast to latecomers).
export function sendGameOver(winner) {
  send({ type: "gameOver", winner });
}

export function send(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

export function disconnect() {
  socket?.close();
  socket = null;
}
