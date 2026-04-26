import { initApp, registerView } from "./framework/index.js";
import { renderNicknameView } from "./views/nickname.js";
import { renderLobbyView }    from "./views/lobby.js";
import { renderGameView }     from "./views/game.js";
import { renderResultsView }  from "./views/results.js";

registerView({ key: "nickname", label: "Nickname", renderer: renderNicknameView, isDefault: true });
registerView({ key: "lobby",    label: "Lobby",    renderer: renderLobbyView });
registerView({ key: "game",     label: "Game",     renderer: renderGameView });
registerView({ key: "results",  label: "Results",  renderer: renderResultsView });

initApp(document.getElementById("app"));
