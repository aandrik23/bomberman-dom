// Public entry point for the framework.
//
// This file defines the package API surface by re-exporting the framework's
// core modules:
// - app bootstrap
// - router and route state
// - global event updates
// - DOM element helpers
// - dialog utilities
// - scoped rendering
//
// Consumers should import from this file instead of internal module paths.
export { initApp } from "./app/init.js";

export {
  registerView,
  initializeRouter,
  getView,
  setView,
  getDefaultView,
  getViewRenderer,
  getRoutes,
  getViewList
} from "./state/router.js";

export { subscribe, unsubscribe, subscribeTo, unsubscribeFrom, emit } from "./state/events.js";

export { el, svgEl } from "./components/dom.js";

export { uiAlert, uiConfirm, uiPrompt } from "./components/dialog.js";

export { createScopedRenderer } from "./render/scoped.js";