// Root view renderer.
//
// This module performs full rendering for the active route/view.
// It is responsible for:
// - reading the current view from the router
// - resolving the registered renderer for that view
// - clearing the root container
// - mounting the active view output
// - handling the fallback case when no renderer exists
//
// This renderer is intended for top-level app/view rendering.
import { el } from "../components/dom.js";
import { getView, getViewRenderer } from "../state/router.js";

let activeCleanup = null;
// render performs a full redraw of the root app container for the active view.
//
// Use this renderer for top-level route changes and full app view swaps.
export function render(container) {
  const view = getView();
  const renderer = getViewRenderer(view);

  if (typeof activeCleanup === "function") {
    activeCleanup();
    activeCleanup = null;
  }

  container.style.transition = "opacity 0.15s ease";
  container.style.opacity = "0";

  requestAnimationFrame(() => {
    container.innerHTML = "";
    const main = el("div");
    container.appendChild(main);

    if (!renderer) {
      main.appendChild(el("p", { text: `View "${view}" is not registered.` }));
    } else {
      const cleanup = renderer(main);

      if (typeof cleanup === "function") {
        activeCleanup = cleanup;
      }
    }

    requestAnimationFrame(() => {
      container.style.opacity = "1";
    });
  });
}