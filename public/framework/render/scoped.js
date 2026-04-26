// Scoped renderer for partial UI updates.
//
// This module provides a small local rendering utility for rerendering a
// specific container without redrawing the full app or active route.
//
// Use scoped rendering for view-local sections such as:
// - lists
// - counters
// - footers
// - small UI blocks that change independently
//
// This complements the root renderer instead of replacing it.

export function createScopedRenderer(container, renderFn) {
  if (!container) {
    throw new Error("createScopedRenderer: container is required");
  }

  if (typeof renderFn !== "function") {
    throw new Error("createScopedRenderer: renderFn must be a function");
  }

  function redraw() {
    container.innerHTML = "";
    renderFn(container);
  }

  return {
    render: redraw
  };
}