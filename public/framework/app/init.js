// App bootstrap for the framework.
//
// initApp wires the root application container to the framework runtime.
// It is responsible for:
// - validating the root mount container
// - initializing the router
// - subscribing the root renderer to global update events
// - triggering the initial render
//
// This is the main entry used by apps after registering their views.
import { subscribe } from "../state/events.js";
import { initializeRouter } from "../state/router.js";
import { render } from "../render/render.js";

export function initApp(container) {
  if (!container) {
    throw new Error("initApp: container is required");
  }

  function draw() {
    render(container);
  }

  initializeRouter();
  subscribe(draw);
  draw();
}