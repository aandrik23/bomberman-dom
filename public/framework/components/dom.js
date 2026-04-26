// DOM creation helpers.
//
// This module provides the framework's element construction API for both
// HTML and SVG nodes.
//
// Responsibilities:
// - create HTML elements
// - create SVG elements
// - apply attributes and properties
// - attach DOM event handlers
// - append nested children
//
// It is the main low-level DOM utility used by views and UI helpers.
const SVG_NS = "http://www.w3.org/2000/svg";

function applyAttrs(node, attrs, isSVG) {
  if (!attrs) return;

  for (const k in attrs) {
    const v = attrs[k];

    if (v == null) continue;

    if (k === "class") {
      if (isSVG) node.setAttribute("class", v);
      else node.className = v;
      continue;
    }

    if (k === "text") {
      node.textContent = v;
      continue;
    }

    if (k === "html" && !isSVG) {
      node.innerHTML = v;
      continue;
    }

    if (k[0] === "o" && k[1] === "n" && typeof v === "function") {
      node.addEventListener(k.slice(2), v);
      continue;
    }

    if (!isSVG && k in node && k !== "list" && k !== "form") {
      node[k] = v;
      continue;
    }

    node.setAttribute(k, v);
  }
}

function appendChildren(node, children) {
  if (children == null) return;

  const frag = document.createDocumentFragment();
  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (child == null) continue;

    if (
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "boolean"
    ) {
      frag.appendChild(document.createTextNode(String(child)));
      continue;
    }

    frag.appendChild(child);
  }

  node.appendChild(frag);
}

function createNode(tag, attrs = null, children = null, namespace = null) {
  const isSVG = namespace === SVG_NS;

  const node = isSVG
    ? document.createElementNS(namespace, tag)
    : document.createElement(tag);

  applyAttrs(node, attrs, isSVG);
  appendChildren(node, children);

  return node;
}

// el creates a standard HTML element and applies framework attributes,
// event handlers, and nested children.
export function el(tag, attrs = null, children = null) {
  return createNode(tag, attrs, children);
}

// svgEl creates an SVG element using the SVG namespace and applies
// framework attributes and nested children.
export function svgEl(tag, attrs = null, children = null) {
  return createNode(tag, attrs, children, SVG_NS);
}