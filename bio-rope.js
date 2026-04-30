/**
 * Bio panel: paragraph with a rope of trailing words — Verlet chain + gravity.
 * Pointer down on any hanging word to grab; while held, pull to add words from
 * the paragraph; pointer up releases.
 */

/** Per frame; lower = less “whip” / calmer swing. */
const G = 0.22;
/** Velocity retention each frame — lower = heavier air resistance, less explosive motion. */
const DAMP = 0.965;
/** Caps implied speed so constraint corrections don’t explode into huge swings. */
const MAX_VELOCITY_PX = 14;
/** Base solver passes; actual passes also scale with chain length (see satisfyConstraints). */
const CONSTRAINT_ITERS_BASE = 12;
/** Extra constraint iterations per particle — long chains need more passes to stay equally stiff. */
const CONSTRAINT_ITERS_PER_PT = 3;
const CONSTRAINT_ITERS_CAP = 42;
/**
 * Same pull distance every time. Measured on the first link only (anchor → first rope
 * word), not the tail — so swinging the end doesn’t peel words, but you can keep
 * pulling from any grab and peel repeatedly as that link stretches.
 */
const UNCLIP_DISTANCE_PX = 80;
/** Brief pause after each unclip so one motion doesn’t dump many words at once. */
const UNCLIP_COOLDOWN_MS = 220;
/** Keep word centers slightly above the content bottom (root coords). */
const FLOOR_PAD = 12;
/** Inset from `.bio-rope` edges (0 = words can meet the content canvas edge). */
const CONTENT_INSET_PX = 0;
/** Approximate rendered line box height (15px type) — matches translate(..., p.y - 11). */
const WORD_LINE_HEIGHT_PX = 22;
/** Minimum gap between word bounding circles (edge to edge) — chain rest length. */
const WORD_EDGE_GAP_PX = 6;
/**
 * Pairwise overlap pass uses a slightly smaller effective radius + gap than the chain
 * physics (full wordRadius + WORD_EDGE_GAP_PX) so folded rope can still pack tighter
 * than the original separation — tune between ~0.65 / 2px (tight) and 1 / 6 (original).
 */
const SEPARATION_HITBOX_SCALE = 0.8;
const SEPARATION_EDGE_GAP_PX = 4;
/** Passes inside separateOverlaps (pair loop). */
const SEPARATION_PASSES = 3;
/** After separation, extra chain relax iterations so links stay near rest length. */
const POST_SEPARATION_RELAX = 10;
/**
 * On load / reset, the last rope word starts above its chain rest position so it drops and
 * swings more visibly (larger arc than placing it exactly at rest).
 */
const INITIAL_LAST_WORD_DROP_EXTRA_PX = 48;
/** Verlet “previous Y” offset for the tail only — adds downward velocity on frame 1. */
const INITIAL_LAST_WORD_VELOCITY_KICK_PX = 6;

function splitWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function mountMeasureLayer(container, fontCss) {
  const m = document.createElement("div");
  m.setAttribute("aria-hidden", "true");
  m.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;font:${fontCss};`;
  container.appendChild(m);
  return m;
}

function measureWordWidths(words, measureEl) {
  return words.map((w) => {
    measureEl.textContent = w;
    return measureEl.getBoundingClientRect().width;
  });
}

export function mountBioRope(container, paragraphText) {
  const words = splitWords(paragraphText);
  if (words.length === 0) {
    container.innerHTML = "";
    return () => {};
  }

  const fontCss = `400 15px "Monument Grotesk Variable", system-ui, sans-serif`;
  container.innerHTML = "";
  container.classList.add("panel__body--bio");

  const root = document.createElement("div");
  root.className = "bio-rope";
  container.appendChild(root);

  let widths = [];

  let ropeCount = 1;
  let raf = 0;

  let dragging = false;
  /** Index in `pts` / rope while dragging; null when not dragging. */
  let dragIdx = null;
  /** Index in `words` for the grabbed token — survives rope rebuilds. */
  let dragGlobalWordIndex = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  /** Pointer position in root coordinates (grab point). */
  let dragPointerX = 0;
  let dragPointerY = 0;
  let pointerId = null;
  let dragCaptureEl = null;
  let lastUnclipTime = 0;

  const staticEl = document.createElement("div");
  staticEl.className = "bio-rope__static";

  const layer = document.createElement("div");
  layer.className = "bio-rope__layer";

  root.appendChild(staticEl);
  root.appendChild(layer);

  /** Rope word centers (not including anchor). */
  /** @type {{ x: number, y: number, ox: number, oy: number }[]} */
  let pts = [];

  const wordSpans = [];

  function rebuildDom() {
    staticEl.innerHTML = "";
    layer.innerHTML = "";
    wordSpans.length = 0;

    const staticCount = words.length - ropeCount;
    const frag = document.createDocumentFragment();
    if (staticCount === 0) {
      const a = document.createElement("span");
      a.className = "bio-rope__anchor";
      a.textContent = "\u200b";
      frag.appendChild(a);
    } else {
      for (let i = 0; i < staticCount; i++) {
        const s = document.createElement("span");
        s.className = "bio-rope__inline";
        s.textContent = words[i] + (i < staticCount - 1 ? " " : "");
        frag.appendChild(s);
      }
      const a = document.createElement("span");
      a.className = "bio-rope__anchor";
      a.textContent = "\u200b";
      frag.appendChild(a);
    }
    staticEl.appendChild(frag);

    const start = staticCount;
    for (let i = start; i < words.length; i++) {
      const sp = document.createElement("span");
      sp.className = "bio-rope__word";
      sp.textContent = words[i];
      sp.dataset.ropeI = String(i - start);
      sp.tabIndex = 0;
      sp.setAttribute("aria-label", `Pull word: ${words[i]}`);
      layer.appendChild(sp);
      wordSpans.push(sp);
    }
  }

  function anchorPos() {
    const r = root.getBoundingClientRect();
    const mark = staticEl.querySelector(".bio-rope__anchor");
    if (!mark) return { x: 0, y: 0 };
    const ar = mark.getBoundingClientRect();
    return {
      x: ar.left - r.left + ar.width,
      y: ar.top - r.top + ar.height * 0.78,
    };
  }

  /** Bottom of panel body (bio content area), in root-local Y. */
  function getParticleFloorY() {
    const c = container.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    return c.bottom - r.top - FLOOR_PAD;
  }

  /** Clamp particle centers so word bounding circles stay inside the bio-rope rect (white area). */
  function clampParticlesToBounds() {
    const r = root.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    if (w < 8 || h < 8) return;

    const pad = CONTENT_INSET_PX;
    const floorLine = getParticleFloorY();
    const start = words.length - ropeCount;

    for (let i = 0; i < pts.length; i++) {
      const rad = wordRadius(start + i);
      const p = pts[i];
      let minX = pad + rad;
      let maxX = w - pad - rad;
      let minY = pad + rad;
      let maxY = Math.min(floorLine, h - pad - rad);
      if (!Number.isFinite(maxY)) maxY = h - pad - rad;
      if (minX > maxX) {
        const c = w * 0.5;
        minX = maxX = c;
      }
      if (minY > maxY) {
        const c = h * 0.5;
        minY = maxY = c;
      }

      if (p.x < minX) {
        p.x = minX;
        p.ox = minX;
      } else if (p.x > maxX) {
        p.x = maxX;
        p.ox = maxX;
      }
      if (p.y < minY) {
        p.y = minY;
        p.oy = minY;
      } else if (p.y > maxY) {
        p.y = maxY;
        p.oy = maxY;
      }
    }
  }

  /** Circle radius ~ half diagonal of word box — stable when labels rotate. */
  function wordRadius(globalWordIndex) {
    const w = widths[globalWordIndex] ?? 0;
    return Math.hypot(w * 0.5, WORD_LINE_HEIGHT_PX * 0.5);
  }

  function restFromAnchor() {
    const start = words.length - ropeCount;
    return wordRadius(start) + WORD_EDGE_GAP_PX;
  }

  function restBetween(i) {
    const start = words.length - ropeCount;
    return wordRadius(start + i) + wordRadius(start + i + 1) + WORD_EDGE_GAP_PX;
  }

  /** Push overlapping word centers apart (stack / slide) when the rope folds back on itself. */
  function separateOverlaps() {
    const start = words.length - ropeCount;
    const n = pts.length;
    for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
      for (let i = 0; i < n; i++) {
        const gi = start + i;
        const ri = wordRadius(gi) * SEPARATION_HITBOX_SCALE;
        for (let j = i + 1; j < n; j++) {
          const gj = start + j;
          const rj = wordRadius(gj) * SEPARATION_HITBOX_SCALE;
          const minD = ri + rj + SEPARATION_EDGE_GAP_PX;
          const dx = pts[j].x - pts[i].x;
          const dy = pts[j].y - pts[i].y;
          const d = Math.hypot(dx, dy) || 0.0001;
          if (d >= minD) continue;
          const diff = (minD - d) / d;
          const mx = dx * diff;
          const my = dy * diff;
          const dragI = dragging && dragIdx === i;
          const dragJ = dragging && dragIdx === j;
          if (!dragI && !dragJ) {
            pts[i].x -= mx * 0.5;
            pts[i].y -= my * 0.5;
            pts[j].x += mx * 0.5;
            pts[j].y += my * 0.5;
          } else if (dragI && !dragJ) {
            pts[j].x += mx;
            pts[j].y += my;
          } else if (!dragI && dragJ) {
            pts[i].x -= mx;
            pts[i].y -= my;
          }
        }
      }
    }
  }

  function constrainToAnchor(ax, ay, p, rest) {
    const dx = p.x - ax;
    const dy = p.y - ay;
    const d = Math.hypot(dx, dy) || 0.0001;
    const diff = (d - rest) / d;
    p.x -= dx * diff;
    p.y -= dy * diff;
  }

  function constrainPair(a, b, rest) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const diff = (d - rest) / d;
    const mx = dx * diff * 0.5;
    const my = dy * diff * 0.5;
    a.x += mx;
    a.y += my;
    b.x -= mx;
    b.y -= my;
  }

  function fixDraggedParticle() {
    if (!dragging || dragIdx === null || dragIdx < 0 || dragIdx >= pts.length) return;
    const p = pts[dragIdx];
    const gi = words.length - ropeCount + dragIdx;
    const rad = wordRadius(gi);
    const rr = root.getBoundingClientRect();
    const w = rr.width;
    const h = rr.height;
    const pad = CONTENT_INSET_PX;
    const floorLine = getParticleFloorY();
    let minX = pad + rad;
    let maxX = w - pad - rad;
    let minY = pad + rad;
    let maxY = Math.min(floorLine, h - pad - rad);
    if (!Number.isFinite(maxY)) maxY = h - pad - rad;
    if (minX > maxX) {
      const c = w * 0.5;
      minX = maxX = c;
    }
    if (minY > maxY) {
      const c = h * 0.5;
      minY = maxY = c;
    }
    const px = Math.min(maxX, Math.max(minX, dragPointerX));
    const py = Math.min(maxY, Math.max(minY, dragPointerY));
    p.x = px;
    p.y = py;
    p.ox = px;
    p.oy = py;
  }

  function applyChainConstraintsOnce() {
    const { x: ax, y: ay } = anchorPos();
    if (pts.length === 0) return;
    constrainToAnchor(ax, ay, pts[0], restFromAnchor());
    for (let i = 0; i < pts.length - 1; i++) {
      constrainPair(pts[i], pts[i + 1], restBetween(i));
    }
    fixDraggedParticle();
    clampParticlesToBounds();
  }

  function satisfyConstraints() {
    if (pts.length === 0) return;

    const n = pts.length;
    const iters = Math.min(
      CONSTRAINT_ITERS_CAP,
      CONSTRAINT_ITERS_BASE + n * CONSTRAINT_ITERS_PER_PT
    );

    for (let it = 0; it < iters; it++) {
      applyChainConstraintsOnce();
    }
  }

  function remapDragAfterRebuild() {
    if (dragGlobalWordIndex === null) return;
    const start = words.length - ropeCount;
    let idx = dragGlobalWordIndex - start;
    if (idx < 0) idx = 0;
    if (idx >= pts.length) idx = pts.length - 1;
    dragIdx = idx;
    fixDraggedParticle();
  }

  function initParticles() {
    const { x: ax, y: ay } = anchorPos();
    pts = [];
    const px = ax + 4;
    let cy = ay;
    for (let i = 0; i < ropeCount; i++) {
      if (i === 0) {
        cy += restFromAnchor();
      } else {
        cy += restBetween(i - 1);
      }
      const isTail = i === ropeCount - 1;
      const y = isTail ? cy - INITIAL_LAST_WORD_DROP_EXTRA_PX : cy;
      const oy = isTail ? y - INITIAL_LAST_WORD_VELOCITY_KICK_PX : y;
      pts.push({ x: px, y, ox: px, oy });
    }
  }

  /**
   * When a new word joins the rope, keep existing particles where they were (with Verlet
   * history) and only insert the new first link — avoids the whole string snapping to a
   * fresh stack and “jumping” (initParticles does that; we only use that on first load / reset).
   */
  function rebuildParticlesAfterUnclip(prevPts) {
    if (prevPts.length === 0) {
      initParticles();
      return;
    }
    const { x: ax, y: ay } = anchorPos();
    const rest0 = restFromAnchor();
    const dx0 = prevPts[0].x - ax;
    const dy0 = prevPts[0].y - ay;
    const d0 = Math.hypot(dx0, dy0);
    const vx0 = prevPts[0].x - prevPts[0].ox;
    const vy0 = prevPts[0].y - prevPts[0].oy;

    let nx;
    let ny;
    if (d0 < 4) {
      nx = ax;
      ny = ay + rest0;
    } else {
      const ux = dx0 / d0;
      const uy = dy0 / d0;
      nx = ax + ux * rest0;
      ny = ay + uy * rest0;
    }

    const next = [
      {
        x: nx,
        y: ny,
        ox: nx - vx0,
        oy: ny - vy0,
      },
    ];
    for (let i = 0; i < prevPts.length; i++) {
      next.push({
        x: prevPts[i].x,
        y: prevPts[i].y,
        ox: prevPts[i].ox,
        oy: prevPts[i].oy,
      });
    }
    pts = next;
  }

  function step() {
    if (!document.body.contains(root)) return;
    if (pts.length === 0) {
      raf = requestAnimationFrame(step);
      return;
    }

    for (let i = 0; i < pts.length; i++) {
      if (dragging && i === dragIdx) continue;
      const p = pts[i];
      let vx = (p.x - p.ox) * DAMP;
      let vy = (p.y - p.oy) * DAMP + G;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_VELOCITY_PX && sp > 0.0001) {
        const s = MAX_VELOCITY_PX / sp;
        vx *= s;
        vy *= s;
      }
      p.ox = p.x;
      p.oy = p.y;
      p.x += vx;
      p.y += vy;
    }

    clampParticlesToBounds();

    satisfyConstraints();
    separateOverlaps();
    for (let k = 0; k < POST_SEPARATION_RELAX; k++) {
      applyChainConstraintsOnce();
    }

    const { x: ax, y: ay } = anchorPos();

    function wordAngleDeg(i) {
      let x0;
      let y0;
      let x1;
      let y1;
      if (i === 0) {
        x0 = ax;
        y0 = ay;
        x1 = pts[0].x;
        y1 = pts[0].y;
      } else {
        x0 = pts[i - 1].x;
        y0 = pts[i - 1].y;
        x1 = pts[i].x;
        y1 = pts[i].y;
      }
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return 0;
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    }

    const start = words.length - ropeCount;
    for (let i = 0; i < pts.length; i++) {
      const sp = wordSpans[i];
      if (!sp) continue;
      const p = pts[i];
      const w = widths[start + i];
      const deg = wordAngleDeg(i);
      sp.style.transform = `translate(${p.x - w * 0.5}px, ${p.y - WORD_LINE_HEIGHT_PX * 0.5}px) rotate(${deg}deg)`;
    }

    raf = requestAnimationFrame(step);
  }

  function tryUnclip() {
    if (ropeCount >= words.length) return;
    /** Only while actively dragging (not physics alone). Don’t require dragIdx===0 — after a peel, remapping moves the grab to idx 1+ while still holding the same word. */
    if (!dragging || pts.length === 0) return;

    const now = performance.now();
    if (now - lastUnclipTime < UNCLIP_COOLDOWN_MS) return;

    const { x: ax, y: ay } = anchorPos();
    const p0 = pts[0];
    const dist = Math.hypot(p0.x - ax, p0.y - ay);
    if (dist > UNCLIP_DISTANCE_PX) {
      lastUnclipTime = now;
      const prevPts = pts.map((p) => ({ x: p.x, y: p.y, ox: p.ox, oy: p.oy }));
      ropeCount = Math.min(words.length, ropeCount + 1);
      rebuildDom();
      rebuildParticlesAfterUnclip(prevPts);
      if (dragging && dragGlobalWordIndex !== null) {
        remapDragAfterRebuild();
      }
      reattachPointerCaptureAfterDomRebuild();
    }
  }

  /**
   * With setPointerCapture on the word, pointer events are retargeted to that element,
   * so listeners on `.bio-rope__layer` never see move/up. Use document (capture) for
   * the whole drag so it works across the viewport and mouseup is reliable.
   */
  const dragListenerOpts = { capture: true, passive: true };

  function unbindDragDocumentListeners() {
    document.removeEventListener("pointermove", onDocumentPointerMove, dragListenerOpts);
    document.removeEventListener("pointerup", onDocumentPointerUp, dragListenerOpts);
    document.removeEventListener("pointercancel", onDocumentPointerUp, dragListenerOpts);
    window.removeEventListener("blur", onWindowBlur, dragListenerOpts);
  }

  function endDrag(e) {
    if (!dragging) return;
    if (e && e.pointerId !== pointerId) return;

    const id = pointerId;
    dragging = false;
    dragIdx = null;
    dragGlobalWordIndex = null;
    pointerId = null;

    root.classList.remove("bio-rope--dragging");
    unbindDragDocumentListeners();

    try {
      if (dragCaptureEl && id != null && dragCaptureEl.releasePointerCapture) {
        dragCaptureEl.releasePointerCapture(id);
      }
    } catch (_) {}
    dragCaptureEl = null;
  }

  /** After rebuildDom (unclip), the captured node was removed — capture on the new word span. */
  function reattachPointerCaptureAfterDomRebuild() {
    if (!dragging || pointerId == null) return;
    const el = wordSpans[dragIdx];
    if (!el) return;
    dragCaptureEl = el;
    try {
      el.setPointerCapture(pointerId);
    } catch (_) {}
  }

  function onWindowBlur() {
    endDrag(null);
  }

  function onDocumentPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      endDrag(e);
      return;
    }
    const rect = root.getBoundingClientRect();
    dragPointerX = e.clientX - rect.left - dragOffsetX;
    dragPointerY = e.clientY - rect.top - dragOffsetY;
    fixDraggedParticle();
    tryUnclip();
  }

  function onDocumentPointerUp(e) {
    endDrag(e);
  }

  function onPointerDown(e) {
    const t = e.target.closest?.(".bio-rope__word");
    if (!t || !layer.contains(t)) return;
    e.preventDefault();
    const ri = Number.parseInt(t.dataset.ropeI ?? "-1", 10);
    if (ri < 0 || ri >= pts.length) return;

    dragging = true;
    dragIdx = ri;
    const wStart = words.length - ropeCount;
    dragGlobalWordIndex = wStart + ri;
    pointerId = e.pointerId;
    dragCaptureEl = t;
    try {
      t.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = root.getBoundingClientRect();
    const p = pts[ri];
    dragOffsetX = e.clientX - rect.left - p.x;
    dragOffsetY = e.clientY - rect.top - p.y;
    dragPointerX = e.clientX - rect.left - dragOffsetX;
    dragPointerY = e.clientY - rect.top - dragOffsetY;
    fixDraggedParticle();

    root.classList.add("bio-rope--dragging");

    document.addEventListener("pointermove", onDocumentPointerMove, dragListenerOpts);
    document.addEventListener("pointerup", onDocumentPointerUp, dragListenerOpts);
    document.addEventListener("pointercancel", onDocumentPointerUp, dragListenerOpts);
    window.addEventListener("blur", onWindowBlur, dragListenerOpts);
  }

  layer.addEventListener("pointerdown", onPointerDown);

  let measureEl = null;

  function measureWidths() {
    if (measureEl) measureEl.remove();
    measureEl = mountMeasureLayer(root, fontCss);
    widths = measureWordWidths(words, measureEl);
    measureEl.remove();
    measureEl = null;
  }

  function startLoop() {
    measureWidths();
    rebuildDom();
    initParticles();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }

  document.fonts.ready.then(startLoop);

  const ro = new ResizeObserver(() => {
    measureWidths();
    if (dragging && dragGlobalWordIndex !== null) {
      remapDragAfterRebuild();
    }
  });
  ro.observe(root);

  function dispose() {
    endDrag(null);
    cancelAnimationFrame(raf);
    ro.disconnect();
    layer.removeEventListener("pointerdown", onPointerDown);
    container.classList.remove("panel__body--bio");
    container.innerHTML = "";
  }

  /** Put all words back in the paragraph; one word on the rope again. */
  function reset() {
    endDrag(null);
    ropeCount = 1;
    lastUnclipTime = 0;
    measureWidths();
    rebuildDom();
    initParticles();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }

  return { dispose, reset };
}
