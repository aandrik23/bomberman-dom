// Dialog utilities built on top of the DOM helpers.
//
// This module provides reusable dialog helpers for common interaction flows:
// - alerts
// - confirmations
// - prompts
//
// Responsibilities:
// - create dialog overlays and modal shells
// - handle dialog close behavior
// - resolve dialog results through Promises
//
// These helpers are optional framework utilities and are not required by the
// routing or rendering core.
import { el } from "./dom.js";

function createDialogShell(content, options = {}) {
  const {
    overlayClass = "alert-overlay",
    modalClass = "alert-modal",
    closeOnOverlay = false
  } = options;

  const overlay = el("div", { class: overlayClass });
  const modal = el("div", { class: modalClass }, content);

  function close() {
    overlay.remove();
  }

  if (closeOnOverlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  return { overlay, modal, close };
}

// uiAlert shows a simple modal alert and resolves when dismissed.
export function uiAlert(message, options = {}) {
  const {
    okText = "OK",
    overlayClass,
    modalClass,
    closeOnOverlay = false
  } = options;

  return new Promise((resolve) => {
    let close;

    const okButton = el("button", {
      text: okText,
      onclick: () => {
        close();
        resolve(true);
      }
    });

    ({ close } = createDialogShell(
      [
        el("p", { text: message }),
        okButton
      ],
      { overlayClass, modalClass, closeOnOverlay }
    ));

    okButton.focus();
  });
}

// uiConfirm shows a confirmation dialog and resolves to true or false
// depending on the user's choice.
export function uiConfirm(message, options = {}) {
  const {
    confirmText = "Continue",
    cancelText = "Cancel",
    confirmClass = "",
    cancelClass = "btn-ghost",
    overlayClass,
    modalClass,
    closeOnOverlay = false
  } = options;

  return new Promise((resolve) => {
    let close;

    const cancelButton = el("button", {
      class: cancelClass,
      text: cancelText,
      onclick: () => {
        close();
        resolve(false);
      }
    });

    const confirmButton = el("button", {
      class: confirmClass,
      text: confirmText,
      onclick: () => {
        close();
        resolve(true);
      }
    });

    ({ close } = createDialogShell(
      [
        el("p", { text: message }),
        el("div", { class: "form-actions" }, [cancelButton, confirmButton])
      ],
      { overlayClass, modalClass, closeOnOverlay }
    ));

    confirmButton.focus();
  });
}

// uiPrompt shows an input dialog and resolves to the submitted value,
// or null if cancelled.
export function uiPrompt(message, options = {}) {
  const {
    defaultValue = "",
    inputType = "text",
    inputAttrs = {},
    confirmText = "OK",
    cancelText = "Cancel",
    confirmClass = "",
    cancelClass = "btn-ghost",
    overlayClass,
    modalClass,
    closeOnOverlay = false
  } = options;

  return new Promise((resolve) => {
    let close;

    const input = el("input", {
      type: inputType,
      value: defaultValue,
      ...inputAttrs
    });

    const cancelButton = el("button", {
      class: cancelClass,
      text: cancelText,
      onclick: () => {
        close();
        resolve(null);
      }
    });

    const confirmButton = el("button", {
      class: confirmClass,
      text: confirmText,
      onclick: () => {
        close();
        resolve(input.value);
      }
    });

    function submit() {
      close();
      resolve(input.value);
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") {
        close();
        resolve(null);
      }
    });

    ({ close } = createDialogShell(
      [
        el("p", { text: message }),
        input,
        el("div", { class: "form-actions" }, [cancelButton, confirmButton])
      ],
      { overlayClass, modalClass, closeOnOverlay }
    ));

    input.focus();
  });
}