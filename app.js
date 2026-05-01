import {
  isWelcomeAudioMuted,
  isWelcomeAudioPlaying,
  LISTENING_CHIP_LAYOUT_EXTRA_EM,
  toggleWelcomeAudioMute,
} from "./welcome-audio-player.js";

/*
 * Feature modules are lazy-loaded on the first chip interaction (click or pointer hover).
 * Keeps first-load JS tight — ~80 KB of projects-grid alone only ships when asked for.
 * Cached promise per key so repeat opens don't re-import.
 */
const featureLoaders = {
  bio: () => import("./bio-rope.js").then((m) => m.mountBioRope),
  label: () => import("./label-pretext.js").then((m) => m.mountLabelPretext),
  listening: () => import("./listening-welcome-audio.js").then((m) => m.mountListeningWelcome),
  "in-situ": () => import("./in-situ.js").then((m) => m.mountInSitu),
  projects: () => import("./projects-grid-portfolio.js").then((m) => m.mountProjectsGridPortfolio),
  text: () => import("./text-minesweeper.js").then((m) => m.mountText),
};
const featureCache = new Map();
function loadFeature(key) {
  if (!featureLoaders[key]) return null;
  if (!featureCache.has(key)) featureCache.set(key, featureLoaders[key]());
  return featureCache.get(key);
}

/* Track last input modality so we only auto-focus controls (e.g. [Close] after panel open)
 * for keyboard users. Safari treats a .focus() call inside a click handler as :focus-visible,
 * which paints the default ring on mouse opens — this avoids that. */
let lastInputWasKeyboard = false;
window.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Tab" || e.key === "Enter" || e.key === " " || e.key === "Escape" ||
        e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      lastInputWasKeyboard = true;
    }
  },
  true,
);
const markPointerInput = () => { lastInputWasKeyboard = false; };
window.addEventListener("mousedown", markPointerInput, true);
window.addEventListener("pointerdown", markPointerInput, true);
window.addEventListener("touchstart", markPointerInput, { capture: true, passive: true });

/* iOS Safari: force scroll to top-left on orientationchange to defeat the zoom-on-rotation bug. */
(function installIosOrientationFix() {
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
  const reset = () => setTimeout(() => window.scrollTo(0, 0), 100);
  window.addEventListener("orientationchange", reset);
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth !== lastWidth) {
      lastWidth = window.innerWidth;
      reset();
    }
  });
})();

const log = (...args) => console.log("[store1]", ...args);

/** Contact panel — full-bleed hero (same folder as this module). */
const CONTACT_WEBP_URL = new URL("./BUSINESSCARD.webp", import.meta.url).href;

/** Preload contact image; resolves after load + `decode()` when possible (bitmap ready for paint). */
function preloadContactImage() {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = async (ok) => {
      if (settled) return;
      settled = true;
      if (ok && typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          /* ignore */
        }
      }
      resolve(ok);
    };
    img.onload = () => void done(true);
    img.onerror = () => void done(false);
    img.src = CONTACT_WEBP_URL;
    if (img.complete && img.naturalWidth > 0) {
      void done(true);
    }
  });
}

/** One shared warm — starts as soon as `app.js` parses (parallel to Pretext import in `main`). */
const contactImageLoadPromise = preloadContactImage();

function showBootError(message) {
  const el = document.getElementById("appError");
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
}

/** Chip padding mirrors CSS: `padding: 0.105em 0.34em 0.09em` (em = chip font size). */
const CHIP_PAD_X_EM = 0.34 * 2;
const CHIP_PAD_Y_EM = 0.105 + 0.09;
/** Outer chip height includes `.chip__label { transform: scaleY(1.1) }`. */
const CHIP_LABEL_SCALE_Y = 1.1;
/** Extra em-height added by `.chip--tall` (extra padding + gap + sub-label line).
 * Mirrors styles.css `.chip--tall`:
 *   +0.4em pad-top, +0.4em pad-bot, +0.32em gap, +0.4em sub-label (font 0.4em × line-height 1)
 *   = 1.52em on top of the 1.295em compact chip. */
const TALL_CHIP_EXTRA_Y_EM = 1.52;

const CONTENT = {
  listening: { title: "Touch canvas to play/stop" },
  symposium: { title: "Language" },
  label: { title: "Label" },
  text: { title: "Text" },
  projects: { title: "Portfolio - Select" },
  bio: {
    title: "Bio",
    body: `Omar J, design engineer and full-stack developer building digital products end to end. I design and build interfaces and the systems behind them, shaping how they look and how they function. This page isn't static. Grab the last word and pull the string.`,
  },
  band: { title: "Band" },
  radio: { title: "Radio" },
  contact: { title: "Contact" },
  "in-situ": { title: "Process" },
};

/* Canonical panel routes (all lowercase path segments). */
const ROUTE_PATH_TO_KEY = Object.freeze({
  "/listening": "listening",
  "/symposium": "symposium",
  "/type": "label",
  "/portfolio": "projects",
  "/bio": "bio",
  "/contact": "contact",
  "/process": "in-situ",
});

const ROUTE_KEY_TO_PATH = Object.freeze(
  Object.entries(ROUTE_PATH_TO_KEY).reduce((acc, [path, key]) => {
    acc[key] = path;
    return acc;
  }, {}),
);

function normalizeRoutePath(pathname) {
  if (!pathname) return "/";
  const lower = pathname.toLowerCase();
  if (lower.length > 1 && lower.endsWith("/")) return lower.replace(/\/+$/, "");
  return lower;
}

function panelKeyFromPath(pathname) {
  return ROUTE_PATH_TO_KEY[normalizeRoutePath(pathname)] ?? null;
}

function pathForPanelKey(key) {
  if (!key) return "/";
  return ROUTE_KEY_TO_PATH[key] ?? "/";
}

/** Keep identical to `.chips { font-family }` in index.html — Pretext canvas must match painted chips. */
function chipFont(px) {
  return `400 ${px}px "Monument Grotesk Variable", sans-serif`;
}

function rootFontPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Same curve as CSS `clamp(3.2rem, 19dvw, 12rem)` on `:root` rem.
 * `stripInnerW` — content width of `.chips-viewport` (Pretext pack region); ties the vw term to the real chip track when it differs from full viewport (common in landscape flex).
 * Cap raised (from 6.85rem → 12rem) and preferred raised (10.75 → 19) so the remaining
 * chips grow into space freed by hiding Band / Radio. Binary-search packing
 * still shrinks below this if a row would overflow.
 */
function maxChipFontPx(stripInnerW) {
  const vw =
    window.visualViewport?.width ??
    document.documentElement.clientWidth ??
    window.innerWidth;
  const rem = rootFontPx();
  const minPx = 3.2 * rem;
  const maxPx = 12 * rem;
  const wForPreferred =
    stripInnerW > 8 ? Math.min(vw, stripInnerW) : vw;
  const preferred = 0.19 * wForPreferred;
  return Math.min(maxPx, Math.max(minPx, preferred));
}

/** Background for the chip titles surface — yellow. */
const TITLES_PAGE_BG = "#FFF717";

const IDLE_SCREENSAVER_MS = 20_000;

/** Canvas + Pretext ribbon on hidden SVG path (see index-screensaver-lab.html). */
function installIdleScreensaver({
  prepareWithSegments,
  measureNaturalWidth,
  shouldBlockScreensaver = () => false,
} = {}) {
  if (typeof prepareWithSegments !== "function" || typeof measureNaturalWidth !== "function") {
    console.error("[store1] installIdleScreensaver: missing Pretext helpers");
    return;
  }

  const MARQUEE =
    " OMAR J  ●  DESIGN ENGINEER  ●  BUILDING PLAYFUL SYSTEMS IN MOTION  ● ".repeat(3);
  const FONT =
    '500 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  const PATH_SAMPLES = 500;
  const DURATION_SEC = 400;
  const PERP_OFFSET = 5;
  const TANGENT_DELTA_PX = 3;
  const VB = { w: 800, h: 300 };
  const TARGET_FPS = 24;
  const MAX_DPR = 1.25;

  const advanceCache = new Map();
  function pretextAdvance(grapheme) {
    let w = advanceCache.get(grapheme);
    if (w === undefined) {
      const p = prepareWithSegments(grapheme, FONT, { whiteSpace: "pre-wrap" });
      w = measureNaturalWidth(p);
      advanceCache.set(grapheme, w);
    }
    return w;
  }

  const graphemeSeg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const letters = [...graphemeSeg.segment(MARQUEE)].map((s) => s.segment);
  const advances = letters.map((g) => pretextAdvance(g));
  const cumBefore = [];
  let acc = 0;
  for (let i = 0; i < advances.length; i++) {
    cumBefore.push(acc);
    acc += advances[i];
  }
  const totalRibbon = acc;

  const overlay = document.createElement("div");
  overlay.className = "idle-screensaver";
  overlay.setAttribute("aria-hidden", "true");

  const blurLayer = document.createElement("div");
  blurLayer.className = "idle-screensaver__blur";
  overlay.appendChild(blurLayer);

  const bg = document.createElement("div");
  bg.className = "idle-screensaver__bg";
  overlay.appendChild(bg);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("idle-screensaver__path-src");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 800 300");

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute(
    "d",
    "M400,150 C835,-158 860,458 400,150 C-60,-130 -35,430 400,150 Z",
  );
  svg.appendChild(path);
  overlay.appendChild(svg);

  const canvas = document.createElement("canvas");
  canvas.className = "idle-screensaver__canvas";
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  const pathLen = path.getTotalLength();
  const points = [];
  for (let i = 0; i <= PATH_SAMPLES; i++) {
    const dist = (i / PATH_SAMPLES) * pathLen;
    points.push(path.getPointAtLength(dist));
  }

  function xyAtPathDist(u) {
    const u0 = ((u % pathLen) + pathLen) % pathLen;
    const tNorm = u0 / pathLen;
    const index = tNorm * PATH_SAMPLES;
    const lower = Math.min(Math.floor(index), PATH_SAMPLES - 1);
    const upper = lower + 1;
    const lerp = index - lower;
    const x = points[lower].x + (points[upper].x - points[lower].x) * lerp;
    const y = points[lower].y + (points[upper].y - points[lower].y) * lerp;
    return { x, y };
  }

  function xyTangentAtPathDist(u) {
    const p0 = xyAtPathDist(u);
    const p1 = xyAtPathDist(u + TANGENT_DELTA_PX);
    return { x: p0.x, y: p0.y, dx: p1.x - p0.x, dy: p1.y - p0.y };
  }

  const ctx = canvas.getContext("2d");
  let reduceMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function drawFrameAt(progress) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = canvas.width / Math.max(w, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* Dimming is `.idle-screensaver__bg`; blur is `.idle-screensaver__blur` — avoid a second black fill on canvas. */
    ctx.clearRect(0, 0, w, h);

    const s = Math.min(w / VB.w, h / VB.h);
    const ox = (w - VB.w * s) / 2;
    const oy = (h - VB.h * s) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.globalCompositeOperation = "difference";
    ctx.font = FONT;
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.textBaseline = "middle";

    const ribbonScroll = progress * totalRibbon;

    for (let i = 0; i < letters.length; i++) {
      const ch = letters[i];
      const centerRibbon = cumBefore[i] + advances[i] / 2;
      const pos =
        (((centerRibbon + ribbonScroll) % totalRibbon) + totalRibbon) % totalRibbon;
      const pathDist = (pos / totalRibbon) * pathLen;
      const { x, y, dx, dy } = xyTangentAtPathDist(pathDist);
      const len = Math.hypot(dx, dy);
      let px = 0;
      let py = 0;
      if (len > 0) {
        px = (-dy / len) * PERP_OFFSET;
        py = (dx / len) * PERP_OFFSET;
      }
      const finalX = x + px;
      const finalY = y + py;
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(finalX, finalY);
      ctx.rotate(angle);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  let active = false;
  let rafId = 0;
  let idleTimer = 0;
  let animT0 = 0;
  let lastDrawTs = 0;
  const frameIntervalMs = 1000 / TARGET_FPS;

  function drawFrame(ts) {
    if (!active) return;
    if (ts - lastDrawTs < frameIntervalMs - 0.25) {
      rafId = requestAnimationFrame(drawFrame);
      return;
    }
    lastDrawTs = ts;
    const progress = ((performance.now() - animT0) / 1000 / DURATION_SEC) % 1;
    drawFrameAt(progress);
    rafId = requestAnimationFrame(drawFrame);
  }

  function show() {
    if (shouldBlockScreensaver()) {
      resetIdleCountdown();
      return;
    }
    if (active) return;
    active = true;
    animT0 = performance.now();
    lastDrawTs = 0;
    overlay.classList.add("is-visible");
    resizeCanvas();
    if (reduceMotion) {
      drawFrameAt(0);
      return;
    }
    rafId = requestAnimationFrame(drawFrame);
  }

  function hide() {
    if (!active) return;
    active = false;
    overlay.classList.remove("is-visible");
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function resetIdleCountdown() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = window.setTimeout(show, IDLE_SCREENSAVER_MS);
  }

  const handleUserActivity = () => {
    hide();
    resetIdleCountdown();
  };

  const activityEvents = [
    "pointermove",
    "pointerdown",
    "wheel",
    "keydown",
    "touchstart",
  ];
  activityEvents.forEach((type) => {
    window.addEventListener(type, handleUserActivity, { capture: true, passive: true });
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    if (active && reduceMotion) drawFrameAt(0);
  });

  if (typeof matchMedia !== "undefined") {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", () => {
      reduceMotion = mq.matches;
      if (!active) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastDrawTs = 0;
      if (reduceMotion) drawFrameAt(0);
      else {
        animT0 = performance.now();
        rafId = requestAnimationFrame(drawFrame);
      }
    });
  }

  window.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hide();
      if (idleTimer) clearTimeout(idleTimer);
      return;
    }
    resetIdleCountdown();
  });

  resetIdleCountdown();
}

async function main() {
  if (window.location.protocol === "file:") {
    const msg =
      "This page must be served over http:// (not opened as a file). Run: npm run dev — then open the http://localhost URL shown in the terminal.";
    console.error("[store1]", msg);
    showBootError(msg);
    return;
  }

  document.body.style.setProperty("--titles-page-bg", TITLES_PAGE_BG);

  let prepareWithSegments;
  let measureNaturalWidth;
  try {
    /* Same-origin vendor copy — avoids esm.sh (often blocked on mobile / strict networks). */
    const pretext = await import("./vendor/pretext/layout.js");
    prepareWithSegments = pretext.prepareWithSegments;
    measureNaturalWidth = pretext.measureNaturalWidth;
  } catch (err) {
    const msg =
      "Could not load Pretext (missing vendor/pretext files or bad deploy). Check the console.";
    console.error("[store1] boot: FAILED to import ./vendor/pretext/layout.js", err);
    showBootError(msg);
    return;
  }

  const page = document.querySelector(".page");
  const panelWrap = document.getElementById("panelWrap");
  const titleLayer = document.getElementById("titleLayer");
  const panel = document.getElementById("panel");
  const panelTitle = document.getElementById("panelTitle");
  const panelClose = document.getElementById("panelClose");
  const panelSecondary = document.getElementById("panelSecondary");
  const panelNext = document.getElementById("panelNext");
  const panelBody = document.getElementById("panelBody");
  const chipsViewport = document.getElementById("chipsViewport");
  const chipsRoot = document.getElementById("chips");
  const chips = Array.from(document.querySelectorAll(".chip[data-key]"));
  const listeningChipIndex = chips.findIndex((btn) => btn.getAttribute("data-key") === "listening");

  if (
    !page ||
    !panelWrap ||
    !titleLayer ||
    !panel ||
    !panelTitle ||
    !panelBody ||
    !chipsViewport ||
    !chipsRoot
  ) {
    console.error("[store1] boot: missing required elements");
    return;
  }

  /* Firefox perf: mirror `panel__body--<type>` onto `.panel` as `panel--for-<type>`
     so the stylesheet can target the panel chrome with plain class selectors
     instead of `.panel:has(#panelBody.panel__body--<type>)`. Gecko re-evaluates
     `:has()` against the entire panel subtree on every style invalidation —
     including every grid-track frame of the projects-grid expand tween — which
     is the dominant Firefox bottleneck on that page. Plain class selectors are
     a constant-time lookup. */
  {
    const PANEL_BODY_TYPES = ["bio", "label", "listening", "contact", "projects", "in-situ", "text"];
    const syncPanelBodyTypeClass = () => {
      PANEL_BODY_TYPES.forEach((t) => {
        const has = panelBody.classList.contains(`panel__body--${t}`);
        panel.classList.toggle(`panel--for-${t}`, has);
      });
    };
    syncPanelBodyTypeClass();
    new MutationObserver(syncPanelBodyTypeClass).observe(panelBody, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  /* Cell full-expand FLIP runs ~680ms (FULL_EXPAND_MEDIA_MS) plus a 0.7s grid
     column tween. We delay the toolbar dark-mode swap until the expansion has
     visually settled so the chrome doesn't flip mid-animation. Collapse
     reverses immediately. */
  const PROJECTS_DARK_DELAY_MS = 720;
  /* Length of the collapse (dark → light) tween. MUST stay in sync with the
     0.3s `.panel--projects-collapsing` transitions in styles.css — change both
     together. The collapsing class gates those base ease-in transitions so
     they only fire during this window; outside of it tab swaps snap. */
  const PROJECTS_COLLAPSE_MS = 300;
  let projectsDarkTimer = null;
  let projectsCollapseTimer = null;
  /* Label [Color] fade gate lifetime — keep in sync with styles.css (0.34s). */
  const LABEL_COLOR_FADE_MS = 340;
  let labelColorFadeTimer = null;
  /* Set true while `clearPanelContent` is tearing down the portfolio mount.
     `projectsMount.dispose()` will sync-emit a collapse event, but in that
     case we are LEAVING the page entirely — chrome should snap to the next
     tab's colors, not run the 0.3s in-page collapse fade. The Back / Escape
     paths call `collapseExpandedProject()` directly without flipping this
     flag, so true in-page collapses keep their fade. */
  let isTearingDownProjects = false;
  panelBody.addEventListener("store1-projects-expanded", (e) => {
    if (openKey !== "projects" || !panelClose) return;
    const expanded = !!e.detail?.expanded;
    panelClose.textContent = expanded ? "[Back]" : "[Close]";
    panelClose.setAttribute(
      "aria-label",
      expanded ? "Back to project grid" : "Close panel",
    );
    if (projectsDarkTimer) {
      clearTimeout(projectsDarkTimer);
      projectsDarkTimer = null;
    }
    if (projectsCollapseTimer) {
      clearTimeout(projectsCollapseTimer);
      projectsCollapseTimer = null;
    }
    if (expanded) {
      projectsDarkTimer = setTimeout(() => {
        projectsDarkTimer = null;
        panel.classList.add("panel--projects-expanded");
      }, PROJECTS_DARK_DELAY_MS);
    } else if (isTearingDownProjects) {
      /* Page is being closed / swapped — strip dark mode instantly so the
         next tab's chrome paints in its own color without inheriting a fade. */
      panel.classList.remove("panel--projects-expanded");
    } else {
      /* In-page collapse (Back / Escape) — add the collapsing class BEFORE
         removing expanded so the gated 0.3s ease-in transitions apply to the
         very first style recalc. */
      panel.classList.add("panel--projects-collapsing");
      panel.classList.remove("panel--projects-expanded");
      projectsCollapseTimer = setTimeout(() => {
        projectsCollapseTimer = null;
        panel.classList.remove("panel--projects-collapsing");
      }, PROJECTS_COLLAPSE_MS);
    }
    const name = e.detail?.projectName;
    if (expanded && typeof name === "string" && name.trim()) {
      const trimmedName = name.trim();
      panelTitle.textContent =
        trimmedName === "Chrome Extension - Pomodoro Timer"
          ? trimmedName
          : `Website - ${trimmedName}`;
    } else {
      panelTitle.textContent = "Portfolio - Select";
    }
  });

  /* Wait for the chip face before measuring — avoids Pretext layout + chips--ready flip
   * when Monument swaps in and widths change (CLS on hard refresh). */
  if (document.fonts) {
    try {
      await document.fonts.load('400 16px "Monument Grotesk Variable"');
    } catch {
      /* ignore */
    }
    /* Warm the Listening font early so the panel title usually has the real face on first open. */
    document.fonts.load('700 72px "Tangerine"').catch(() => {
      /* ignore */
    });
  }

  const labels = chips.map((btn) => btn.querySelector(".chip__label")?.textContent ?? "");

  /** Typesetting: nothing after this chip may share its row (see tryPack). */
  const textChipIndex = chips.findIndex((btn) => btn.getAttribute("data-key") === "text");

  let openKey = null;
  let suppressRouteSync = false;
  /** Bumps every `openPanel` so deferred rAF work can ignore superseded opens. */
  let openPanelOpSeq = 0;
  /** @type {{ dispose: () => void; reset: () => void } | null} */
  let labelMount = null;
  /** @type {{ dispose: () => void; reset: () => void } | null} */
  let bioMount = null;
  /** @type {{ dispose: () => void } | null} */
  let listeningMount = null;
  /** @type {{ dispose: () => void } | null} */
  let inSituMount = null;
  /** @type {{ dispose: () => void } | null} */
  let projectsMount = null;
  /** Floating Win98 Minesweeper window — mounted on <body>, not in panelBody. */
  /** @type {{ dispose: () => void, newGame: () => void, focus?: () => void } | null} */
  let textMount = null;
  /** Set while contact panel content is live — same vCard download as touch markers. */
  let contactDownloadVCard = null;

  installIdleScreensaver({
    prepareWithSegments,
    measureNaturalWidth,
    shouldBlockScreensaver: () => {
      const projectsExpanded =
        openKey === "projects" && panel.classList.contains("panel--projects-expanded");
      const listeningActiveAndPlaying =
        openKey === "listening" && isWelcomeAudioPlaying();
      return projectsExpanded || listeningActiveAndPlaying;
    },
  });

  /** One persistent DOM node for CONTACT image: pre-mounted off-screen at boot, then moved in/out of panelBody. */
  const contactPanelImg = document.createElement("img");
  contactPanelImg.className = "contact-panel__img";
  contactPanelImg.src = CONTACT_WEBP_URL;
  contactPanelImg.alt = "Contact";
  contactPanelImg.decoding = "sync";
  contactPanelImg.fetchPriority = "high";
  const contactImageStash = document.createElement("div");
  contactImageStash.setAttribute("aria-hidden", "true");
  contactImageStash.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:-9999px",
    "width:1px",
    "height:1px",
    "overflow:hidden",
    "opacity:0",
    "pointer-events:none",
  ].join(";");
  contactImageStash.appendChild(contactPanelImg);
  document.body.appendChild(contactImageStash);
  function stashContactPanelImage() {
    if (!contactImageStash.contains(contactPanelImg)) {
      contactImageStash.appendChild(contactPanelImg);
    }
  }

  function clearPanelContent() {
    if (labelMount) {
      labelMount.dispose();
      labelMount = null;
    }
    if (bioMount) {
      bioMount.dispose();
      bioMount = null;
    }
    if (listeningMount) {
      listeningMount.dispose();
      listeningMount = null;
    }
    if (inSituMount) {
      inSituMount.dispose();
      inSituMount = null;
    }
    if (projectsMount) {
      /* `dispose` will sync-fire a collapse event from inside `collapseCell`.
         The flag tells the handler this is a teardown (LEAVING the page), so
         it should snap instead of running the in-page collapse fade. */
      isTearingDownProjects = true;
      try {
        projectsMount.dispose();
      } finally {
        isTearingDownProjects = false;
      }
      projectsMount = null;
    }
    /* `textMount` is the floating Win98 Minesweeper window, not panel content —
       it lives on document.body and persists across panel opens/closes. Don't
       dispose it here; toggle it via setTextWindow(...) on chip click instead. */
    if (panelBody.contains(contactPanelImg)) {
      /* Move it back to the stash before nuking panelBody so we reuse the same DOM <img>. */
      stashContactPanelImage();
    }
    panelBody.innerHTML = "";
    panelBody.classList.remove("panel__body--contact");
    panelBody.classList.remove("panel__body--projects");
    panelBody.classList.remove("panel__body--in-situ");
    panel.classList.remove("in-situ--invert");
    panel.classList.remove("in-situ--toggling");
    panel.classList.remove("panel--color-surface");
    panel.classList.remove("panel--color-surface-toggling");
    panel.classList.remove("panel--projects-expanded");
    panel.classList.remove("panel--projects-collapsing");
    if (projectsDarkTimer) {
      clearTimeout(projectsDarkTimer);
      projectsDarkTimer = null;
    }
    if (projectsCollapseTimer) {
      clearTimeout(projectsCollapseTimer);
      projectsCollapseTimer = null;
    }
    if (labelColorFadeTimer) {
      clearTimeout(labelColorFadeTimer);
      labelColorFadeTimer = null;
    }
    contactDownloadVCard = null;
    if (panelSecondary) {
      panelSecondary.textContent = "[Visit]";
      panelSecondary.setAttribute("aria-label", "Visit welcome.audio");
      panelSecondary.removeAttribute("aria-pressed");
    }
    if (panelNext) {
      panelNext.hidden = true;
      panelNext.setAttribute("aria-label", "Next");
    }
    if (panelClose) {
      panelClose.textContent = "[Close]";
      panelClose.setAttribute("aria-label", "Close panel");
    }
    panelTitle.textContent = "";
  }

  /** Must match `body { --motion-duration }` in index.html (0.75s → 750). */
  const PANEL_MS = 750;

  const portraitMq = window.matchMedia("(orientation: portrait)");

  /** Panel motion is always on #titleLayer (portrait: height; landscape: transform). */
  function transitionSurface() {
    return titleLayer || panelWrap;
  }

  function isPanelTransitionProperty(name) {
    if (portraitMq.matches) return name === "height";
    return name === "transform";
  }
  let closingTimer = null;
  let closingHandler = null;
  let panelClosing = false;

  function abortPendingClose() {
    if (closingTimer) {
      clearTimeout(closingTimer);
      closingTimer = null;
    }
    if (closingHandler) {
      panelWrap.removeEventListener("transitionend", closingHandler);
      titleLayer.removeEventListener("transitionend", closingHandler);
      closingHandler = null;
    }
    panelClosing = false;
  }

  function runAfterPanelClose() {
    if (!panelClosing) return;
    panelClosing = false;
    clearPanelContent();
    openKey = null;
    panelWrap.setAttribute("aria-hidden", "true");
    scheduleChipLayout();
  }

  let layoutRaf = 0;
  function scheduleChipLayout() {
    if (layoutRaf) cancelAnimationFrame(layoutRaf);
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      layoutChipsInViewport();
    });
  }

  /** Let class/style writes commit first, then repack on the following frame. */
  function scheduleChipLayoutNextFrame(forceStyleTarget = null) {
    if (forceStyleTarget) {
      /* Mobile Blink/WebKit can coalesce class flips + repack into one paint;
         force a style/layout read so the chip tween has a real start frame. */
      void forceStyleTarget.offsetHeight;
    }
    requestAnimationFrame(() => {
      scheduleChipLayout();
    });
  }

  /** Gap in px — matches `.chips { gap: 0.75rem }`. */
  function chipGapPx() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return 0.75 * rem;
  }

  /**
   * Pack chips into region using Pretext widths; returns fits + positions + size + font px.
   */
  function tryPack(fontSizePx, regionW, regionH, gapX, gapY) {
    if (fontSizePx < 2 || regionW < 8 || regionH < 8) {
      return { fits: false, positions: [], fontSizePx, contentW: 0, contentH: 0 };
    }

    const sizes = [];
    for (let i = 0; i < labels.length; i++) {
      const prepared = prepareWithSegments(labels[i], chipFont(fontSizePx));
      let textW = measureNaturalWidth(prepared);
      /* Listening chip gains a non-text SVG; Pretext only measures the word "Listening" from labels[]. */
      if (i === listeningChipIndex && isWelcomeAudioPlaying()) {
        textW += fontSizePx * LISTENING_CHIP_LAYOUT_EXTRA_EM;
      }
      const padX = CHIP_PAD_X_EM * fontSizePx + 2;
      let padY = CHIP_PAD_Y_EM * fontSizePx;
      /* Tall variant carries one extra chip-height of vertical padding (see `.chip--tall`).
         Reading the class on every pack so a toggle reflows neighbours via Pretext. */
      if (chips[i]?.classList.contains("chip--tall")) {
        padY += fontSizePx * TALL_CHIP_EXTRA_Y_EM;
      }
      /* Ceil so row/width sums never under-count vs subpixel DOM (tight “always fit” pack). */
      const w = Math.ceil(textW + padX);
      const h = Math.ceil(fontSizePx * CHIP_LABEL_SCALE_Y + padY);
      sizes.push({ w, h });
    }

    let x = 0;
    let y = 0;
    let rowH = 0;
    const positions = [];
    let maxContentX = 0;

    for (let i = 0; i < sizes.length; i++) {
      const { w, h } = sizes[i];
      if (w > regionW) {
        return { fits: false, positions: [], fontSizePx, contentW: 0, contentH: 0 };
      }
      if (x > 0 && x + w > regionW) {
        x = 0;
        y += rowH + gapY;
        rowH = 0;
      }
      positions.push({ x, y });
      maxContentX = Math.max(maxContentX, x + w);
      rowH = Math.max(rowH, h);
      x += w + gapX;

      if (textChipIndex === i && i + 1 < sizes.length) {
        x = 0;
        y += rowH + gapY;
        rowH = 0;
      }
    }

    const contentH = y + rowH;
    const contentW = maxContentX;
    const fits = contentW <= regionW + 0.5 && contentH <= regionH + 0.5;

    return { fits, positions, sizes, fontSizePx, contentW, contentH };
  }

  function layoutChipsInViewport() {
    /*
     * Pack region = `.chips-viewport` content box (padding excluded). Prefer this over
     * `#chips` getBoundingClientRect(): in landscape the title layer is fixed + flex;
     * percentage height on `#chips` can read 0 or lag while the viewport already has a
     * stable client size — portrait often hid the mismatch.
     */
    const vp = chipsViewport;
    const cs = getComputedStyle(vp);
    const padLR =
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padTB =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    let regionW = Math.max(0, Math.floor(vp.clientWidth - padLR));
    let regionH = Math.max(0, Math.floor(vp.clientHeight - padTB));
    if (regionW < 4 || regionH < 4) {
      const rect = chipsRoot.getBoundingClientRect();
      regionW = Math.max(regionW, Math.floor(rect.width));
      regionH = Math.max(regionH, Math.floor(rect.height));
    }

    /*
     * Landscape drawer: `.title-layer` only moves via `transform` — chip DOM size stays
     * full-viewport, so ResizeObserver never fires, yet the on-screen strip is only
     * (viewport − panel). Pack to that width so Pretext reflows; portrait shrinks height
     * instead and already triggers resize.
     */
    if (!portraitMq.matches && page.classList.contains("page--open") && panelWrap) {
      const viewW =
        window.visualViewport?.width ??
        document.documentElement.clientWidth ??
        window.innerWidth;
      const panelW = Math.ceil(panelWrap.getBoundingClientRect().width);
      const outerVisible = Math.max(0, Math.floor(viewW - panelW));
      const visibleInner = Math.max(0, outerVisible - padLR);
      if (visibleInner >= 32) {
        regionW = Math.min(regionW, visibleInner);
      }
    }

    const gap = chipGapPx();

    if (regionW < 4 || regionH < 4) return;

    const gapX = gap;
    const gapY = gap;
    const hi0 = maxChipFontPx(regionW);
    const floor = 4;
    let best = tryPack(floor, regionW, regionH, gapX, gapY);

    const top = tryPack(hi0, regionW, regionH, gapX, gapY);
    if (top.fits) {
      best = top;
    } else {
      let lo = floor;
      let hi = hi0;
      for (let iter = 0; iter < 24; iter++) {
        const mid = (lo + hi) / 2;
        const trial = tryPack(mid, regionW, regionH, gapX, gapY);
        if (trial.fits) {
          best = trial;
          lo = mid;
        } else {
          hi = mid;
        }
        if (hi - lo < 0.25) break;
      }
    }

    const { positions, fontSizePx } = best;

    chipsViewport.style.setProperty("--chip-font-size", `${fontSizePx}px`);

    chips.forEach((btn, i) => {
      const p = positions[i];
      if (!p) return;
      btn.style.transform = `translate(${p.x}px, ${p.y}px)`;
    });

    if (positions.length === chips.length) {
      chipsRoot.classList.add("chips--ready");
      if (!chipsRoot.classList.contains("chips--motion")) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            chipsRoot.classList.add("chips--motion");
          });
        });
      }
    }
  }

  function openPanel(key) {
    const entry = CONTENT[key];
    if (!entry) return;

    abortPendingClose();

    clearPanelContent();

    const opId = ++openPanelOpSeq;

    openKey = key;
    if (!suppressRouteSync) {
      const nextPath = pathForPanelKey(key);
      const currentPath = normalizeRoutePath(window.location.pathname);
      const mode = currentPath === nextPath ? "replaceState" : "pushState";
      window.history[mode]({ panelKey: key }, "", nextPath);
    }

    panelTitle.textContent = entry.title;

    if (panelSecondary) {
      if (key === "bio") {
        panelSecondary.removeAttribute("aria-pressed");
        panelSecondary.textContent = "[Reset]";
        panelSecondary.setAttribute("aria-label", "Reset bio — reattach the text");
        panelSecondary.hidden = false;
      } else if (key === "label") {
        panelSecondary.removeAttribute("aria-pressed");
        panelSecondary.textContent = "[Color]";
        panelSecondary.setAttribute("aria-label", "Color");
        panelSecondary.hidden = false;
      } else if (key === "contact") {
        panelSecondary.removeAttribute("aria-pressed");
        panelSecondary.textContent = "[Add]";
        panelSecondary.setAttribute("aria-label", "Save Omar J to contacts");
        panelSecondary.hidden = false;
      } else if (key === "projects") {
        panelSecondary.removeAttribute("aria-pressed");
        panelSecondary.hidden = true;
        if (panelNext) {
          panelNext.hidden = true;
        }
      } else if (key === "in-situ") {
        panel.classList.remove("in-situ--invert");
        panelSecondary.textContent = "[Light]";
        panelSecondary.setAttribute("aria-label", "Light appearance — tap for inverted view");
        panelSecondary.setAttribute("aria-pressed", "false");
        panelSecondary.hidden = false;
      } else {
        panelSecondary.removeAttribute("aria-pressed");
        panelSecondary.textContent = "[Visit]";
        panelSecondary.setAttribute("aria-label", "Visit welcome.audio");
        panelSecondary.hidden = false;
      }
    }

    if (key === "bio" && entry.body) {
      loadFeature("bio")?.then(
        (mount) => {
          if (opId !== openPanelOpSeq) return;
          bioMount = mount(panelBody, entry.body);
        },
        (err) => {
          if (opId !== openPanelOpSeq) return;
          log("bio module load failed", err);
          panelBody.textContent =
            "Bio could not load (often: opening the site as a file instead of from a server). Run npm run dev and open http://127.0.0.1:3000";
        },
      );
    } else if (key === "label") {
      loadFeature("label")?.then((mount) => {
        if (opId !== openPanelOpSeq) return;
        labelMount = mount(panelBody);
        /* Only auto-focus the input on a true desktop (mouse + hover). On any touch
           device, the prefetched module resolves inside the click's user-activation
           window, which would pop the on-screen keyboard. label-pretext.js already
           focuses on canvas tap, so mobile users tap to type. */
        const isDesktop =
          window.matchMedia("(pointer: fine) and (hover: hover)").matches &&
          !("ontouchstart" in window) &&
          (navigator.maxTouchPoints || 0) === 0;
        const ta = panelBody.querySelector(".label-editor__overlay-input");
        if (isDesktop) {
          ta?.focus();
        } else if (ta && document.activeElement === ta) {
          /* Defensive: iOS may auto-focus a textarea created inside a click's
             user-activation window. Push focus back so no keyboard opens. */
          ta.blur();
        }
      });
    } else if (key === "contact") {
      panelBody.classList.add("panel__body--contact");
      /* Same promise as module-level warm + `<link rel=preload>`, plus a persistent pre-mounted DOM node. */
      contactImageLoadPromise.then(() => {
        if (opId !== openPanelOpSeq) return;
        const img = contactPanelImg;
        panelBody.appendChild(img);

        /* Image-space tracker. The image is rendered with `object-fit: cover;
           object-position: center`, so the on-screen rect of the bitmap differs
           from the <img> element rect when aspect ratios disagree. Map a point
           in natural-image pixels (px, py) to element-local pixels so we can
           pin overlays to features in the photo regardless of resize. */
        /* All marker geometry is in IMAGE-NATURAL pixels (relative to bitmap size).
           At paint time we multiply by the cover scale so markers grow/shrink
           with the photo and stay glued to the same features. */
        const MARKER_SPECS = [
          {
            color: "red",
            width: 160,
            height: 23,
            dx: 24,
            dy: -8,
            href: "mailto:contact@omarj.dev",
            label: "Email contact@omarj.dev",
          },
          {
            color: "lime",
            width: 110,
            height: 23,
            dx: -5,
            dy: 15,
            href: "https://www.instagram.com/omarj.www/",
            label: "Instagram @omarj.www",
            external: true,
          },
          {
            color: "blue",
            width: 120,
            height: 23,
            dx: -10,
            dy: 38,
            href: "tel:0432674199",
            label: "Call 0432 674 199",
          },
        ];
        const markers = MARKER_SPECS.map((spec) => {
          const m = document.createElement("a");
          m.className = "contact-panel__marker";
          m.style.background = spec.color;
          m.href = spec.href;
          m.setAttribute("aria-label", spec.label);
          if (spec.external) {
            m.target = "_blank";
            m.rel = "noopener noreferrer";
          }
          panelBody.appendChild(m);
          return m;
        });

        /* Touch UAs (no mouse): every marker becomes a "Save contact" tap that
           offers a vCard download instead of the per-link action. iOS opens
           the Contacts add-sheet for `.vcf` + `text/vcard`; Android delegates
           to Contacts via the same MIME. Desktop keeps the original behaviour
           (call / open IG / mailto). */
        const isTouchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
        /* Favicon → base64 PNG for the vCard PHOTO field. The favicon is an
           SVG (a yellow disc); vCard 3.0 only supports raster TYPEs (PNG /
           JPEG / GIF), so we rasterize it once via canvas and cache the
           base64. If preload hasn't completed by the time the user taps,
           the PHOTO field is omitted (the rest of the card still works). */
        let photoBase64 = null;
        (function preloadPhoto() {
          const SIZE = 256;
          const im = new Image();
          im.onload = () => {
            try {
              const c = document.createElement("canvas");
              c.width = SIZE;
              c.height = SIZE;
              const ctx = c.getContext("2d");
              ctx.drawImage(im, 0, 0, SIZE, SIZE);
              photoBase64 = c.toDataURL("image/png").split(",")[1] || null;
            } catch {
              /* canvas tainted (cross-origin) — skip photo. */
            }
          };
          im.onerror = () => { /* ignore */ };
          im.src = new URL("./favicon.svg", import.meta.url).href;
        })();

        /* RFC 6350 §3.2: lines longer than 75 octets MUST be folded — break
           every 75 chars and prefix continuation lines with a single space.
           Critical for embedded base64 PHOTO; many importers reject otherwise. */
        function foldLine(line) {
          if (line.length <= 75) return line;
          const parts = [line.slice(0, 75)];
          for (let i = 75; i < line.length; i += 74) {
            parts.push(" " + line.slice(i, i + 74));
          }
          return parts.join("\r\n");
        }

        function buildVCard() {
          /* vCard 3.0 — broadest support across iOS Contacts, Android, macOS. */
          /* Two URLs: the personal site and an Instagram link. Apple's
             item-group + X-ABLabel gives them human-readable labels in iOS /
             macOS Contacts ("home page", "Instagram"); other clients ignore
             the labels and just list the URLs. */
          const lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            "N:J;Omar;;;",
            "FN:Omar J",
            "TEL;TYPE=CELL,VOICE:+61432674199",
            "EMAIL;TYPE=INTERNET:contact@omarj.dev",
            "item1.URL:https://www.omarj.dev",
            "item1.X-ABLabel:_$!<HomePage>!$_",
            "item2.URL:https://www.instagram.com/omarj.www/",
            "item2.X-ABLabel:Instagram",
          ];
          if (photoBase64) {
            lines.push(foldLine(`PHOTO;ENCODING=b;TYPE=PNG:${photoBase64}`));
          }
          lines.push("END:VCARD", "");
          /* CRLF per RFC 6350 — Apple Contacts is forgiving but Outlook/some
             Android importers reject LF-only files. */
          return lines.join("\r\n");
        }
        function downloadVCard() {
          const blob = new Blob([buildVCard()], { type: "text/vcard;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "omar-j.vcf";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          /* Revoke after the click has had a chance to start the download —
             revoking too early can cancel the download in some browsers. */
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        contactDownloadVCard = downloadVCard;
        if (isTouchOnly) {
          markers.forEach((m) => {
            m.setAttribute("aria-label", "Save Omar J to contacts");
            m.addEventListener("click", (e) => {
              e.preventDefault();
              downloadVCard();
            });
          });
        }

        function coverScale() {
          const natW = img.naturalWidth || 1;
          const natH = img.naturalHeight || 1;
          return Math.max(img.clientWidth / natW, img.clientHeight / natH);
        }

        function imageToElement(px, py) {
          const natW = img.naturalWidth || 1;
          const natH = img.naturalHeight || 1;
          const elW = img.clientWidth;
          const elH = img.clientHeight;
          const s = Math.max(elW / natW, elH / natH);
          return { x: px * s + (elW - natW * s) / 2, y: py * s + (elH - natH * s) / 2 };
        }

        function placeMarker() {
          const natW = img.naturalWidth || 1;
          const natH = img.naturalHeight || 1;
          const s = coverScale();
          const { x: cx, y: cy } = imageToElement(natW / 2, natH / 2);
          markers.forEach((m, i) => {
            const spec = MARKER_SPECS[i];
            m.style.width = `${spec.width * s}px`;
            m.style.height = `${spec.height * s}px`;
            m.style.transform = `translate(${cx + spec.dx * s}px, ${cy + spec.dy * s}px) translate(-50%, -50%)`;
          });
        }
        placeMarker();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(placeMarker) : null;
        if (ro) ro.observe(panelBody);
        window.addEventListener("resize", placeMarker);

        /* Two-frame gate before kicking off the drawer reveal:
           even with the bitmap preloaded + decode()'d + decoding="sync"
           + fetchPriority="high", the new in-DOM <img> still needs the
           browser to (a) run layout/style for the freshly-inserted node
           and (b) upload the texture to the compositor. If we add
           `page--open` on the very next frame, the drawer transform can
           advance one frame ahead of the image composite, briefly
           exposing the panel's white background — the flash. Waiting
           rAF→rAF gives frame 1 for layout/paint of the <img> and
           frame 2 for the compositor handoff, so the first frame of
           the drawer reveal already has the photo on screen. Re-check
           opId inside each rAF in case the user closed/switched panels
           while we were waiting. */
        const beginPanelReveal = () => {
          requestAnimationFrame(() => {
            if (opId !== openPanelOpSeq) return;
            requestAnimationFrame(() => {
              if (opId !== openPanelOpSeq) return;
              finishPanelOpen(key, opId);
            });
          });
        };
        /* Decode the in-DOM element too: the module-level preload
           decoded a *different* Image() instance, and some browsers
           require a fresh decode for the new node before it's
           paint-ready. Cache hit makes this near-instant; on failure
           we still proceed so the panel never gets stuck. */
        if (typeof img.decode === "function") {
          img.decode().then(beginPanelReveal, beginPanelReveal);
        } else {
          beginPanelReveal();
        }
      });
      return; // Early return - finishPanelOpen called above
    } else if (key === "projects") {
      panelBody.classList.add("panel__body--projects");
      loadFeature("projects")?.then((mount) => {
        if (opId !== openPanelOpSeq) return;
        projectsMount = mount(panelBody);
      });
    } else if (key === "in-situ") {
      loadFeature("in-situ")?.then((mount) => {
        if (opId !== openPanelOpSeq) return;
        inSituMount = mount(panelBody);
      });
    }
    finishPanelOpen(key, opId);
  }

  /* ----- Floating Minesweeper window ("Text" chip) -----
     The Win98-style window is mounted on <body> and toggled by the Text chip;
     it does not use the panel drawer at all. Other panels can be open at the
     same time — windows and the drawer coexist. */
  function textChipBtn() {
    return chips.find((b) => b.getAttribute("data-key") === "text") ?? null;
  }
  function setTextChipPressed(pressed) {
    textChipBtn()?.setAttribute("aria-pressed", pressed ? "true" : "false");
  }
  function openTextWindow() {
    if (textMount) {
      textMount.focus?.();
      return;
    }
    setTextChipPressed(true);
    const load = loadFeature("text");
    if (!load) {
      setTextChipPressed(false);
      return;
    }
    load
      .then((mount) => {
        /* Re-check: user may have toggled it off again before the dynamic import resolved. */
        if (textMount) return;
        const wantOpen = textChipBtn()?.getAttribute("aria-pressed") === "true";
        if (!wantOpen) return;
        textMount = mount(document.body, {
          onClose: () => {
            textMount = null;
            setTextChipPressed(false);
          },
        });
      })
      .catch((err) => {
        console.error("[store1] text / minesweeper module failed to load", err);
        featureCache.delete("text");
        setTextChipPressed(false);
      });
  }
  function closeTextWindow() {
    if (textMount) {
      textMount.dispose();
      textMount = null;
    }
    setTextChipPressed(false);
  }

  function finishPanelOpen(key, opId) {
    /* Listening mounts on the next frame *after* `page--open` so the drawer has width
       (avoids 0×0 layout + WebKit blend/transform glitches). Guard with opId vs stale rAF. */

    chips.forEach((btn) => {
      const k = btn.getAttribute("data-key");
      /* Text + language chips are independent toggles (floating window /
         tall layout) — don't clobber their pressed state from the drawer flow. */
      if (k === "text" || k === "symposium") return;
      btn.setAttribute("aria-pressed", k === key ? "true" : "false");
    });

    panelWrap.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      if (opId !== openPanelOpSeq) return;
      page.classList.add("page--open");
      if (key === "listening") {
        loadFeature("listening")?.then((mount) => {
          if (opId !== openPanelOpSeq) return;
          listeningMount = mount(panelBody);
        });
      }
      requestAnimationFrame(() => {
        if (opId !== openPanelOpSeq) return;
        scheduleChipLayout();
        /* Only focus [Close] for keyboard users — Safari paints its default focus ring
         * on programmatic .focus() after a mouse click and there's no way to suppress it
         * via :focus-visible (Safari classifies post-click programmatic focus as visible). */
        if (key !== "label" && lastInputWasKeyboard && window.matchMedia("(pointer: fine)").matches) {
          panelClose?.focus();
        } else {
          /* Defensive: if anything else (Safari heuristics, label module, focus delegation)
             landed focus on a panel toolbar button, push it back to the body. */
          const ae = document.activeElement;
          if (ae && (ae === panelClose || ae === panelSecondary || ae === panelNext)) {
            ae.blur();
          }
        }
      });
    });
  }

  function closePanel() {
    if (!openKey || panelClosing) return;

    /* Keep body + bio running until the drawer slide finishes — clear in runAfterPanelClose. */

    panelClosing = true;
    if (!suppressRouteSync) {
      const currentPath = normalizeRoutePath(window.location.pathname);
      const mode = currentPath === "/" ? "replaceState" : "pushState";
      window.history[mode]({ panelKey: null }, "", "/");
    }
    page.classList.remove("page--open");

    chips.forEach((btn) => {
      /* Preserve text + language chips — their state is independent of the drawer. */
      const k = btn.getAttribute("data-key");
      if (k === "text" || k === "symposium") return;
      btn.setAttribute("aria-pressed", "false");
    });

    closingHandler = (e) => {
      const surface = transitionSurface();
      if (e.target !== surface) return;
      if (!isPanelTransitionProperty(e.propertyName)) return;
      surface.removeEventListener("transitionend", closingHandler);
      closingHandler = null;
      if (closingTimer) {
        clearTimeout(closingTimer);
        closingTimer = null;
      }
      runAfterPanelClose();
    };
    transitionSurface().addEventListener("transitionend", closingHandler);

    closingTimer = setTimeout(() => {
      if (closingHandler) {
        panelWrap.removeEventListener("transitionend", closingHandler);
        titleLayer.removeEventListener("transitionend", closingHandler);
        closingHandler = null;
      }
      closingTimer = null;
      runAfterPanelClose();
    }, PANEL_MS + 80);

    requestAnimationFrame(() => {
      scheduleChipLayout();
    });
  }

  chips.forEach((btn) => {
    const key = btn.getAttribute("data-key");
    /* Prefetch the feature module on first hover/focus so the click feels instant. */
    if (featureLoaders[key]) {
      const prefetch = () => loadFeature(key);
      btn.addEventListener("pointerenter", prefetch, { once: true, passive: true });
      btn.addEventListener("focusin", prefetch, { once: true });
      btn.addEventListener("touchstart", prefetch, { once: true, passive: true });
    }
    if (key === "contact") {
      const warmContactImage = () => {
        contactImageLoadPromise.then(() => {
          if (typeof contactPanelImg.decode === "function") {
            contactPanelImg.decode().catch(() => {
              /* ignore */
            });
          }
        });
      };
      btn.addEventListener("pointerenter", warmContactImage, { passive: true });
      btn.addEventListener("touchstart", warmContactImage, { passive: true });
    }

    /* Language — the COLLAPSE choreography is split across the press gesture:
       press plays the wind-up (anticipation rise + held apex), release plays
       the punch + snap. EXPAND has no wind-up to split, so it just fires on
       release. Drag-off pulls the wind-up back; drag-back-in re-arms it.

         settled='tall':
           pointerdown      → add .chip--windup → 200ms wind-up rise, then HOLD
           pointerleave     → remove .chip--windup → eases back to plain tall
           pointerenter     → re-add .chip--windup → wind-up rises again
           pointerup over   → COMMIT: punch fade + snap collapse
                              (if wind-up still rising, queue commit until it
                               settles — "play out the whole windup then wind down")
           pointerup off    → CANCEL: pull-back already in motion, do nothing

         settled='short':
           pointerdown      → no visible feedback (no wind-up to play)
           pointerup over   → expand (single 360ms tween)
           pointerup off    → cancel, no animation

         Any pointerdown while a major animation is in flight is IGNORED. */
    if (key === "symposium") {
      /* Durations match styles.css — see .chip--tall.chip--windup and the
         .chips.chips--motion .chip.chip--collapsing rules. */
      const WINDUP_RISE_MS = 200;  /* CSS tween — .chip--windup padding bump      */
      const WINDUP_HOLD_MS = 180;  /* apex pause — chip sits fully wound at peak  */
      /* Phase 'winding-up' spans rise + hold so even a 10ms click sees the full
         anticipation beat before the snap can fire. Slow clicks (release after
         420ms) commit immediately on release — user controls the hold past 220ms. */
      const WINDUP_MS = WINDUP_RISE_MS + WINDUP_HOLD_MS;
      const SNAP_MS = 330;    /* punch fade (40) + snap padding/radius (~290) */
      const EXPAND_MS = 360;  /* var(--motion-duration-text)                  */
      /* Mobile Blink/WebKit can coalesce the chip class flip + global Pretext
         repack into one paint, which visually snaps the chip height. Keep this
         delay long enough to give the chip tween a visible head-start. */
      const MOBILE_COALESCE_GUARD_EXPAND_MS = 16;
      const MOBILE_COALESCE_GUARD_COLLAPSE_MS = 72;
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

      let settled = "short";
      let phase = "idle";     /* 'idle' | 'winding-up' | 'wound-up' |
                                 'punching' | 'expanding' */
      let pressed = false;
      let over = false;
      let pendingCommit = false;
      let windupTimer = null;
      let coalesceGuardTimer = null;
      const sublabel = btn.querySelector(".chip__sublabel");
      const langItems = sublabel
        ? Array.from(sublabel.querySelectorAll(".chip__sublabel-item"))
        : [];
      const langOrb = sublabel?.querySelector(".chip__lang-orb") || null;
      const activeLangClass = "chip__sublabel-item--active";
      let selectedLangIndex = 0;
      let langOrbX = 0;
      let langOrbAnimation = null;
      const ORB_CENTER_NUDGE_EM = -0.03;
      let langOrbSyncRaf = 0;

      const clearLangOrbAnimation = () => {
        if (!langOrbAnimation) return;
        langOrbAnimation.cancel();
        langOrbAnimation = null;
      };

      const readLangCenters = () => {
        if (!sublabel || !langItems.length) return null;
        if (sublabel.clientWidth < 1 || sublabel.clientHeight < 1) return null;
        const sublabelFontPx = parseFloat(getComputedStyle(sublabel).fontSize) || 16;
        const orbWidth =
          langOrb?.getBoundingClientRect().width || Math.max(1, sublabelFontPx * 1.9);
        const nudgePx = sublabelFontPx * ORB_CENTER_NUDGE_EM;
        const centers = langItems.map((item) => item.offsetLeft + item.offsetWidth / 2 + nudgePx);
        const anchors = centers.map((centerX) => centerX - orbWidth / 2);
        return {
          centers,
          anchors,
          span: Math.max(1, centers[centers.length - 1] - centers[0]),
        };
      };

      const updateActiveLangClass = () => {
        langItems.forEach((item, i) => {
          item.classList.toggle(activeLangClass, i === selectedLangIndex);
        });
      };
      const setLangOrbX = (x) => {
        if (!langOrb) return;
        langOrbX = x;
        langOrb.style.setProperty("--lang-orb-x", `${x}px`);
      };
      const isYellowSurfaceTarget = (target) =>
        target instanceof Element &&
        target.closest("#chipsViewport") &&
        !target.closest(".chip");
      const isLanguageRowTarget = (target) =>
        target instanceof Element && !!target.closest(".chip__sublabel");

      const syncLangOrbAfterLayout = () => {
        if (langOrbSyncRaf) cancelAnimationFrame(langOrbSyncRaf);
        langOrbSyncRaf = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            langOrbSyncRaf = 0;
            moveLangOrbToIndex(selectedLangIndex, { animate: false });
          });
        });
      };

      const moveLangOrbToIndex = (nextIndex, { animate = true } = {}) => {
        const clamped = Math.max(0, Math.min(nextIndex, langItems.length - 1));
        if (!langOrb) {
          selectedLangIndex = clamped;
          updateActiveLangClass();
          return;
        }
        const metrics = readLangCenters();
        if (!metrics) return;
        const toX = metrics.anchors[clamped];
        if (!animate) {
          clearLangOrbAnimation();
          setLangOrbX(toX);
          selectedLangIndex = clamped;
          updateActiveLangClass();
          return;
        }
        const fromX =
          langOrbX || metrics.anchors[selectedLangIndex] || toX;
        const dx = toX - fromX;
        const centerDx = metrics.centers[clamped] - metrics.centers[selectedLangIndex];
        const distance = Math.abs(centerDx);
        const direction = dx === 0 ? 1 : Math.sign(dx);
        const intensity = Math.max(0, Math.min(1, distance / metrics.span));
        const windup = (dx === 0 ? 1.5 : 2 + 10 * intensity) * direction;
        const overshoot = (dx === 0 ? 1.4 : 2 + 6 * intensity) * direction;
        const duration = Math.round(280 + 170 * intensity);
        const windupSquashX = 0.94 - 0.14 * intensity;
        const windupSquashY = 1.04 + 0.2 * intensity;
        const travelStretchX = 1.05 + 0.3 * intensity;
        const travelStretchY = 0.95 - 0.2 * intensity;
        clearLangOrbAnimation();
        const animation = langOrb.animate(
          [
            { transform: `translate3d(${fromX}px, -50%, 0) scale(1, 1)`, offset: 0, easing: "linear" },
            {
              transform: `translate3d(${fromX - windup}px, -50%, 0) scale(${windupSquashX}, ${windupSquashY})`,
              offset: 0.2,
              easing: "cubic-bezier(0.2, 0.9, 0.3, 1)",
            },
            {
              transform: `translate3d(${toX + overshoot}px, -50%, 0) scale(${travelStretchX}, ${travelStretchY})`,
              offset: 0.72,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
            {
              transform: `translate3d(${toX}px, -50%, 0) scale(1, 1)`,
              offset: 1,
              easing: "cubic-bezier(0.2, 0.9, 0.25, 1)",
            },
          ],
          {
            duration,
            fill: "forwards",
            easing: "linear",
          },
        );
        langOrbAnimation = animation;
        selectedLangIndex = clamped;
        updateActiveLangClass();
        animation.onfinish = () => {
          if (langOrbAnimation !== animation) return;
          setLangOrbX(toX);
          animation.cancel(); /* drop WAAPI hold so CSS var drives future resizes */
          langOrbAnimation = null;
        };
      };

      const scheduleSymposiumRepack = (mobileGuardMs) => {
        if (coalesceGuardTimer) {
          clearTimeout(coalesceGuardTimer);
          coalesceGuardTimer = null;
        }
        if (!isCoarsePointer) {
          scheduleChipLayoutNextFrame(btn);
          syncLangOrbAfterLayout();
          return;
        }
        /* Mobile Blink/WebKit: give the chip's own padding tween a head-start
           before Pretext writes transforms/font-size for the full set. */
        coalesceGuardTimer = window.setTimeout(() => {
          coalesceGuardTimer = null;
          scheduleChipLayoutNextFrame(btn);
          syncLangOrbAfterLayout();
        }, mobileGuardMs);
      };

      const startWindup = () => {
        phase = "winding-up";
        btn.classList.add("chip--windup");
        if (windupTimer) clearTimeout(windupTimer);
        windupTimer = window.setTimeout(() => {
          windupTimer = null;
          if (phase !== "winding-up") return;
          phase = "wound-up";
          if (pendingCommit) {
            pendingCommit = false;
            commit();
          }
        }, WINDUP_MS);
      };

      const pullBackWindup = () => {
        if (windupTimer) {
          clearTimeout(windupTimer);
          windupTimer = null;
        }
        btn.classList.remove("chip--windup");
        phase = "idle";
        pendingCommit = false;
        /* Padding tweens back to plain .chip--tall via its default transition. */
      };

      const commit = () => {
        phase = "punching";
        if (windupTimer) {
          clearTimeout(windupTimer);
          windupTimer = null;
        }
        btn.classList.remove("chip--windup");
        btn.classList.add("chip--collapsing");
        /* Stage the "tall -> short" flip one frame later so mobile engines
           register a real transition start before global repack. */
        requestAnimationFrame(() => {
          btn.classList.remove("chip--tall");
          btn.setAttribute("aria-pressed", "false");
          scheduleSymposiumRepack(MOBILE_COALESCE_GUARD_COLLAPSE_MS);
        });
        window.setTimeout(() => {
          btn.classList.remove("chip--collapsing");
          settled = "short";
          phase = "idle";
        }, SNAP_MS);
      };

      const expand = () => {
        phase = "expanding";
        btn.classList.add("chip--tall");
        btn.setAttribute("aria-pressed", "true");
        scheduleSymposiumRepack(MOBILE_COALESCE_GUARD_EXPAND_MS);
        requestAnimationFrame(() => {
          moveLangOrbToIndex(selectedLangIndex, { animate: false });
        });
        window.setTimeout(() => {
          settled = "tall";
          phase = "idle";
          /* Final post-expand snap for Blink mobile after all tweens settle. */
          syncLangOrbAfterLayout();
        }, EXPAND_MS);
      };

      if (langItems.length) {
        selectedLangIndex = Math.max(
          0,
          langItems.findIndex((item) => item.dataset.bg?.toLowerCase() === "#fff717"),
        );
        if (selectedLangIndex < 0) selectedLangIndex = 0;
        updateActiveLangClass();
        if (sublabel) {
          const sublabelResizeObserver = new ResizeObserver(syncLangOrbAfterLayout);
          sublabelResizeObserver.observe(sublabel);
        }
        window.addEventListener("resize", syncLangOrbAfterLayout, { passive: true });
        window.visualViewport?.addEventListener("resize", syncLangOrbAfterLayout, { passive: true });
        window.addEventListener("orientationchange", syncLangOrbAfterLayout, { passive: true });
        langItems.forEach((item, idx) => {
          item.addEventListener("pointerdown", (e) => {
            if (settled !== "tall" || phase !== "idle") return;
            e.stopPropagation();
          });
          item.addEventListener("pointerup", (e) => {
            if (settled !== "tall" || phase !== "idle") return;
            e.preventDefault();
            e.stopPropagation();
            if (idx === selectedLangIndex) return;
            moveLangOrbToIndex(idx, { animate: true });
          });
          item.addEventListener("click", (e) => {
            if (settled !== "tall" || phase !== "idle") return;
            e.preventDefault();
            e.stopPropagation();
            if (idx === selectedLangIndex) return;
            moveLangOrbToIndex(idx, { animate: true });
          });
        });
      }

      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (settled === "tall" && isLanguageRowTarget(e.target)) return;
        if (pressed) return;
        /* Don't-interrupt: a major animation must finish before next press. */
        if (phase === "punching" || phase === "expanding") return;
        pressed = true;
        over = true;
        if (settled === "tall" && phase === "idle") startWindup();
        /* For settled=short, the press is just an "armed" state — expand on release. */
      });

      btn.addEventListener("pointerenter", () => {
        over = true;
        if (!pressed) return;
        if (settled === "tall" && phase === "idle") startWindup();
      });

      btn.addEventListener("pointerleave", () => {
        over = false;
        if (!pressed) return;
        if (settled === "tall" && (phase === "winding-up" || phase === "wound-up")) {
          pullBackWindup();
        }
      });

      /* When a gesture cancels (release off-chip), the browser still fires a
         `click` event on the closest common ancestor of the mousedown and
         mouseup targets — which can trigger handlers we don't want (e.g. the
         viewport's close-on-empty-click). Swallow the very next click in the
         capture phase so it never reaches anything. */
      const swallowNextClick = () => {
        const swallow = (e) => {
          e.stopPropagation();
          e.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        /* Defensive cleanup if for some reason no click follows the release
           (touchcancel-only paths, programmatic releases, etc.) so we don't
           accidentally eat a future legitimate click. */
        window.setTimeout(() => {
          window.removeEventListener("click", swallow, true);
        }, 50);
      };

      /* Release listeners on window so a pointerup OUTSIDE the chip (after a
         drag-off) still ends the press cleanly. */
      const release = () => {
        if (!pressed) return;
        pressed = false;
        if (over) {
          if (settled === "short" && phase === "idle") {
            expand();
          } else if (settled === "tall") {
            if (phase === "wound-up") commit();
            else if (phase === "winding-up") pendingCommit = true;
            /* phase==='idle' here would mean we somehow released after a
               pull-back without re-entering — nothing to commit. */
          }
        } else {
          /* Released off chip: cancel. Wind-up was already pulled back on
             leave; expand never started. Swallow the synthetic click so it
             doesn't fire on whatever element the cursor happens to be over. */
          pendingCommit = false;
          swallowNextClick();
        }
      };
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      window.addEventListener("blur", release);

      /* Keyboard activation (Enter/Space) arrives as a click with detail===0.
         Mouse clicks are handled by pointer events above — suppress them here
         to avoid double-firing. Keyboard skips the press-gesture split and
         just toggles directly. */
      btn.addEventListener("click", (e) => {
        if (e.detail !== 0) return;
        if (pressed || phase !== "idle") return;
        if (settled === "short") expand();
        else commit();
      });

      document.addEventListener("click", (e) => {
        if (settled !== "tall" || phase !== "idle") return;
        if (e.target instanceof Element && e.target.closest('[data-key="symposium"]')) return;
        if (isYellowSurfaceTarget(e.target)) return;
        commit();
      });
    }

    btn.addEventListener("click", (e) => {
      /* Volume icon: mute/unmute stream without toggling the panel */
      if (key === "listening" && e.target.closest(".chip__label-optiona")) {
        e.preventDefault();
        e.stopPropagation();
        toggleWelcomeAudioMute();
        return;
      }
      /* Playing but muted: unmute then same click opens/closes panel (no second tap) */
      if (key === "listening" && isWelcomeAudioPlaying() && isWelcomeAudioMuted()) {
        toggleWelcomeAudioMute();
      }
      /* Text — floating Win98 window, independent of the drawer. */
      if (key === "text") {
        if (textMount) closeTextWindow();
        else openTextWindow();
        return;
      }
      /* Language — press-and-hold gesture is wired up above (pointer events
         + a dedicated keyboard-only click listener). Bail out here so this
         click doesn't fall through into the panel-opening branch below. */
      if (key === "symposium") {
        return;
      }
      if (key === openKey) {
        if (key === "projects" && projectsMount?.collapseExpandedProject?.()) {
          return;
        }
        closePanel();
        return;
      }
      openPanel(key);
    });
  });

  function applyPanelRouteFromLocation() {
    const routedKey = panelKeyFromPath(window.location.pathname);
    if (routedKey === openKey) return;
    if (!routedKey) {
      if (openKey) closePanel();
      return;
    }
    openPanel(routedKey);
  }

  /** Empty padding + space between pills: close the content panel (pills still handle their own clicks). */
  chipsViewport.addEventListener("click", (e) => {
    if (!openKey) return;
    if (e.target.closest(".chip")) return;
    closePanel();
  });

  panelClose?.addEventListener("click", () => {
    if (openKey === "projects" && projectsMount?.collapseExpandedProject?.()) {
      return;
    }
    closePanel();
  });

  const WELCOME_AUDIO_URL = "https://welcome.audio/";

  panelSecondary?.addEventListener("click", (e) => {
    e.preventDefault();
    if (openKey === "bio" && bioMount) {
      bioMount.reset();
    } else if (openKey === "label" && labelMount) {
      /* Gate color tween to this click only so all other panel transitions stay snappy. */
      panel.classList.add("panel--color-surface-toggling");
      panel.classList.toggle("panel--color-surface");
      if (labelColorFadeTimer) clearTimeout(labelColorFadeTimer);
      labelColorFadeTimer = window.setTimeout(() => {
        panel.classList.remove("panel--color-surface-toggling");
        labelColorFadeTimer = null;
      }, LABEL_COLOR_FADE_MS);
    } else if (openKey === "in-situ") {
      /* Add `in-situ--toggling` BEFORE flipping invert so the matching CSS
         transitions (0.42s ease, see styles.css) are in effect for the very
         first style recalc. Removed after the tween so the panel chrome
         reverts to no-transition (tab switches snap). Keep the 420ms here
         in sync with the 0.42s transitions in styles.css. */
      panel.classList.add("in-situ--toggling");
      const on = panel.classList.toggle("in-situ--invert");
      panelSecondary.textContent = on ? "[Dark]" : "[Light]";
      panelSecondary.setAttribute(
        "aria-label",
        on ? "Dark invert on — tap for light appearance" : "Light appearance — tap for inverted view",
      );
      panelSecondary.setAttribute("aria-pressed", on ? "true" : "false");
      window.setTimeout(() => panel.classList.remove("in-situ--toggling"), 420);
    } else if (openKey === "contact") {
      if (typeof contactDownloadVCard === "function") contactDownloadVCard();
    } else {
      window.open(WELCOME_AUDIO_URL, "_blank", "noopener,noreferrer");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !openKey) return;
    if (openKey === "projects" && projectsMount?.collapseExpandedProject?.()) {
      return;
    }
    closePanel();
  });

  window.addEventListener("popstate", () => {
    suppressRouteSync = true;
    try {
      applyPanelRouteFromLocation();
    } finally {
      suppressRouteSync = false;
    }
  });

  if (typeof ResizeObserver !== "undefined") {
    const roViewport = new ResizeObserver(() => scheduleChipLayout());
    roViewport.observe(chipsViewport);
    roViewport.observe(chipsRoot);
    roViewport.observe(page);
    roViewport.observe(titleLayer);
  }

  function onViewportResize() {
    scheduleChipLayout();
  }

  window.addEventListener("resize", onViewportResize);
  window.visualViewport?.addEventListener("resize", onViewportResize);
  portraitMq.addEventListener("change", onViewportResize);
  window.addEventListener("store1-chips-layout", scheduleChipLayout);

  document.fonts.ready.then(() => {
    scheduleChipLayout();
  });

  /* iOS Safari: flex + first paint can report 0×0 rects; run again after layout settles. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduleChipLayout();
    });
  });
  window.addEventListener("load", () => {
    scheduleChipLayout();
  });

  suppressRouteSync = true;
  try {
    const bootKey = panelKeyFromPath(window.location.pathname);
    if (bootKey) {
      openPanel(bootKey);
    } else if (normalizeRoutePath(window.location.pathname) !== "/") {
      window.history.replaceState({ panelKey: null }, "", "/");
    }
  } finally {
    suppressRouteSync = false;
  }

  log("boot: ready — Pretext packs chips inside the viewport");
}

main();
