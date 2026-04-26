// View router and route state manager.
//
// This module owns the framework routing system. It is responsible for:
// - registering views
// - storing view metadata
// - tracking the default view
// - tracking the current active view
// - syncing route state with the URL hash
// - exposing route data for navigation UIs
//
// Routing is hash-based so apps can support navigation, refresh, and
// back/forward browser behavior without server-side route handling.
import { emit } from "./events.js";

const views = new Map();

let defaultView = null;
let currentView = null;
let routerStarted = false;

function normalizeKey(key) {
  if (typeof key !== "string") return "";
  return key.trim();
}

function makeHash(key) {
  return key === defaultView ? "#/" : `#/${key}`;
}

function readHash() {
  const hash = window.location.hash || "#/";

  if (hash === "#" || hash === "#/") {
    return defaultView;
  }

  if (!hash.startsWith("#/")) {
    return defaultView;
  }

  const key = normalizeKey(hash.slice(2));
  return views.has(key) ? key : defaultView;
}

function syncFromURL() {
  const nextView = readHash();

  if (!nextView || nextView === currentView) return;

  currentView = nextView;
  emit();
}

// registerView adds a renderable route/view to the framework.
//
// Each registered view must provide:
// - a unique key
// - a label for navigation/UI use
// - a renderer function
//
// One view may be marked as the default route.
export function registerView(config) {
  if (!config || typeof config !== "object") {
    throw new Error("registerView: config object is required");
  }

  const { key, label, renderer, isDefault = false } = config;

  const normalizedKey = normalizeKey(key);

  if (normalizedKey === "") {
    throw new Error("registerView: key must be a non-empty string");
  }

  if (typeof label !== "string" || label.trim() === "") {
    throw new Error("registerView: label must be a non-empty string");
  }

  if (typeof renderer !== "function") {
    throw new Error("registerView: renderer must be a function");
  }

  if (views.has(normalizedKey)) {
    throw new Error(`registerView: view "${normalizedKey}" is already registered`);
  }

  views.set(normalizedKey, {
    key: normalizedKey,
    label,
    renderer
  });

  if (isDefault) {
    if (defaultView !== null) {
      throw new Error(
        `registerView: default view already set to "${defaultView}"`
      );
    }
    defaultView = normalizedKey;
  }

  if (currentView === null) {
    currentView = normalizedKey;
  }
}

// initializeRouter finalizes router startup after all views are registered.
//
// It resolves the default route, syncs current route state from the URL hash,
// and attaches the hashchange listener once.
export function initializeRouter() {
  if (views.size === 0) {
    throw new Error("initializeRouter: no views registered");
  }

  if (defaultView === null) {
    defaultView = getRoutes()[0].key;
  }

  currentView = readHash();

  if (!window.location.hash || !views.has(normalizeKey(window.location.hash.slice(2)))) {
    window.location.hash = makeHash(currentView);
  }

  if (!routerStarted) {
    window.addEventListener("hashchange", syncFromURL);
    routerStarted = true;
  }
}

// getView returns the currently active view key.
export function getView() {
  return currentView;
}

// setView changes the active route by updating the URL hash.
//
// Route state is URL-driven, so changing the hash is the source of truth for
// navigation and browser back/forward support.
export function setView(key) {
  const normalizedKey = normalizeKey(key);

  if (!views.has(normalizedKey)) {
    throw new Error(`setView: view "${normalizedKey}" is not registered`);
  }

  const nextHash = makeHash(normalizedKey);

  if (window.location.hash === nextHash) {
    return;
  }

  window.location.hash = nextHash;
}
// getDefaultView returns the configured default route key.
export function getDefaultView() {
  return defaultView;
}

// getViewRenderer resolves the renderer function for a given view key.
//
// If no key is provided, the current active view is used.
export function getViewRenderer(key = currentView) {
  const view = views.get(key);
  return view ? view.renderer : null;
}

// getRoutes returns route metadata suitable for navigation UIs.
//
// Each route includes:
// - key
// - label
// - hash
export function getRoutes() {
  return Array.from(views.values()).map(({ key, label }) => ({
    key,
    label,
    hash: makeHash(key)
  }));
}

// getViewList returns only the registered view keys.
export function getViewList() {
  return Array.from(views.keys());
}