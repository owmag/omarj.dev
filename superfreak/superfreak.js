const revealed = new Set();
const videos = [...document.querySelectorAll("video[data-src]")];

const visibility = new IntersectionObserver(
  (entries) => {
    entries.forEach(({ target, intersectionRatio }) => {
      if (intersectionRatio >= 1) target.play().catch(() => {});
      else target.pause();
    });
  },
  { threshold: 1 },
);

function revealTitle(block) {
  if (!block || revealed.has(block)) return;
  revealed.add(block);
  document.querySelectorAll(`[data-block="${block}"][data-reveal="title"]`).forEach((el) => {
    el.classList.remove("pending");
    el.classList.add("ready");
  });
}

function onVideoReady(video) {
  const cell = video.closest(".cell");
  cell.classList.remove("pending");
  cell.classList.add("ready");
  revealTitle(video.dataset.block);
  const prev = cell.previousElementSibling;
  if (prev?.classList.contains("gap")) {
    prev.classList.remove("pending");
    prev.classList.add("ready");
  }
}

videos.forEach((video) => {
  visibility.observe(video);
  video.src = video.dataset.src;
  video.load();
  video.addEventListener("canplaythrough", () => onVideoReady(video), { once: true });
  video.addEventListener("error", () => onVideoReady(video), { once: true });
});
