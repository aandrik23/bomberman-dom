// views/nickname.js — first screen: enter nickname and connect
import { el } from "../../framework/index.js";
import { setView } from "../../framework/index.js";
import { connect } from "../ws/client.js";

export function renderNicknameView(container) {
  let value = "";

  const input = el("input", {
    type: "text",
    placeholder: "Enter your nickname…",
    maxlength: "20",
    oninput: (e) => { value = e.target.value.trim(); },
    onkeydown: (e) => { if (e.key === "Enter") submit(); },
  });

  const btn = el("button", { onclick: submit, text: "JOIN GAME" });

  const view = el("div", { class: "nickname-view" }, [
    el("h1", { text: "💣 BOMBERMAN" }),
    el("p",  { text: "Enter a nickname to join the lobby" }),
    input,
    btn,
  ]);

  container.appendChild(view);
  input.focus();

  function submit() {
    const nick = value || input.value.trim();
    if (!nick) { input.style.borderColor = "#e74c3c"; return; }
    connect(nick);
    setView("lobby");
  }
}
