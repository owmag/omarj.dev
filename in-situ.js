/**
 * In situ — circular scroll panel.
 *
 * Port of the technique from Miaoye Que's "I Feel Like If I Condensed My Eating
 * Schedules Together I'd Be Eating All Day" on crawlspace.cool:
 *   - Entries are positioned around the circumference of a circle (sin/cos).
 *   - Wheel / touch deltas rotate an offset angle.
 *   - The wrapper is translated by the inverse of the chosen point on the circle,
 *     keeping that point anchored at the panel center while the rest of the
 *     ring sweeps past.
 *
 * No jQuery, no virtual-scroll dep — wheel + pointer drag handled inline.
 */

const ENTRIES = [
  { id: "t2330", time: "23:30~24:30", words: "quick sanity check: first-time user, half-awake, tiny phone. still legible?" },
  { id: "t0030", time: "24:30~25:00", words: "cut two steps. felt scary. instantly better." },
  {
    id: "t0200",
    time: "26:00~27:30",
    words:
      "looked beautiful in figma, then real states showed up and the whole thing tied itself into a knot",
  },
  {
    id: "t0330",
    time: "27:30~30:00",
    words:
      "if i need hand gestures to explain the transition, i've already lost",
  },
  { id: "t0600", time: "06:00~06:40", words: "rule for today: momentum > polish. always." },
  { id: "t0640", time: "06:40~07:00", words: "made the animation less fancy and more immediate; weirdly that made it feel higher-end" },
  { id: "t0700", time: "07:00~07:25", words: "not building a special UI for this edge case. just making the fallback feel deliberate." },
  {
    id: "t0725",
    time: "07:25~08:00",
    words: "changed submit -> continue. same action, different emotional weight.",
  },
  { id: "t0800", time: "08:00~08:30", words: "asking what breaks on bad network keeps saving me from shipping pretty lies" },
  { id: "t0830", time: "08:30~09:00", words: "rare state, big trust moment." },
  { id: "t0900", time: "09:00~09:20", words: "crossed the playful/distracting line twice before lunch lol" },
  {
    id: "t0920",
    time: "09:20~10:30",
    words:
      "the system isn't chaotic because design is weak; context keeps moving under our feet",
  },
  { id: "t1030", time: "10:30~11:35", words: "deleted one menu option and the whole thing exhaled" },
  { id: "t1135", time: "11:35~12:45", words: "every time i hide complexity, it leaks out later as confusion" },
  { id: "t1245", time: "12:45~13:30", words: "thought it was visual. nope, timing." },
  {
    id: "t1330",
    time: "13:30~14:00",
    words:
      "if empty state feels like punishment, people bounce before seeing the good part",
  },
  { id: "t1400", time: "14:00~15:30", words: "trying to keep loading honest. alive, not frozen." },
  { id: "t1530", time: "15:30~16:00", words: "just one more variant -> component turns into a policy document" },
  { id: "t1600", time: "16:00~16:45", words: "no functional changes, only cadence. now it feels like it respects your time." },
  { id: "t1645", time: "16:45~17:30", words: "works fine in isolation, chaotic in sequence. handoff design day." },
  {
    id: "t1730",
    time: "17:30~18:45",
    words: "fastest clarity win today: delete labels that repeat what layout already says",
  },
  { id: "t1845", time: "18:45~19:30", words: "prototyped the smart version; the dumb predictable one still feels better in the hand" },
  { id: "t1930", time: "19:30~20:30", words: "same pattern again: optimize happy path, apologize everywhere else" },
  { id: "t2030", time: "20:30~21:00", words: "kept one rough edge. smoothing it made everything feel weirdly evasive." },
  { id: "t2100", time: "21:00~22:00", words: "a11y pass found product issues, not just UI issues. as usual." },
  {
    id: "t2200",
    time: "22:00~23:30",
    words: "note to self: finished is when behavior stays stable under stress, not when screenshots look done",
  },
];

/**
 * @param {HTMLElement} container - panel body to mount into
 * @returns {{ dispose: () => void }}
 */
export function mountInSitu(container) {
  container.classList.add("panel__body--in-situ");

  const root = document.createElement("div");
  root.className = "in-situ";

  const main = document.createElement("div");
  main.className = "in-situ__main";

  const wrapper = document.createElement("div");
  wrapper.className = "in-situ__wrapper";

  const circle = document.createElement("div");
  circle.className = "in-situ__circle";

  const entriesEl = document.createElement("div");
  entriesEl.className = "in-situ__entries";

  for (const e of ENTRIES) {
    const entry = document.createElement("div");
    entry.className = "in-situ__entry";
    entry.id = `is-${e.id}`;

    const time = document.createElement("div");
    time.className = "in-situ__time";
    time.textContent = e.time;

    const words = document.createElement("div");
    words.className = "in-situ__words";
    words.textContent = e.words;

    entry.appendChild(time);
    entry.appendChild(words);
    entriesEl.appendChild(entry);
  }

  circle.appendChild(entriesEl);
  wrapper.appendChild(circle);
  main.appendChild(wrapper);
  root.appendChild(main);
  container.appendChild(root);

  const items = entriesEl.querySelectorAll(".in-situ__entry");
  const radians = (2 * Math.PI) / items.length;

  let radius = 0;
  let offset = 0;

  function positionEntries() {
    radius = circle.offsetHeight / 2;
    items.forEach((el, i) => {
      const alpha = Math.PI - i * radians;
      const x = radius * Math.sin(alpha);
      const y = radius * Math.cos(alpha);
      /* Center each entry on the circle (not anchored by top-left). The two
         translates compose so the entry's center lands exactly on (x, y). */
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
    applyWrapper();
  }

  function applyWrapper() {
    /* Translate the wrapper by the inverse of the focal point on the ring so
       that point stays pinned to (#in-situ__main) — the visual focal point. */
    wrapper.style.transform = `translate(${radius * Math.sin(offset)}px, ${radius * Math.cos(offset)}px)`;
  }

  /* Initial offset: centre the 06:40~07:00 entry on load. */
  const START_ENTRY_ID = "t0640";
  const startIdx = ENTRIES.findIndex((e) => e.id === START_ENTRY_ID);
  const startIndex = startIdx >= 0 ? startIdx : 0;
  const percent = startIndex / items.length;
  const TWO_PI = 2 * Math.PI;
  offset = (TWO_PI * (1 - percent)) % TWO_PI;

  positionEntries();

  /* Resize handling — keep entries aligned when panel resizes. */
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(positionEntries) : null;
  if (ro) ro.observe(container);
  window.addEventListener("resize", positionEntries);

  /* Wheel + drag both move offset directly. Tune these two for feel. */
  const WHEEL_GAIN = 0.0006;
  const DRAG_GAIN = 0.004;

  function onWheel(e) {
    e.preventDefault();
    offset = (offset - e.deltaY * WHEEL_GAIN + TWO_PI) % TWO_PI;
    applyWrapper();
  }
  root.addEventListener("wheel", onWheel, { passive: false });

  let pointerActive = false;
  let pointerLastY = 0;
  let pointerId = null;

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerActive = true;
    pointerLastY = e.clientY;
    pointerId = e.pointerId;
    try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onPointerMove(e) {
    if (!pointerActive || e.pointerId !== pointerId) return;
    const dy = e.clientY - pointerLastY;
    pointerLastY = e.clientY;
    offset = (offset + dy * DRAG_GAIN + TWO_PI) % TWO_PI;
    applyWrapper();
  }
  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerActive = false;
    pointerId = null;
    try { root.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);

  return {
    dispose() {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", positionEntries);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      container.classList.remove("panel__body--in-situ");
      container.innerHTML = "";
    },
  };
}
