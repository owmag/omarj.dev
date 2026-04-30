/**
 * Embeds the welcome.audio experience inside the Listening panel.
 * All `body` references from the original are scoped to the mount root.
 * Playback is delegated to welcome-audio-player.js so audio continues when the panel closes.
 */

import {
  isWelcomeAudioActive,
  setWelcomeAudioPlaying,
  subscribeWelcomeAudio,
} from "./welcome-audio-player.js";

const TITLE_IDLE = "Touch canvas to play/stop";
const TITLE_LOADING = "Loading";
const TITLE_LISTENING = "Listening";

/** Radial gradient stop for `.listening-welcome` — matches CSS default `--gradient-radius` */
const GRADIENT_RADIUS_IDLE = 65;
/** After shrink: shallow loading pulse oscillates around this (very small) */
const GRADIENT_RADIUS_LOADING_SMALL = 30;
/** Half-range of the playing pulse: `idle ± amplitude` */
const PULSE_AMPLITUDE = 25;
/** Loading pulse depth (±% around `GRADIENT_RADIUS_LOADING_SMALL`) */
const LOADING_PULSE_AMPLITUDE = 6.5;
/** One full loading cycle (ms) — slow */
const LOADING_PULSE_PERIOD_MS = 8000;
/** Phase 1 — stopped → very small: shrink only, no pulse (ms) */
const LOADING_SHRINK_MS = 1200;
/** Phase 2 — after shrink: pulse depth ramps in (ms) */
const LOADING_PULSE_RAMP_MS = 600;
/** Loading → playing: ease-out expansion from current radius to peak (no sine during this) */
const PLAYING_EXPAND_MS = 3800;
/** Hold at max gradient size before normal pulse (ms) */
const PLAYING_HOLD_AT_MAX_MS = 200;
/** Peak `--gradient-radius` in full playing pulse (idle + amplitude) */
const GRADIENT_RADIUS_PLAYING_MAX = GRADIENT_RADIUS_IDLE + PULSE_AMPLITUDE;
/** Playing pulse speed: `sin(elapsed / this)` — larger = slower (was 1000) */
const PLAYING_PULSE_ELAPSED_DIVISOR_MS = 2000;
/** If radius is below this, treat as loading handoff for phase + ramp (vs idle jump-in) */
const PLAYING_HANDOFF_MAX_RAW = 48;
/** Remount / gradient at idle: start at sine peak (= max radius); sin′=0 so it briefly “holds” then falls. */
const PLAYING_REMOUNT_PHASE_OFFSET = Math.PI / 2;

export function mountListeningWelcome(panelBody) {
  let alive = true;
  let animTimeoutOuter = 0;
  let animTimeoutInner = 0;
  let restoreObserver = null;

  panelBody.classList.add("panel__body--listening");
  panelBody.innerHTML = `
    <div class="listening-welcome grainy-aria" data-listening-root>
      <h1>welcome.audio</h1>
      <div class="listening-welcome__cursor-circle cursor-circle cursor--waiting"></div>
    </div>
  `;

  const root = panelBody.querySelector("[data-listening-root]");
  const circle = panelBody.querySelector(".listening-welcome__cursor-circle");
  const panelTitleEl = document.getElementById("panelTitle");

  function setPanelTitle(text) {
    if (panelTitleEl) panelTitleEl.textContent = text;
  }

  /** Playing: animated pulse. Loading: slow pulse around small center. Stopped: idle ease. */
  let playingPulseActive = false;
  let loadingPulseActive = false;
  let gradientIdleEaseGeneration = 0;
  /** First `startPlayingPulse` after this mount (re-open panel while playing vs stop/play again). */
  let playingPulseFirstStartThisMount = true;

  const unsubPlayer = subscribeWelcomeAudio((state) => {
    if (state.playing) {
      startPlayingPulse();
      setPanelTitle(TITLE_LISTENING);
    } else if (state.loading) {
      easeGradientToLoading();
      setPanelTitle(TITLE_LOADING);
    } else {
      easeGradientToIdle();
      setPanelTitle(TITLE_IDLE);
    }
  });

  /**
   * Viewport → local px inside `root` for `position: absolute` (left/top).
   * `root` may use CSS `transform: scale()`; `getBoundingClientRect()` is post-transform,
   * while layout coords use the untransformed box (`offsetWidth` / `offsetHeight`).
   */
  function clientToLocal(clientX, clientY) {
    const r = root.getBoundingClientRect();
    const rw = r.width || 1;
    const rh = r.height || 1;
    const sx = root.offsetWidth / rw;
    const sy = root.offsetHeight / rh;
    return {
      x: (clientX - r.left) * sx,
      y: (clientY - r.top) * sy,
    };
  }

  function pointerClient(e) {
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }
  let overlay = null;
  let inverted = false;
  let animating = false;

  const hasMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let cursorRafId = 0;
  let cursorSpawned = false;

  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;

  function animateCursor() {
    if (!alive) return;
    x += (targetX - x) * 0.15;
    y += (targetY - y) * 0.15;
    circle.style.left = x + "px";
    circle.style.top = y + "px";
    cursorRafId = requestAnimationFrame(animateCursor);
  }

  /**
   * @param {{ animate?: boolean }} opts - `animate: true` (default): same expand-from-0 as post-click respawn.
   *   `animate: false`: both classes at once so play animation can chain into `expand` on first click.
   */
  function spawnCursorAt(lx, ly, opts = {}) {
    if (!alive) return;
    const animate = opts.animate !== false;
    if (cursorSpawned) return;
    cursorSpawned = true;
    x = lx;
    y = ly;
    targetX = lx;
    targetY = ly;
    circle.style.left = lx + "px";
    circle.style.top = ly + "px";
    circle.classList.remove("cursor--waiting");
    void circle.offsetWidth;
    circle.classList.add("respawn");
    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          circle.classList.add("show");
        });
      });
    } else {
      circle.classList.add("show");
    }
    cursorRafId = requestAnimationFrame(animateCursor);
  }

  let restoreUiDone = false;

  /** After navigation away and back, match the sun/overlay to ongoing background playback. */
  function restoreUIFromPlayerState() {
    if (restoreUiDone) return;
    restoreUiDone = true;
    if (!isWelcomeAudioActive()) return;
    inverted = true;
    overlay = document.createElement("div");
    overlay.className = "listening-welcome__white-overlay white-overlay";
    root.appendChild(overlay);
    circle.classList.remove("expand", "shrink", "hidden", "respawn", "show");
    const cx = root.offsetWidth / 2;
    const cy = root.offsetHeight / 2;
    x = cx;
    y = cy;
    targetX = cx;
    targetY = cy;
    circle.style.left = cx + "px";
    circle.style.top = cy + "px";
    if (hasMouse) {
      /* Despawned until next mousemove — same as first visit after closing the panel */
      cursorSpawned = false;
      circle.classList.add("cursor--waiting");
    } else {
      circle.classList.remove("cursor--waiting");
      circle.classList.add("hidden");
    }
    requestAnimationFrame(() => {
      if (!alive) return;
      void root.getBoundingClientRect();
    });
  }

  /**
   * Restore overlay/cursor only after the panel has non-zero layout (ResizeObserver + rAF fallback).
   */
  function scheduleRestoreWhenLaidOut() {
    if (!isWelcomeAudioActive()) return;

    const attempt = () => {
      if (!alive || restoreUiDone) return;
      if (root.offsetWidth >= 4 && root.offsetHeight >= 4) {
        restoreObserver?.disconnect();
        restoreObserver = null;
        restoreUIFromPlayerState();
        return;
      }
      requestAnimationFrame(attempt);
    };

    if (typeof ResizeObserver !== "undefined") {
      restoreObserver = new ResizeObserver((entries) => {
        if (!alive || restoreUiDone) return;
        for (const ent of entries) {
          const { width, height } = ent.contentRect;
          if (width >= 4 && height >= 4) {
            restoreObserver?.disconnect();
            restoreObserver = null;
            restoreUIFromPlayerState();
            return;
          }
        }
      });
      restoreObserver.observe(root);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(attempt);
    });
  }

  scheduleRestoreWhenLaidOut();

  function onMouseMove(e) {
    const p = clientToLocal(e.clientX, e.clientY);
    targetX = p.x;
    targetY = p.y;
    if (!cursorSpawned) {
      spawnCursorAt(p.x, p.y, { animate: true });
    }
  }

  function onGesture(e) {
    e.preventDefault();
  }

  function stopPlayingPulseLoop() {
    playingPulseActive = false;
  }

  function stopLoadingPulseLoop() {
    loadingPulseActive = false;
  }

  /** Strong ease-out — fast start, long organic settle (vs cubic, which feels stiff here). */
  function easeOutExpo(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(2, -10 * t);
  }

  function easeGradientToLoading() {
    stopPlayingPulseLoop();
    stopLoadingPulseLoop();
    const gen = ++gradientIdleEaseGeneration;
    loadingPulseActive = true;
    let start = null;
    const startCenter =
      parseFloat(getComputedStyle(root).getPropertyValue("--gradient-radius")) || GRADIENT_RADIUS_IDLE;
    const shrinkTarget = GRADIENT_RADIUS_LOADING_SMALL;

    function loadingStep(timestamp) {
      if (!alive || !loadingPulseActive || gen !== gradientIdleEaseGeneration) return;
      if (!start) start = timestamp;
      const elapsed = timestamp - start;

      if (elapsed < LOADING_SHRINK_MS) {
        const t = elapsed / LOADING_SHRINK_MS;
        const blend = 0.5 - 0.5 * Math.cos(Math.PI * t);
        const center = startCenter + (shrinkTarget - startCenter) * blend;
        root.style.setProperty("--gradient-radius", center + "%");
      } else {
        const pulseElapsed = elapsed - LOADING_SHRINK_MS;
        const depthRamp = Math.min(1, pulseElapsed / LOADING_PULSE_RAMP_MS);
        const radius =
          shrinkTarget +
          LOADING_PULSE_AMPLITUDE *
            depthRamp *
            Math.sin((2 * Math.PI * pulseElapsed) / LOADING_PULSE_PERIOD_MS);
        root.style.setProperty("--gradient-radius", radius + "%");
      }
      if (loadingPulseActive && gen === gradientIdleEaseGeneration) {
        requestAnimationFrame(loadingStep);
      }
    }
    requestAnimationFrame(loadingStep);
  }

  function startPlayingPulse() {
    if (playingPulseActive) return;
    stopLoadingPulseLoop();
    gradientIdleEaseGeneration++;
    playingPulseActive = true;
    const isFirstPlayingStartThisMount = playingPulseFirstStartThisMount;
    playingPulseFirstStartThisMount = false;
    let start = null;
    const raw =
      parseFloat(getComputedStyle(root).getPropertyValue("--gradient-radius")) || GRADIENT_RADIUS_IDLE;
    const fromLoading = raw < PLAYING_HANDOFF_MAX_RAW;
    const radiusAtHandoff = raw;
    let phaseOffset;
    if (!fromLoading) {
      const sinArg = Math.max(-1, Math.min(1, (raw - GRADIENT_RADIUS_IDLE) / PULSE_AMPLITUDE));
      /* Default asin(sinArg): continue the wave from current radius (e.g. mid-pulse or stop/play).
       * Fresh mount reads idle (≈65): sinArg≈0 → phase 0 → smallest radius — feels wrong when
       * re-opening while already playing. First startPlayingPulse after mount uses phase π/2 (max
       * radius, stationary); later stop→play uses asin(0) from idle again. */
      const nearIdle =
        Math.abs(raw - GRADIENT_RADIUS_IDLE) < 0.05 * PULSE_AMPLITUDE;
      phaseOffset =
        nearIdle && isFirstPlayingStartThisMount
          ? PLAYING_REMOUNT_PHASE_OFFSET
          : Math.asin(sinArg);
    }

    function pulseStep(timestamp) {
      if (!alive || !playingPulseActive) return;
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      let radius;
      if (fromLoading) {
        const tExpand = PLAYING_EXPAND_MS;
        const tHold = PLAYING_HOLD_AT_MAX_MS;
        const rMax = GRADIENT_RADIUS_PLAYING_MAX;
        if (elapsed < tExpand) {
          const t = elapsed / tExpand;
          const p = easeOutExpo(t);
          radius = radiusAtHandoff + (rMax - radiusAtHandoff) * p;
        } else if (elapsed < tExpand + tHold) {
          radius = rMax;
        } else {
          const elapsedPlay = elapsed - tExpand - tHold;
          radius =
            GRADIENT_RADIUS_IDLE +
            PULSE_AMPLITUDE *
              Math.sin(elapsedPlay / PLAYING_PULSE_ELAPSED_DIVISOR_MS + Math.PI / 2);
        }
      } else {
        radius =
          GRADIENT_RADIUS_IDLE +
          PULSE_AMPLITUDE * Math.sin(elapsed / PLAYING_PULSE_ELAPSED_DIVISOR_MS + phaseOffset);
      }
      root.style.setProperty("--gradient-radius", radius + "%");
      if (playingPulseActive) requestAnimationFrame(pulseStep);
    }

    requestAnimationFrame(pulseStep);
  }

  function easeGradientToIdle() {
    stopPlayingPulseLoop();
    stopLoadingPulseLoop();
    const gen = ++gradientIdleEaseGeneration;
    let current =
      parseFloat(getComputedStyle(root).getPropertyValue("--gradient-radius")) || GRADIENT_RADIUS_IDLE;
    const target = GRADIENT_RADIUS_IDLE;

    function step() {
      if (!alive || gen !== gradientIdleEaseGeneration) return;
      current += (target - current) * 0.08;
      root.style.setProperty("--gradient-radius", current + "%");
      if (Math.abs(target - current) > 0.1) requestAnimationFrame(step);
      else root.style.setProperty("--gradient-radius", target + "%");
    }
    requestAnimationFrame(step);
  }

  function syncPlaybackToInverted(nextInverted) {
    setWelcomeAudioPlaying(nextInverted === true);
  }

  function runAnimation(e) {
    if (!alive || animating) return;
    animating = true;
    const nextInverted = !inverted;

    /* Drop `cursor--waiting` before expand — it sets opacity:0; touch never called spawnCursorAt. */
    circle.classList.remove("cursor--waiting", "shrink", "expand", "hidden", "respawn", "show");

    if (hasMouse && !cursorSpawned) {
      const p = clientToLocal(e.clientX, e.clientY);
      spawnCursorAt(p.x, p.y, { animate: false });
    }

    if (!hasMouse) {
      const { x: vx, y: vy } = pointerClient(e);
      if (typeof vx === "number" && typeof vy === "number") {
        const p = clientToLocal(vx, vy);
        circle.style.left = p.x + "px";
        circle.style.top = p.y + "px";
      }
    }

    void circle.offsetWidth;
    circle.classList.add("expand");
    syncPlaybackToInverted(nextInverted);

    animTimeoutOuter = window.setTimeout(() => {
      animTimeoutOuter = 0;
      if (!alive) return;
      inverted = nextInverted;
      if (inverted) {
        overlay = document.createElement("div");
        overlay.className = "listening-welcome__white-overlay white-overlay";
        root.appendChild(overlay);
      } else {
        overlay?.remove();
        overlay = null;
      }

      circle.classList.remove("expand");
      circle.classList.add("shrink");

      animTimeoutInner = window.setTimeout(() => {
        animTimeoutInner = 0;
        if (!alive) return;
        circle.classList.remove("shrink");

        if (hasMouse) {
          circle.classList.add("respawn");
          requestAnimationFrame(() => {
            if (alive) circle.classList.add("show");
          });
        } else circle.classList.add("hidden");

        animating = false;
      }, 400);
    }, 1200);
  }

  function onWheel(e) {
    if (e.ctrlKey) e.preventDefault();
  }

  if (hasMouse) {
    root.addEventListener("mousemove", onMouseMove);
    root.addEventListener("click", runAnimation);
  } else {
    root.addEventListener("pointerup", runAnimation, { passive: true });
  }

  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("gesturestart", onGesture);
  document.addEventListener("gesturechange", onGesture);
  document.addEventListener("gestureend", onGesture);

  return {
    dispose() {
      alive = false;
      restoreObserver?.disconnect();
      restoreObserver = null;
      if (animTimeoutOuter) {
        clearTimeout(animTimeoutOuter);
        animTimeoutOuter = 0;
      }
      if (animTimeoutInner) {
        clearTimeout(animTimeoutInner);
        animTimeoutInner = 0;
      }
      unsubPlayer();
      if (hasMouse) {
        root.removeEventListener("mousemove", onMouseMove);
        root.removeEventListener("click", runAnimation);
        if (cursorRafId) cancelAnimationFrame(cursorRafId);
      } else {
        root.removeEventListener("pointerup", runAnimation);
      }
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      document.removeEventListener("gestureend", onGesture);
      overlay?.remove();
      stopPlayingPulseLoop();
      stopLoadingPulseLoop();
      gradientIdleEaseGeneration++;
      panelBody.classList.remove("panel__body--listening");
      panelBody.innerHTML = "";
      /* Audio keeps playing — welcome-audio-player.js owns the stream. */
    },
  };
}
