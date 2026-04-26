// views/results.js — game over screen showing the winner
import { el } from "../../framework/index.js";
import { setView } from "../../framework/index.js";

export function renderResultsView(container) {
  const winner  = Number(sessionStorage.getItem("bomberman-winner"));
  const myIndex = Number(sessionStorage.getItem("bomberman-myIndex"));

  let heading, subtext;
  if (sessionStorage.getItem("bomberman-winner") === "-1") {
    heading = "DRAW!";
    subtext = "Nobody wins this time.";
  } else if (myIndex === winner) {
    heading = "YOU WIN!";
    subtext = `Player ${winner + 1} is the champion!`;
  } else {
    heading = "YOU LOSE!";
    subtext = `Player ${winner + 1} wins this round.`;
  }

  container.appendChild(
    el("div", { class: "results-view" }, [
      el("h1",  { text: heading }),
      el("div", { class: "winner-name", text: subtext }),
      el("button", {
        text: "Play Again",
        onclick: () => setView("nickname"),
      }),
    ])
  );
}
