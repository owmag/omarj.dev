/**
 * Text — Minesweeper, in a Win98 floating window.
 *
 * Self-contained, scratch-built homage to the Windows 95/98 winmine.exe loop.
 * Wrapped in a draggable Win98-style window (title bar + close box) appended to
 * <body>, so the game floats over the page and can be moved freely. The chip
 * panel drawer is not used — toggling the "Text" chip mounts/unmounts this
 * window directly (see app.js).
 *
 * Why scratch-built and not the dos.zone iframe?
 *   - dos.zone serves their loader at https://cdn.dos.zone/custom/crafted/minesweeper/index.html
 *     with `Content-Security-Policy: frame-ancestors https://dos.zone …`, which the browser
 *     strictly enforces — a plain <iframe> from any other origin is refused.
 *   - The .jsdos bundle behind that loader also wraps Microsoft's proprietary winmine.exe;
 *     hosting it ourselves would be redistributing their binary.
 *   - Reimplementing the rules + chrome is small, ad-free, and matches the page aesthetic.
 *
 * Layout / rules: classic Beginner (9×9, 10 mines) and Intermediate (16×16, 40 mines).
 * First click is always safe — mines are seeded only after the very first reveal so the
 * opening flood-fill always opens at least one cell. Win condition = every non-mine cell
 * revealed (flags optional).
 *
 * Inputs:
 *   - left click  → reveal
 *   - right click → toggle flag (also: long-press on touch ≥ 350 ms)
 *   - chord       → on a revealed numeric cell, left-click reveals all unflagged neighbours
 *                   if the flag count around it equals the cell's number (Win98 behaviour)
 *   - title bar   → click + drag to move the window (also touch)
 *   - [×]         → close the window (calls options.onClose)
 *
 * Pinch-zoom: the window body uses `touch-action: none` so iOS Safari can't pinch
 * the game grid. The page viewport meta already disables zoom site-wide.
 */

const DIFFICULTIES = {
  beginner: { rows: 9, cols: 9, mines: 10, label: "Beginner" },
  intermediate: { rows: 16, cols: 16, mines: 40, label: "Intermediate" },
};

const NUMBER_COLORS = [
  null,
  "#0000ff",
  "#007b00",
  "#ff0000",
  "#000084",
  "#7b0000",
  "#008284",
  "#000000",
  "#808080",
];

/* Native color emoji — no asset licensing, every modern OS ships these in its emoji font.
   Rendered glyph differs per platform (Apple blob vs Segoe flat vs Noto round). */
const FACE = { ok: "🙂", oh: "😮", dead: "😵", win: "😎" };
const MINE_GLYPH = "💣";
const FLAG_GLYPH = "🚩";

/**
 * Mount the Minesweeper Win98 window onto `container` (typically document.body).
 *
 * @param {HTMLElement} container - element to append the floating window to
 * @param {{ onClose?: () => void }} [options]
 * @returns {{ dispose: () => void, newGame: () => void, focus: () => void }}
 */
export function mountText(container, options = {}) {
  const { onClose } = options;

  /* ---- Win98 window chrome ---- */
  const win = document.createElement("div");
  win.className = "ms-window";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Minesweeper");

  const titleBar = document.createElement("div");
  titleBar.className = "ms-window__titlebar";

  const titleText = document.createElement("span");
  titleText.className = "ms-window__title";
  titleText.textContent = "Minesweeper";

  const titleControls = document.createElement("div");
  titleControls.className = "ms-window__controls";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ms-window__close";
  closeBtn.setAttribute("aria-label", "Close Minesweeper");
  closeBtn.innerHTML = "<span aria-hidden=\"true\">×</span>";

  titleControls.appendChild(closeBtn);
  titleBar.append(titleText, titleControls);

  const winBody = document.createElement("div");
  winBody.className = "ms-window__body";

  win.append(titleBar, winBody);
  container.appendChild(win);

  /* Center on first paint via a transform; once dragged we switch to absolute
     left/top so subsequent moves don't fight the centering transform. */
  win.style.left = "50%";
  win.style.top = "50%";
  win.style.transform = "translate(-50%, -50%)";

  /* ---- minesweeper UI lives inside `winBody` ---- */
  const root = document.createElement("div");
  root.className = "minesweeper";

  const frame = document.createElement("div");
  frame.className = "ms-frame";

  /* ---- top status bar ---- */
  const status = document.createElement("div");
  status.className = "ms-status";

  const mineLcd = makeLcd("ms-lcd ms-lcd--mines", "010");
  const face = document.createElement("button");
  face.type = "button";
  face.className = "ms-face";
  face.setAttribute("aria-label", "New game");
  face.textContent = FACE.ok;
  const timeLcd = makeLcd("ms-lcd ms-lcd--time", "000");

  status.append(mineLcd.el, face, timeLcd.el);

  /* ---- grid ---- */
  const board = document.createElement("div");
  board.className = "ms-board";
  board.setAttribute("role", "grid");
  /* Block native context menu inside board so right-click flags don't pop the system menu. */
  board.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ---- difficulty bar ---- */
  const diffBar = document.createElement("div");
  diffBar.className = "ms-diff";

  let currentDiff = "beginner";
  const diffButtons = {};
  for (const key of Object.keys(DIFFICULTIES)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ms-diff__btn";
    b.dataset.key = key;
    b.textContent = DIFFICULTIES[key].label;
    b.addEventListener("click", () => {
      if (key === currentDiff) return;
      currentDiff = key;
      updateDiffButtons();
      newGame();
    });
    diffBar.appendChild(b);
    diffButtons[key] = b;
  }
  function updateDiffButtons() {
    for (const [k, b] of Object.entries(diffButtons)) {
      b.classList.toggle("is-active", k === currentDiff);
    }
  }
  updateDiffButtons();

  frame.append(status, board, diffBar);
  root.appendChild(frame);
  winBody.appendChild(root);

  /* ---- game state ---- */
  /** @type {Cell[][]} */
  let grid = [];
  let rows = 0;
  let cols = 0;
  let mineCount = 0;
  let flagged = 0;
  let revealed = 0;
  let mineSeeded = false;
  let dead = false;
  let won = false;
  let timer = 0;
  let timerInt = 0;
  /** @type {HTMLDivElement[][]} */
  let cellEls = [];
  /** Long-press timer for touch flagging. */
  let pressTimer = 0;
  /** True once a long-press fires; suppresses the click that follows. */
  let pressFlagged = false;

  /**
   * @typedef {Object} Cell
   * @property {boolean} mine
   * @property {boolean} revealed
   * @property {boolean} flagged
   * @property {number} adj  - count of mines in the 8 neighbours
   */

  function makeCell() {
    return { mine: false, revealed: false, flagged: false, adj: 0 };
  }

  function newGame() {
    const cfg = DIFFICULTIES[currentDiff];
    rows = cfg.rows;
    cols = cfg.cols;
    mineCount = cfg.mines;
    flagged = 0;
    revealed = 0;
    mineSeeded = false;
    dead = false;
    won = false;
    timer = 0;
    stopTimer();
    timeLcd.set("000");
    mineLcd.set(pad3(mineCount));
    face.textContent = FACE.ok;

    grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, makeCell),
    );
    renderBoard();
  }

  function pad3(n) {
    const v = Math.max(-99, Math.min(999, n | 0));
    if (v < 0) return "-" + String(-v).padStart(2, "0");
    return String(v).padStart(3, "0");
  }

  function renderBoard() {
    board.innerHTML = "";
    board.style.setProperty("--ms-cols", String(cols));
    board.style.setProperty("--ms-rows", String(rows));
    cellEls = Array.from({ length: rows }, () => new Array(cols));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("div");
        el.className = "ms-cell ms-cell--hidden";
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.setAttribute("role", "gridcell");
        attachCellHandlers(el, r, c);
        board.appendChild(el);
        cellEls[r][c] = el;
      }
    }
  }

  function attachCellHandlers(el, r, c) {
    /* Mouse: left = reveal/chord, middle = chord, right = flag.
       We use mousedown for the “oh” face feedback, mouseup to commit. */
    el.addEventListener("mousedown", (e) => {
      if (dead || won) return;
      if (e.button === 0 || e.button === 1) {
        face.textContent = FACE.oh;
      }
    });
    el.addEventListener("mouseleave", () => {
      if (!dead && !won) face.textContent = FACE.ok;
    });
    el.addEventListener("mouseup", (e) => {
      if (dead || won) return;
      face.textContent = FACE.ok;
      const cell = grid[r][c];
      if (e.button === 2) {
        toggleFlag(r, c);
      } else if (e.button === 1) {
        chord(r, c);
      } else if (e.button === 0) {
        if (cell.revealed && cell.adj > 0) chord(r, c);
        else reveal(r, c);
      }
      checkWin();
    });
    /* Standalone contextmenu (touch + some browsers fire it without mousedown). */
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    /* Touch: tap = reveal, long-press = flag. */
    el.addEventListener("touchstart", (e) => {
      if (dead || won) return;
      pressFlagged = false;
      face.textContent = FACE.oh;
      pressTimer = window.setTimeout(() => {
        pressFlagged = true;
        toggleFlag(r, c);
        face.textContent = dead ? FACE.dead : FACE.ok;
      }, 350);
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
      if (dead || won) return;
      if (pressFlagged) {
        pressFlagged = false;
        e.preventDefault();
        return;
      }
      face.textContent = FACE.ok;
      const cell = grid[r][c];
      if (cell.revealed && cell.adj > 0) chord(r, c);
      else reveal(r, c);
      checkWin();
      e.preventDefault();
    });
    el.addEventListener("touchcancel", () => {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
      pressFlagged = false;
      if (!dead && !won) face.textContent = FACE.ok;
    });
  }

  /* Seed mines after the first reveal so (r0,c0) and its 8 neighbours are mine-free. */
  function seedMines(r0, c0) {
    const safe = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          safe.add(r * cols + c);
        }
      }
    }
    const candidates = [];
    for (let i = 0; i < rows * cols; i++) {
      if (!safe.has(i)) candidates.push(i);
    }
    /* If the safe region is bigger than (cells - mines), shrink the safe set so we still place all mines. */
    let need = mineCount;
    if (candidates.length < need) {
      const extras = [...safe].filter((i) => i !== r0 * cols + c0);
      while (candidates.length < need && extras.length) {
        candidates.push(extras.pop());
      }
    }
    /* Fisher–Yates partial shuffle to pick `need` indices. */
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      const idx = candidates[i];
      grid[Math.floor(idx / cols)][idx % cols].mine = true;
    }
    /* Compute adjacency counts. */
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].mine) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && grid[rr][cc].mine) n++;
          }
        }
        grid[r][c].adj = n;
      }
    }
    mineSeeded = true;
  }

  function startTimer() {
    if (timerInt) return;
    timerInt = window.setInterval(() => {
      timer = Math.min(999, timer + 1);
      timeLcd.set(pad3(timer));
    }, 1000);
  }
  function stopTimer() {
    if (!timerInt) return;
    window.clearInterval(timerInt);
    timerInt = 0;
  }

  function toggleFlag(r, c) {
    const cell = grid[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flagged += cell.flagged ? 1 : -1;
    mineLcd.set(pad3(mineCount - flagged));
    paintCell(r, c);
  }

  function reveal(r, c) {
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged) return;
    if (!mineSeeded) {
      seedMines(r, c);
      startTimer();
    }
    if (cell.mine) {
      cell.revealed = true;
      gameOver(r, c);
      return;
    }
    flood(r, c);
  }

  /* Iterative flood-fill so we don't blow the stack on Intermediate. */
  function flood(r0, c0) {
    const stack = [[r0, c0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const cell = grid[r][c];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      revealed++;
      paintCell(r, c);
      if (cell.adj !== 0) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) stack.push([rr, cc]);
        }
      }
    }
  }

  function chord(r, c) {
    const cell = grid[r][c];
    if (!cell.revealed || cell.adj === 0) return;
    let flags = 0;
    const targets = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const n = grid[rr][cc];
        if (n.flagged) flags++;
        else if (!n.revealed) targets.push([rr, cc]);
      }
    }
    if (flags !== cell.adj) return;
    for (const [rr, cc] of targets) {
      if (grid[rr][cc].mine) {
        grid[rr][cc].revealed = true;
        gameOver(rr, cc);
        return;
      }
      flood(rr, cc);
    }
  }

  function gameOver(rExploded, cExploded) {
    dead = true;
    stopTimer();
    face.textContent = FACE.dead;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.mine && !cell.flagged) cell.revealed = true;
        paintCell(r, c, r === rExploded && c === cExploded);
      }
    }
  }

  function checkWin() {
    if (dead || won) return;
    if (revealed === rows * cols - mineCount) {
      won = true;
      stopTimer();
      face.textContent = FACE.win;
      /* Auto-flag remaining mines, classic behaviour. */
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r][c];
          if (cell.mine && !cell.flagged) {
            cell.flagged = true;
            flagged++;
            paintCell(r, c);
          }
        }
      }
      mineLcd.set(pad3(0));
    }
  }

  function paintCell(r, c, exploded = false) {
    const el = cellEls[r][c];
    const cell = grid[r][c];
    el.className = "ms-cell";
    el.textContent = "";
    el.style.color = "";
    if (cell.revealed) {
      el.classList.add("ms-cell--open");
      if (cell.mine) {
        el.classList.add("ms-cell--mine");
        if (exploded) el.classList.add("ms-cell--boom");
        el.textContent = MINE_GLYPH;
      } else if (cell.adj > 0) {
        el.textContent = String(cell.adj);
        el.style.color = NUMBER_COLORS[cell.adj];
      }
    } else {
      el.classList.add("ms-cell--hidden");
      if (cell.flagged) {
        el.classList.add("ms-cell--flag");
        if (cell.flagged) el.textContent = FLAG_GLYPH;
      }
    }
  }

  face.addEventListener("click", () => newGame());

  /* ---- window drag (mouse + touch) ---- */
  let dragging = false;
  let dragOffX = 0;
  let dragOffY = 0;
  /** Once dragged, switch from transform-centered placement to absolute left/top. */
  let positioned = false;

  function commitPositionFromCenteredTransform() {
    if (positioned) return;
    const r = win.getBoundingClientRect();
    win.style.left = `${r.left}px`;
    win.style.top = `${r.top}px`;
    win.style.transform = "";
    positioned = true;
  }

  /* Clamp so the title bar always remains grabbable on screen. */
  function clamp(x, y) {
    const r = win.getBoundingClientRect();
    const minVisible = 24;
    const maxX = window.innerWidth - minVisible;
    const minX = -(r.width - minVisible);
    const minY = 0;
    const maxY = window.innerHeight - minVisible;
    return [Math.min(maxX, Math.max(minX, x)), Math.min(maxY, Math.max(minY, y))];
  }

  function onTitleMouseDown(e) {
    if (e.target.closest(".ms-window__close")) return;
    if (e.button !== 0) return;
    bringToFront();
    commitPositionFromCenteredTransform();
    dragging = true;
    win.classList.add("ms-window--dragging");
    const r = win.getBoundingClientRect();
    dragOffX = e.clientX - r.left;
    dragOffY = e.clientY - r.top;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const [x, y] = clamp(e.clientX - dragOffX, e.clientY - dragOffY);
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    win.classList.remove("ms-window--dragging");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  /* Touch drag — single-finger drag from title bar; pinch ignored. */
  function onTitleTouchStart(e) {
    if (e.target.closest(".ms-window__close")) return;
    if (e.touches.length !== 1) return;
    bringToFront();
    commitPositionFromCenteredTransform();
    dragging = true;
    win.classList.add("ms-window--dragging");
    const r = win.getBoundingClientRect();
    const t = e.touches[0];
    dragOffX = t.clientX - r.left;
    dragOffY = t.clientY - r.top;
    e.preventDefault();
  }

  function onTitleTouchMove(e) {
    if (!dragging) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const [x, y] = clamp(t.clientX - dragOffX, t.clientY - dragOffY);
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    e.preventDefault();
  }

  function onTitleTouchEnd() {
    if (!dragging) return;
    dragging = false;
    win.classList.remove("ms-window--dragging");
  }

  titleBar.addEventListener("mousedown", onTitleMouseDown);
  titleBar.addEventListener("touchstart", onTitleTouchStart, { passive: false });
  titleBar.addEventListener("touchmove", onTitleTouchMove, { passive: false });
  titleBar.addEventListener("touchend", onTitleTouchEnd);
  titleBar.addEventListener("touchcancel", onTitleTouchEnd);
  /* Block native context menu on the title bar so right-click doesn't break the drag UX. */
  titleBar.addEventListener("contextmenu", (e) => e.preventDefault());
  /* Double-click on title bar = re-center (poor-man's “restore”). */
  titleBar.addEventListener("dblclick", (e) => {
    if (e.target.closest(".ms-window__close")) return;
    win.style.left = "50%";
    win.style.top = "50%";
    win.style.transform = "translate(-50%, -50%)";
    positioned = false;
  });

  /* Bring window above any future siblings (other floating things) on press. */
  function bringToFront() {
    win.style.zIndex = String(nextWindowZ());
  }
  bringToFront();

  win.addEventListener("mousedown", bringToFront);
  win.addEventListener("touchstart", bringToFront, { passive: true });

  /* Close handling — both the X button and the optional onClose hook. */
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopTimer();
    window.clearTimeout(pressTimer);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    win.remove();
  }

  closeBtn.addEventListener("click", () => {
    dispose();
    onClose?.();
  });

  newGame();

  return {
    dispose,
    newGame,
    focus() {
      bringToFront();
    },
  };
}

/* Build a 3-digit LCD readout (red on black, monospace). */
function makeLcd(cls, initial) {
  const el = document.createElement("div");
  el.className = cls;
  const span = document.createElement("span");
  span.textContent = initial;
  el.appendChild(span);
  return {
    el,
    set(v) {
      span.textContent = v;
    },
  };
}

/* Z-index counter shared across any future floating windows. Starts above the
   panel drawer (.content-pane uses z-index 1, .title-layer uses 2). */
let _topZ = 1000;
function nextWindowZ() {
  _topZ += 1;
  return _topZ;
}
