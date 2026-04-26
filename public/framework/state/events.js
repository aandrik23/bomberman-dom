// Global and scoped framework update events.
//
// This module provides the framework event system used to notify listeners
// when application state changes.
//
// Responsibilities:
// - register global listeners
// - register scoped listeners by event name
// - remove listeners
// - emit global updates
// - emit scoped updates
//
// Use:
// - emit() for full/global rerenders
// - emit("todos:changed") for targeted/scoped rerenders

const globalListeners = new Set();
const scopedListeners = new Map();

// subscribe registers a global framework listener.
//
// Global listeners are used for broad app-level updates such as full rerenders.
export function subscribe(fn) {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

// unsubscribe removes a previously registered global listener.
export function unsubscribe(fn) {
  globalListeners.delete(fn);
}

// subscribeTo registers a listener for a named scoped event.
//
// Use scoped subscriptions for partial UI updates, such as list-only or
// footer-only rerenders.
export function subscribeTo(eventName, fn) {
  if (typeof eventName !== "string" || eventName.trim() === "") {
    throw new Error("subscribeTo: eventName must be a non-empty string");
  }

  if (typeof fn !== "function") {
    throw new Error("subscribeTo: listener must be a function");
  }

  let bucket = scopedListeners.get(eventName);

  if (!bucket) {
    bucket = new Set();
    scopedListeners.set(eventName, bucket);
  }

  bucket.add(fn);

  return () => {
    bucket.delete(fn);

    if (bucket.size === 0) {
      scopedListeners.delete(eventName);
    }
  };
}

// unsubscribeFrom removes a listener from a named scoped event.
export function unsubscribeFrom(eventName, fn) {
  const bucket = scopedListeners.get(eventName);
  if (!bucket) return;

  bucket.delete(fn);

  if (bucket.size === 0) {
    scopedListeners.delete(eventName);
  }
}

// emit notifies listeners.
//
// Behavior:
// - emit() -> notify all global listeners
// - emit("todos:changed") -> notify only listeners registered for that event
// - emit("game:start", data) -> listeners receive data as their first argument
export function emit(eventName, data) {
  if (eventName == null) {
    for (const fn of globalListeners) {
      fn();
    }
    return;
  }

  if (typeof eventName !== "string" || eventName.trim() === "") {
    throw new Error("emit: eventName must be a non-empty string");
  }

  const bucket = scopedListeners.get(eventName);
  if (!bucket) return;

  for (const fn of bucket) {
    fn(data);
  }
}