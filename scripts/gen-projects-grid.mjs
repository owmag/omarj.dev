import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index99.html"), "utf8");

let css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
css = css.replace(/#highlight-grid\b/g, ".project-grid-portfolio__grid");
css = css.replace(/#mouse-block-overlay/g, ".project-grid-portfolio__block");
css = css.replace(
  /\.project-grid-portfolio__grid \{[^}]*\}/,
  `.project-grid-portfolio__grid {
        position: absolute;
        inset: -1px;
        display: grid;
        pointer-events: auto;
        user-select: none;
        transition: none;
      }`,
);
css = css.replace(
  /\.project-grid-portfolio__block \{[^}]*\}/,
  `.project-grid-portfolio__block {
        position: absolute;
        inset: 0;
        z-index: 99999;
        pointer-events: none;
      }`,
);
css = css.replace(
  /\s*html,\s*body\s*\{[^}]*\}\s*\/\*\s*body\s*\*\/\s*body\s*\{[^}]*\}\s*/,
  `
      .project-grid-portfolio {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        cursor: crosshair;
        -webkit-tap-highlight-color: transparent;
        font-family: "Nanum Gothic", system-ui, sans-serif;
        background: #ffffff;
        color: #222;
      }
      .project-grid-portfolio__main {
        position: absolute;
        inset: 0;
        min-height: 0;
        z-index: 0;
      }
`,
);

css += `
      /* Domino: one poster load at a time; fade in each tile when its image is ready. */
      .project-grid-portfolio__grid .project-cell {
        transition: opacity 0.42s ease;
      }
      .project-cell.project-cell--await-poster {
        pointer-events: none;
        transition: none;
      }
      .project-cell.project-tile--has-hero .project-tile-hero {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        z-index: 1;
        pointer-events: none;
        opacity: 1;
        transition: opacity 0.4s ease;
        /* Promote each tile poster to its own compositor layer so Firefox
           composites a cached bitmap during the grid-track expand tween
           instead of re-rasterizing the cover-cropped image every frame. */
        will-change: transform;
        transform: translateZ(0);
      }
      /* Hide the cover-fit poster while the cell is fully expanded — the preview
         video uses object-fit: contain in that state and would otherwise show a
         mismatched poster behind its letterboxing. */
      .project-cell.expanded .project-tile-hero {
        opacity: 0;
      }
      /* Collapse handoff: swap .expanded → .hero-restoring to fade the hero
         back in on top of the still-playing video. After the fade completes
         the video is recycled underneath. */
      .project-cell.hero-restoring .project-tile-hero {
        opacity: 1;
        z-index: 10;
      }
      /* Preview video paints above the hero; .hero-restoring lifts the hero above this during collapse. */
      .project-cell .project-preview-video {
        z-index: 5;
      }
`;

let js = html.match(/<script>([\s\S]*?)<\/script>/)[1].trim();
js = js.replace(
  /      function emitProjectsExpanded\(_expanded\) \{\}/,
  `      const emitProjectsExpanded = (expanded, projectName) => {
        try {
          panelBody.dispatchEvent(
            new CustomEvent("store1-projects-expanded", {
              detail: { expanded, projectName: projectName ?? null },
            }),
          );
        } catch {
          /* ignore */
        }
      };`,
);
js = js.replace(
  /      function spawnProjects\(\) \{\n        const cells = Array.from\(highlightGrid\.children\);\n        const usedIndices = new Set\(\);\n        projectHoverPositions = \[\];\n\n        \/\/ Define your portfolio items with bound colors/,
  `      /** Grid slots where project tiles may appear — not the outer edges (top/bottom row, left/right column). */
      function placeableCellIndices() {
        const max = cols * rows;
        const out = [];
        for (let i = 0; i < max; i++) {
          const c = i % cols;
          const r = Math.floor(i / cols);
          if (
            cols > 1 &&
            rows > 1 &&
            (c === 0 || c === cols - 1 || r === 0 || r === rows - 1)
          )
            continue;
          out.push(i);
        }
        if (out.length === 0) {
          for (let i = 0; i < max; i++) out.push(i);
        }
        return out;
      }

      function spawnProjects() {
        const cells = Array.from(highlightGrid.children);
        projectHoverPositions = [];

        // Define your portfolio items with bound colors`,
);
js = js.replace(
  /        projects.forEach\(project => \{\n          let randomIndex;\n          let valid = false;\n\n          while \(!valid\) \{\n            randomIndex = Math.floor\(Math.random\(\) \* cells.length\);\n            if \(!usedIndices.has\(randomIndex\)\) \{\n              valid = true;\n            \}\n          \}\n\n          usedIndices.add\(randomIndex\);\n          const cell = cells\[randomIndex\];/,
  `        const placeableAll = placeableCellIndices();
        let placeablePool;
        if (
          spawnPlaceableOrderCache &&
          cols === spawnPlaceableOrderCols &&
          rows === spawnPlaceableOrderRows &&
          spawnPlaceableOrderCache.length === placeableAll.length
        ) {
          placeablePool = spawnPlaceableOrderCache;
        } else {
          placeablePool = placeableAll.slice().sort(() => Math.random() - 0.5);
          spawnPlaceableOrderCache = placeablePool;
          spawnPlaceableOrderCols = cols;
          spawnPlaceableOrderRows = rows;
        }
        projects.forEach((project, projectIdx) => {
          if (projectIdx >= placeablePool.length) return;
          const randomIndex = placeablePool[projectIdx];
          const cell = cells[randomIndex];`,
);
js = js.replace(
  /            const randomIndex = Math.floor\(\n              Math.random\(\) \* highlightGrid\.children\.length,\n            \);/,
  `            const pool = placeableCellIndices();
            const randomIndex = pool[Math.floor(Math.random() * pool.length)];`,
);
js = js.replace(
  /const highlightGrid = document\.getElementById\("highlight-grid"\);\s*/,
  "",
);
js = js.replace(
  /document\.getElementById\('mouse-block-overlay'\)/g,
  "portfolioRoot.querySelector('[data-mouse-block]')",
);
js = js.replace(
  /cols = Math\.ceil\(window\.innerWidth \/ 30\);\s*rows = Math\.ceil\(window\.innerHeight \/ 30\)/,
  "cols = Math.ceil(metrics().w / 40);\n        rows = Math.ceil(metrics().h / 40)",
);
js = js.replace(
  /const colSizes = Array\.from\(\{ length: cols \}, \(_, c\) =>\s*c === clickedCol \? `\$\{window\.innerWidth \+ 2\}px` : `0px`,\s*\);\s*const rowSizes = Array\.from\(\{ length: rows \}, \(_, r\) =>\s*r === clickedRow \? `\$\{window\.innerHeight \+ 2\}px` : `0px`,\s*\);/,
  `const colSizes = Array.from({ length: cols }, (_, c) =>
          c === clickedCol ? \`\${metrics().w + 2}px\` : \`0px\`,
        );
        const rowSizes = Array.from({ length: rows }, (_, r) =>
          r === clickedRow ? \`\${metrics().h + 2}px\` : \`0px\`,
        );`,
);
js = js.replace(
  /const cw = window\.innerWidth \+ 2;\s*const ch = window\.innerHeight \+ 2;/,
  "const cw = metrics().w + 2;\n        const ch = metrics().h + 2;",
);
js = js.replace(
  /document\.addEventListener\('gesturestart', function \(e\) \{\s*e\.preventDefault\(\);\s*\}\);\s*/g,
  "",
);
js = js.replace(
  /document\.addEventListener\('gesturechange', function \(e\) \{\s*e\.preventDefault\(\);\s*\}\);\s*/g,
  "",
);
js = js.replace(
  /document\.addEventListener\('gestureend', function \(e\) \{\s*e\.preventDefault\(\);\s*\}\);\s*/g,
  "",
);
js = js.replace(
  /window\.addEventListener\('wheel', function\(e\) \{\s*if \(e\.ctrlKey\) \{\s*e\.preventDefault\(\);\s*\}\s*\}, \{ passive: false \}\);/,
  "",
);

const header = `/**
 * Portfolio grid from index99.html — scoped to the Projects panel body.
 * Generated by scripts/gen-projects-grid.mjs (do not edit generated block by hand).
 */
export function mountProjectsGridPortfolio(panelBody) {
  let disposed = false;
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-project-grid-portfolio", "");
  styleEl.textContent = ${JSON.stringify(css)};

  panelBody.classList.add("panel__body--projects");
  panelBody.innerHTML = \`
    <div class="project-grid-portfolio" data-project-grid-portfolio>
      <div class="project-grid-portfolio__block" data-mouse-block aria-hidden="true"></div>
      <main class="project-grid-portfolio__main" aria-label="Portfolio grid">
        <div class="project-grid-portfolio__grid" data-project-grid></div>
      </main>
    </div>\`;

  const portfolioRoot = panelBody.querySelector("[data-project-grid-portfolio]");
  const highlightGrid = panelBody.querySelector("[data-project-grid]");
  if (!portfolioRoot || !highlightGrid) {
    panelBody.innerHTML = "";
    panelBody.classList.remove("panel__body--projects");
    return {
      dispose() {},
      collapseExpandedProject() {
        return false;
      },
    };
  }

  document.head.appendChild(styleEl);

  function metrics() {
    const w = Math.max(1, portfolioRoot.clientWidth || highlightGrid.clientWidth || 1);
    const h = Math.max(1, portfolioRoot.clientHeight || highlightGrid.clientHeight || 1);
    return { w, h };
  }

`;

const footer = `
  function dispose() {
    if (disposed) return;
    disposed = true;
    panelBody._projectsInitGen = (panelBody._projectsInitGen || 0) + 1;
    dominoToken += 1;
    if (panelBody._projectsInitTimeout) {
      clearTimeout(panelBody._projectsInitTimeout);
      panelBody._projectsInitTimeout = null;
    }
    try {
      if (typeof expandedCell !== "undefined" && expandedCell) {
        collapseCell(expandedCell);
      }
    } catch {
      /* ignore */
    }
    try {
      window.removeEventListener("resize", scheduleResizeDebounced);
    } catch {
      /* ignore */
    }
    clearWarmPreviewLoadTimers();
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = null;
    }
    if (resizeRo) {
      try {
        resizeRo.disconnect();
      } catch {
        /* ignore */
      }
      resizeRo = null;
    }
    if (observeRafId) {
      cancelAnimationFrame(observeRafId);
      observeRafId = null;
    }
    pendingObserveQueue = [];
    if (videoLoadObserver) {
      try {
        videoLoadObserver.disconnect();
      } catch {
        /* ignore */
      }
      videoLoadObserver = null;
    }
    try {
      document.removeEventListener("mouseup", globalMouseUp);
    } catch {
      /* ignore */
    }
    try {
      portfolioRoot.removeEventListener("wheel", wheelPrevent);
    } catch {
      /* ignore */
    }
    previewVideoCache.forEach((video) => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    });
    previewVideoCache.clear();
    pendingCleanupTimeouts.forEach((t) => clearTimeout(t));
    pendingCleanupTimeouts.clear();
    if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    panelBody.innerHTML = "";
    panelBody.classList.remove("panel__body--projects");
  }

  function collapseExpandedProject() {
    try {
      if (typeof expandedCell !== "undefined" && expandedCell) {
        collapseCell(expandedCell);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  return { dispose, collapseExpandedProject };
}
`;

// Inject projectVideos override after pendingCleanupTimeouts map
const videoConst = `const projectVideos = {
      "QUOMMUNE": {
        webm: new URL("./media/projects/principal.webm", import.meta.url).href,
        poster: new URL("./media/projects/principal-hero.webp", import.meta.url).href,
      },
      "TEMPUS Katoomba": {
        webm: new URL("./media/projects/tempus.webm", import.meta.url).href,
        poster: new URL("./media/projects/tempus-hero.webp", import.meta.url).href,
        startSec: 5,
      },
      "welcome.audio": {
        webm: new URL("./media/projects/welcome.webm", import.meta.url).href,
        poster: new URL("./media/projects/welcome-hero.webp", import.meta.url).href,
        startSec: 2,
      },
      "B'WIG'D": {
        webm: new URL("./media/projects/rosy.webm", import.meta.url).href,
        poster: new URL("./media/projects/rosy-hero.webp", import.meta.url).href,
        startSec: 22,
      },
      "2nd Model": {
        webm: new URL("./media/projects/2nd.webm", import.meta.url).href,
        poster: new URL("./media/projects/2nd-hero.webp", import.meta.url).href,
        startSec: 12,
      },
    };`;

const jsPatched = js.replace(
  /\/\/ Video preview mapping[\s\S]*?const projectVideos = \{[\s\S]*?\};/,
  videoConst,
);

// Prepend metrics + resize observer wiring: insert after previewVideoCache line
const insertAfterCache = `const previewVideoCache = new Map();
      let resizeRo = null;
      let resizeDebounceTimer = null;
      let videoLoadObserver = null;
      const observedCells = new WeakSet();
      let pendingObserveQueue = [];
      let observeRafId = null;
      let dominoToken = 0;
      const dominoQueue = [];

      /** Coalesce ResizeObserver + window resize so landscape drawer width tween does not rebuild the grid every frame. */
      function scheduleResizeDebounced() {
        if (disposed) return;
        if (expandedCell || pendingCleanupTimeouts.size > 0) {
          clearTimeout(resizeDebounceTimer);
          resizeDebounceTimer = null;
          return;
        }
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
          resizeDebounceTimer = null;
          onWinResize();
        }, 120);
      }
      function onWinResize() {
        if (expandedCell || pendingCleanupTimeouts.size > 0) return;
        const { w, h } = metrics();
        const nextCols = Math.ceil(w / 40);
        const nextRows = Math.ceil(h / 40);
        if (
          nextCols === cols &&
          nextRows === rows &&
          highlightGrid.childElementCount > 0
        ) {
          return;
        }
        mouseDownOnCell = null;
        isMouseDown = false;
        runProjectsGridMount();
      }
      function globalMouseUp() {
        isMouseDown = false;
        mouseDownOnCell = null;
      }
      function wheelPrevent(e) {
        if (e.ctrlKey) e.preventDefault();
      }

      /** IntersectionObserver to only load videos when cells approach viewport - batched to avoid jank */
      function initVideoLoadObserver() {
        if (videoLoadObserver) return;
        if (typeof IntersectionObserver === "undefined") return;
        videoLoadObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const cell = entry.target;
                const projectName = cell.dataset.project;
                if (projectName && !cell._videoLoadTriggered) {
                  cell._videoLoadTriggered = true;
                  warmLoadVideoForCell(projectName);
                }
              }
            });
          },
          { root: portfolioRoot, rootMargin: "50px", threshold: 0 },
        );
      }
      function flushObserveQueue() {
        observeRafId = null;
        const batch = pendingObserveQueue.slice(0, 3);
        pendingObserveQueue = pendingObserveQueue.slice(3);
        batch.forEach((cell) => {
          if (!observedCells.has(cell) && videoLoadObserver) {
            observedCells.add(cell);
            videoLoadObserver.observe(cell);
          }
        });
        if (pendingObserveQueue.length > 0) {
          observeRafId = requestAnimationFrame(flushObserveQueue);
        }
      }
      function observeCellForVideoLoad(cell) {
        if (!videoLoadObserver) initVideoLoadObserver();
        if (!videoLoadObserver || observedCells.has(cell)) return;
        pendingObserveQueue.push(cell);
        if (!observeRafId) {
          observeRafId = requestAnimationFrame(flushObserveQueue);
        }
      }
      function unobserveCellForVideoLoad(cell) {
        if (!videoLoadObserver) return;
        observedCells.delete(cell);
        videoLoadObserver.unobserve(cell);
      }
      function warmLoadVideoForCell(projectName) {
        const cfg = projectVideos[projectName];
        if (!cfg) return;
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(() => {
            const v = getOrCreateCachedPreviewVideo(previewVideoCache, projectName, cfg);
            if (!v || v.readyState > 0) return;
            try { v.load(); } catch { /* ignore */ }
          }, { timeout: 200 });
        } else {
          setTimeout(() => {
            const v = getOrCreateCachedPreviewVideo(previewVideoCache, projectName, cfg);
            if (!v || v.readyState > 0) return;
            try { v.load(); } catch { /* ignore */ }
          }, 50);
        }
      }
        function warmPreviewVideoCache() {
          clearWarmPreviewLoadTimers();
          setTimeout(() => {
            if (disposed) return;
            const cells = Array.from(highlightGrid.querySelectorAll("[data-project]")).filter(
              (c) => !c.classList.contains("project-cell--await-poster"),
            );
            cells.forEach((cell) => observeCellForVideoLoad(cell));
          }, 100);
        }
        /** True when the UA has no real hover (phones, tablets, touch laptops). Must not require pointer:coarse — iPad reports fine pointer and would still get bogus mouseenter/mouseleave from taps, recycling the preview video. */
        function isMobileTouchDevice() {
          return window.matchMedia("(hover: none)").matches;
        }

      function revealProjectTileHero(_cell) {}

      function bindTileHeroVideoHandoff(video, _cell) {
        if (!video) return;
        if (video._tileHeroCleanup) {
          try {
            video._tileHeroCleanup();
          } catch {
            /* ignore */
          }
        }
        video._tileHeroCleanup = null;
      }

      const TILE_FADE_MS = 420;

      function loadPosterUrl(url) {
        return new Promise((resolve) => {
          const img = new Image();
          const done = () => resolve();
          const onDone = () => {
            if (typeof img.decode === "function") {
              img.decode().then(done).catch(done);
            } else {
              done();
            }
          };
          img.onload = onDone;
          img.onerror = done;
          img.src = url;
          if (img.complete) onDone();
        });
      }

      async function runDominoTilesSequential(runToken) {
        for (let i = 0; i < dominoQueue.length; i += 1) {
          if (disposed || dominoToken !== runToken) return;
          const { cell, posterUrl } = dominoQueue[i];
          if (posterUrl) {
            await loadPosterUrl(posterUrl);
          }
          if (disposed || dominoToken !== runToken) return;
          if (!cell.isConnected) continue;
          const heroEl = cell.querySelector(".project-tile-hero");
          if (heroEl) {
            try {
              if (typeof heroEl.decode === "function") {
                await heroEl.decode();
              }
            } catch {
              /* ignore */
            }
            await new Promise((r) => requestAnimationFrame(r));
          }
          requestAnimationFrame(() => {
            if (disposed || dominoToken !== runToken) return;
            cell.classList.remove("project-cell--await-poster");
            observeCellForVideoLoad(cell);
          });
          await new Promise((r) => setTimeout(r, TILE_FADE_MS + 60));
        }
      }

      function runProjectsGridMount() {
        if (disposed) return;
        setupGrid();
        spawnProjects();
        requestAnimationFrame(() => {
          if (disposed) return;
          warmPreviewVideoCache();
        });
      }
`;

const js2 = jsPatched.replace(
  "const previewVideoCache = new Map();",
  insertAfterCache,
);

// Replace window resize block
const js3 = js2.replace(
  /window\.addEventListener\("resize", \(\) => \{\s*if \(expandedCell\) \{\s*collapseCell\(expandedCell\);\s*\}\s*mouseDownOnCell = null;\s*isMouseDown = false;\s*setupGrid\(\);\s*spawnProjects\(\);\s*warmPreviewVideoCache\(\);\s*\}\);/,
  `window.addEventListener("resize", scheduleResizeDebounced);
      if (typeof ResizeObserver !== "undefined") {
        resizeRo = new ResizeObserver(() => {
          if (disposed) return;
          if (expandedCell) return;
          scheduleResizeDebounced();
        });
        resizeRo.observe(portfolioRoot);
      }
      initVideoLoadObserver();`,
);

// document mouseup for spawn - use named function we can remove
const js4 = js3.replace(
  /document\.addEventListener\("mouseup", \(\) => \{\s*isMouseDown = false;\s*mouseDownOnCell = null;\s*\}\);/,
  `document.addEventListener("mouseup", globalMouseUp);`,
);

// Init — one rAF so panel has layout; grid + empty cells immediately, tiles reveal per poster (spawn order)
const js5 = js4.replace(
  /\/\/ Init[\s\S]*warmPreviewVideoCache\(\);/,
  `panelBody._projectsInitGen = (panelBody._projectsInitGen || 0) + 1;
      const projectsMountGen = panelBody._projectsInitGen;
      requestAnimationFrame(() => {
        if (disposed || panelBody._projectsInitGen !== projectsMountGen) return;
        runProjectsGridMount();
      });`,
);

/** GPU / idle: keep in sync with projects-grid-portfolio.js manual perf work. */
function applyPortfolioPerfPatches(jsSrc) {
  return (
    jsSrc
      .replace(
        /let pendingCleanupTimeouts = new Map\(\);\n/,
        `let pendingCleanupTimeouts = new Map();
        let warmPreviewLoadTimers = [];
        function clearWarmPreviewLoadTimers() {
          warmPreviewLoadTimers.forEach((id) => clearTimeout(id));
          warmPreviewLoadTimers = [];
        }
`,
      )
      .replace(
        /function tryPlayPreviewVideo\(video\) \{\n\s*if \(!video\) return;\n\s*if \(video\.error\)/,
        `function tryPlayPreviewVideo(video) {
          if (!video) return;
          if (video.preload === "metadata") video.preload = "auto";
          if (video.error)`,
      )
      .replace(
        /video\.playsInline = true;\n\s*video\.preload = "auto";/,
        `video.playsInline = true;
          video.preload = "metadata";`,
      )
      .replace(
        /function setupGrid\(\) \{[\s\S]*?highlightGrid\.appendChild\(cell\);\n\s*\}\n\s*\}/,
        `function setupGrid() {
          highlightGrid.innerHTML = '';
          cols = Math.ceil(metrics().w / 40);
          rows = Math.ceil(metrics().h / 40);
          const totalCells = cols * rows;
          highlightGrid.style.gridTemplateColumns = Array(cols).fill('40px').join(' ');
          highlightGrid.style.gridTemplateRows = Array(rows).fill('40px').join(' ');
          const fragment = document.createDocumentFragment();
          for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'highlight-cell';
            fragment.appendChild(cell);
          }
          highlightGrid.appendChild(fragment);
        }`,
      )
      .replace(
        /function warmPreviewVideoCache\(\) \{\n\s*Object\.entries\(projectVideos\)\.forEach\(\(\[name, cfg\]\) => \{\n\s*if \(!cfg\?\.mp4 && !cfg\?\.webm\) return;\n\s*const v = getOrCreateCachedPreviewVideo\(previewVideoCache, name, cfg\);\n\s*if \(v && v\.readyState === 0\) v\.load\(\);\n\s*\}\);\n\s*\}/,
        ``,
      )
      .replace(
        /(\s*showHoverPreviewWhenReady\(video\);\n\s*)video\.play\(\)\.catch\(\(\) => \{\}\);/,
        "$1tryPlayPreviewVideo(video);",
      )
      .replace(
        /      function spawnProjects\(\) \{\n(?:        resetTileRevealChain\(\);\n)?        const cells = Array\.from\(highlightGrid\.children\);/,
        `      function spawnProjects() {
        dominoToken += 1;
        const dominoRunToken = dominoToken;
        dominoQueue.length = 0;
        const cells = Array.from(highlightGrid.children);`,
      )
      .replace(
        /          cell\.classList\.add\('project-cell'\);/,
        `          cell.classList.add("project-cell", "project-cell--await-poster");
          const tilePoster = projectVideos[project.name]?.poster || "";
          dominoQueue.push({
            cell,
            posterUrl: tilePoster,
          });
          if (tilePoster) {
            cell.classList.add("project-tile--has-hero");
            const heroImg = document.createElement("img");
            heroImg.className = "project-tile-hero";
            heroImg.alt = "";
            heroImg.decoding = "sync";
            heroImg.src = tilePoster;
            cell.appendChild(heroImg);
          }`,
      )
      .replace(
        /          \/\/ Restore color on mouse leave\n          cell\.addEventListener\('mouseleave', restoreColor\);\n        \}\);\n      \}/,
        `          // Restore color on mouse leave
          cell.addEventListener('mouseleave', restoreColor);
        });
        void runDominoTilesSequential(dominoRunToken);
      }`,
      )
      .replace(
        /function recycleCachedPreviewVideo\(cacheMap, video\) \{\n\s*if \(!video\) return;\n\s*cancelPosterSecondFrameWatch\(video\);/,
        `function recycleCachedPreviewVideo(cacheMap, video) {
        if (!video) return;
        if (video._tileHeroCleanup) {
          try {
            video._tileHeroCleanup();
          } catch {
            /* ignore */
          }
        }
        cancelPosterSecondFrameWatch(video);`,
      )
      .replace(
        /cell\.addEventListener\('mousedown', \(\) => \{\n\s*if \(cell\.classList\.contains\('expanded'\)\) return;/,
        `cell.addEventListener('mousedown', () => {
            if (cell.classList.contains("project-cell--await-poster")) return;
            if (cell.classList.contains('expanded')) return;`,
      )
      .replace(
        /cell\.addEventListener\("mouseenter", \(\) => \{\n\s*if \(isMobileTouchDevice\(\)\) return;/,
        `cell.addEventListener("mouseenter", () => {
            if (cell.classList.contains("project-cell--await-poster")) return;
            if (isMobileTouchDevice()) return;`,
      )
      .replace(
        /cell\.addEventListener\('mouseup', \(\) => \{\n\s*if \(cell\.classList\.contains\('expanded'\)\) return;/,
        `cell.addEventListener('mouseup', () => {
            if (cell.classList.contains("project-cell--await-poster")) return;
            if (cell.classList.contains('expanded')) return;`,
      )
      .replace(
        /tryPlayPreviewVideo\(hoverOpen\);\n\s*attachTouchExpandPoster\(/,
        `tryPlayPreviewVideo(hoverOpen);
            bindTileHeroVideoHandoff(hoverOpen, cell);
            attachTouchExpandPoster(`,
      )
      .replace(
        /cell\.appendChild\(gallery\);\n\s*tryPlayPreviewVideo\(video\);\n\s*\}, galleryMountDelay\)/,
        `cell.appendChild(gallery);
            tryPlayPreviewVideo(video);
            bindTileHeroVideoHandoff(video, cell);
          }, galleryMountDelay)`,
      )
      .replace(
        /(\s*video\.classList\.remove\("fade-out"\);\n\s*)showHoverPreviewWhenReady\(video\);\n(\s*)if \(video\.readyState >= 1\)/,
        `$1showHoverPreviewWhenReady(video);
$2bindTileHeroVideoHandoff(video, cell);
$2if (video.readyState >= 1)`,
      )
      .replace(
        /showHoverPreviewWhenReady\(video\);\n\s*tryPlayPreviewVideo\(video\);\n\s*\}\n\s*const hoverVideo = cell\.querySelector\("\[data-hover-video\]"\)/,
        `showHoverPreviewWhenReady(video);
                  tryPlayPreviewVideo(video);
                  bindTileHeroVideoHandoff(video, cell);
                }
                const hoverVideo = cell.querySelector("[data-hover-video]")`,
      )
      .replace(
        /recycleCachedPreviewVideo\(previewVideoCache, hv\);\n\s*\}, PREVIEW_FADE_OUT_MS\);/,
        `recycleCachedPreviewVideo(previewVideoCache, hv);
                revealProjectTileHero(cell);
              }, PREVIEW_FADE_OUT_MS);`,
      )
      .replace(
        /\.forEach\(\(v\) => recycleCachedPreviewVideo\(previewVideoCache, v\)\);\n\s*return;/,
        `.forEach((v) => recycleCachedPreviewVideo(previewVideoCache, v));
            revealProjectTileHero(cell);
            return;`,
      )
      .replace(
        /recycleCachedPreviewVideo\(previewVideoCache, hv\);\n\s*\}\n\s*\};/,
        `recycleCachedPreviewVideo(previewVideoCache, hv);
            revealProjectTileHero(cell);
          }
        };`,
      )
      /* Touch / coarse pointer: keep preview in the tile — delayed reparent into
         .project-gallery-container resets the compositor and reads as video snapping off. */
      .replace(
        /if \(galleryCfg && \(galleryCfg\.webm \|\| galleryCfg\.mp4\)\) \{/,
        "if (galleryCfg && (galleryCfg.webm || galleryCfg.mp4) && isDesktopFineHover()) {",
      )
      /* Synthetic mouseleave on tap must not fade/recycle the expanded preview. */
      .replace(
        /if \(expandedCell\) return;\n\n            if \(hv\) \{\n              clearPendingHoverFadeIn\(hv\);/,
        `if (expandedCell) return;
            if (isMobileTouchDevice()) return;

            if (hv) {
              clearPendingHoverFadeIn(hv);`,
      )
  );
}

// Rename bindPosterUntilSecondVideoFrame → bindPosterUntilVideoReady; keep index99 body
// (playing + 2 composited frames / RVFC). Do not replace with canplaythrough-only — that
// removes the poster before Android paints stable video ("snap off").
const jsPosterReplaced = js5
  .replace(/bindPosterUntilSecondVideoFrame/g, "bindPosterUntilVideoReady")
  .replace(
    /function cancelPosterSecondFrameWatch\(video\) \{[\s\S]*?\n      \}/,
    `function cancelPosterSecondFrameWatch(video) {
          if (!video) return;
          if (video._posterCanplayTimer != null) {
            clearTimeout(video._posterCanplayTimer);
            video._posterCanplayTimer = null;
          }
          if (video._posterCanplayListener) {
            video.removeEventListener("canplaythrough", video._posterCanplayListener);
            video._posterCanplayListener = null;
          }
          if (video._posterSecondFrameFallbackTimer != null) {
            clearTimeout(video._posterSecondFrameFallbackTimer);
            video._posterSecondFrameFallbackTimer = null;
          }
          if (typeof video.cancelVideoFrameCallback === "function" && video._posterSecondFrameRvfcHandle != null) {
            try { video.cancelVideoFrameCallback(video._posterSecondFrameRvfcHandle); } catch {}
            video._posterSecondFrameRvfcHandle = null;
          }
          if (video._posterSecondFramePlayingListener) {
            video.removeEventListener("playing", video._posterSecondFramePlayingListener);
            video._posterSecondFramePlayingListener = null;
          }
        }`
  )
  .replace(
    /if \(window\.matchMedia\("\(hover: none\)"\)\.matches\) return;/g,
    "if (isMobileTouchDevice()) return;"
  );

const jsFinal = applyPortfolioPerfPatches(jsPosterReplaced);

const tailBind = `
          portfolioRoot.addEventListener("wheel", wheelPrevent, { passive: false });
`;

const out =
  header +
  jsFinal
    .split("\n")
    .map((line) => "  " + line)
    .join("\n") +
  tailBind +
  footer;

const outPath = path.join(root, "projects-grid-portfolio.js");
fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, "bytes", out.length);
