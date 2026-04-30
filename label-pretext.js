/**
 * Label panel: Pretext layout in reference font space, then non-uniform scale so
 * the block always fills the viewport. Line breaks only from Enter (no soft wrap).
 * Transparent textarea overlay for typing + caret.
 */

import {
  prepareWithSegments,
  layoutWithLines,
  measureNaturalWidth,
} from "./vendor/pretext/layout.js";

const FONT_FAMILY = `"Monument Grotesk Variable", system-ui, sans-serif`;

/** Layout + measure at this size; final on-screen size comes from CSS transform scale. */
const REF_FONT_PX = 1000;

/** Pretext: keep newlines; layout uses infinite width so lines do not soft-wrap. */
const PREPARE_OPTIONS = { whiteSpace: "pre-wrap" };

const MAX_LAYOUT_W = Number.POSITIVE_INFINITY;

/** Matches `.label-editor__fake-caret { width: 0.03em }` so EOL caret is not clipped by `.label-editor__block { overflow: hidden }`. */
const CARET_PAD_REF_PX = Math.ceil(REF_FONT_PX * 0.04);

function labelFont(fontSizePx) {
  return `400 ${fontSizePx}px ${FONT_FAMILY}`;
}

/**
 * Line box height (Pretext + CSS). Must be ≥ ~1em or glyphs clip (0.55× em cut off descenders).
 * 1.05× = tight leading with a little room for descenders vs 1.1×.
 */
function labelLineHeightPx(fontSizePx) {
  return Math.max(1, Math.round(fontSizePx * 1.05 * 100) / 100);
}

function padBox(el) {
  const s = getComputedStyle(el);
  const px = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
  const py = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom);
  return { px, py };
}

/** Line index and text before caret on that line (only hard `\n` breaks). */
function caretLinePrefix(text, caretPos) {
  const end = Math.max(0, Math.min(caretPos, text.length));
  const before = text.slice(0, end);
  const lines = before.split(/\n/);
  const lineIdx = Math.max(0, lines.length - 1);
  return { lineIdx, prefixOnLine: lines[lineIdx] ?? "" };
}

function measurePrefixWidth(str, refFontStr) {
  if (!str.length) return 0;
  const prepared = prepareWithSegments(str, refFontStr, PREPARE_OPTIONS);
  return measureNaturalWidth(prepared);
}

/**
 * @param {HTMLElement} container — `#panelBody`
 */
export function mountLabelPretext(container) {
  container.classList.add("panel__body--label");
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "label-editor";

  const viewport = document.createElement("div");
  viewport.className = "label-editor__viewport";

  const stage = document.createElement("div");
  stage.className = "label-editor__stage";

  const block = document.createElement("div");
  block.className = "label-editor__block";

  const linesLayer = document.createElement("div");
  linesLayer.className = "label-editor__lines";
  linesLayer.setAttribute("aria-hidden", "true");

  const fakeCaretEl = document.createElement("div");
  fakeCaretEl.className = "label-editor__fake-caret";
  fakeCaretEl.setAttribute("aria-hidden", "true");

  const overlay = document.createElement("textarea");
  overlay.className = "label-editor__overlay-input";
  overlay.setAttribute("autocomplete", "off");
  overlay.setAttribute("spellcheck", "false");
  /* iOS / mobile keyboards: hints only — OS may still offer suggestions. */
  overlay.setAttribute("autocorrect", "off");
  overlay.setAttribute("autocapitalize", "none");
  overlay.setAttribute("aria-label", "Label text");

  block.appendChild(linesLayer);
  block.appendChild(fakeCaretEl);
  block.appendChild(overlay);
  stage.appendChild(block);
  viewport.appendChild(stage);
  root.appendChild(viewport);
  container.appendChild(root);

  const refFontStr = labelFont(REF_FONT_PX);
  const refLineHeightPx = labelLineHeightPx(REF_FONT_PX);

  let raf = 0;
  function scheduleLayout() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      layoutAndPaint();
    });
  }

  /* On mobile we don't auto-focus the overlay (would pop the keyboard), but we still
     want the caret to blink on initial open so the user knows where they'll type.
     "Armed" stays true until the user taps anywhere outside the canvas — once they do,
     caret only shows when the overlay actually has focus. */
  const isMobile = !window.matchMedia("(pointer: fine)").matches;
  let caretArmedMobile = isMobile;

  function updateFakeCaret(text) {
    const show =
      (document.activeElement === overlay ||
        (isMobile && caretArmedMobile)) &&
      document.visibilityState === "visible";
    if (!show) {
      fakeCaretEl.style.display = "none";
      return;
    }
    const selA = overlay.selectionStart ?? 0;
    const selB = overlay.selectionEnd ?? 0;
    if (selA !== selB) {
      fakeCaretEl.style.display = "none";
      return;
    }
    fakeCaretEl.style.display = "block";
    const caretPos = selA;
    const { lineIdx, prefixOnLine } = caretLinePrefix(text, caretPos);
    const leftPx = measurePrefixWidth(prefixOnLine, refFontStr);
    const topPx = lineIdx * refLineHeightPx;
    fakeCaretEl.style.left = `${leftPx}px`;
    fakeCaretEl.style.top = `${topPx}px`;
  }

  /**
   * One visual row per `split("\\n")` segment — matches textarea / Enter, including
   * trailing empty lines (Pretext full-string layout can drop those).
   */
  function layoutAndPaint() {
    const text = overlay.value;

    block.style.setProperty("--label-font-size", `${REF_FONT_PX}px`);
    block.style.setProperty("--label-line-height", `${refLineHeightPx}px`);

    const { px, py } = padBox(viewport);
    const cw = Math.max(0, viewport.clientWidth - px);
    const ch = Math.max(0, viewport.clientHeight - py);

    if (text.length === 0) {
      linesLayer.textContent = "";
      const mPrep = prepareWithSegments("M", refFontStr, PREPARE_OPTIONS);
      const emptyW = Math.max(4, measureNaturalWidth(mPrep));
      const emptyH = Math.max(refLineHeightPx, 1);
      const layoutW = emptyW + CARET_PAD_REF_PX;
      block.style.width = `${layoutW}px`;
      block.style.height = `${emptyH}px`;
      const sx = cw / layoutW;
      const sy = ch / emptyH;
      block.style.transform = `scale(${sx}, ${sy})`;
      updateFakeCaret(text);
      return;
    }

    const parts = text.split(/\n/);
    linesLayer.textContent = "";
    let blockW = 1;

    for (const part of parts) {
      let lineWidth = 0;
      if (part.length > 0) {
        const prepared = prepareWithSegments(part, refFontStr, PREPARE_OPTIONS);
        const { lines } = layoutWithLines(prepared, MAX_LAYOUT_W, refLineHeightPx);
        for (const L of lines) {
          lineWidth = Math.max(lineWidth, L.width);
        }
      }
      blockW = Math.max(blockW, lineWidth, 1);

      const lineEl = document.createElement("div");
      lineEl.className = "label-editor__line";
      lineEl.textContent = part.length > 0 ? part : "\u00a0";
      lineEl.style.width = `${Math.max(lineWidth, 1)}px`;
      linesLayer.appendChild(lineEl);
    }

    const blockH = Math.max(parts.length * refLineHeightPx, 1);
    const layoutW = blockW + CARET_PAD_REF_PX;
    block.style.width = `${layoutW}px`;
    block.style.height = `${blockH}px`;

    const sx = cw / layoutW;
    const sy = ch / blockH;
    block.style.transform = `scale(${sx}, ${sy})`;
    updateFakeCaret(text);
  }

  overlay.addEventListener("input", scheduleLayout);
  overlay.addEventListener("focus", () => {
    /* Re-arm on focus so tapping the canvas after a previous dismiss brings the
       caret back even if the user had disarmed it. */
    caretArmedMobile = isMobile;
    scheduleLayout();
  });
  overlay.addEventListener("blur", () => {
    /* Dismissing the on-screen keyboard ("Done") fires blur — disarm so the
       fake caret hides too, matching what the user sees in any other app. */
    if (isMobile) caretArmedMobile = false;
    scheduleLayout();
  });

  function onSelectionMaybeChange() {
    if (document.activeElement !== overlay) return;
    scheduleLayout();
  }

  function focusField() {
    overlay.focus();
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (e.target === viewport || e.target === stage) focusField();
  });

  /* Any tap outside the canvas area disarms the mobile caret and blurs the overlay so
     the keyboard collapses. Tapping back on the canvas re-focuses → caret returns. */
  function onDocPointerDown(e) {
    if (viewport.contains(e.target)) return;
    if (caretArmedMobile) {
      caretArmedMobile = false;
      scheduleLayout();
    }
    if (document.activeElement === overlay) overlay.blur();
  }
  document.addEventListener("pointerdown", onDocPointerDown, true);

  const ro = new ResizeObserver(() => scheduleLayout());
  ro.observe(viewport);

  document.fonts.ready.then(() => scheduleLayout());
  scheduleLayout();

  document.addEventListener("selectionchange", onSelectionMaybeChange);

  return {
    dispose() {
      document.removeEventListener("selectionchange", onSelectionMaybeChange);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      ro.disconnect();
      container.classList.remove("panel__body--label");
      container.innerHTML = "";
    },
    reset() {
      overlay.value = "";
      caretArmedMobile = isMobile;
      scheduleLayout();
      overlay.focus();
    },
  };
}
