/**
 * Singleton stream player for welcome.audio — survives panel close / chip changes.
 */

const STREAM_BASE = "https://stream.welcome.audio/stream";

/** @type {Set<(state: WelcomeAudioState) => void>} */
const subscribers = new Set();

/** Option A chip HTML — kept in sync with listening-welcome-audio.js */
const LISTENING_CHIP_PLAYING_HTML =
  'Listening<span class="chip__label-optiona" aria-hidden="true">' +
  '<svg class="chip__volume-icon-a" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M11 5L6 9H3v6h3l5 4V5z" />' +
  '<path d="M15.54 8.46a5 5 0 010 7.07" />' +
  '<path d="M17.66 6.34a8 8 0 010 11.32" />' +
  "</svg>" +
  "</span>";

const LISTENING_CHIP_PLAYING_HTML_MUTED =
  'Listening<span class="chip__label-optiona chip__label-optiona--muted" aria-hidden="true">' +
  '<svg class="chip__volume-icon-a chip__volume-icon-a--muted" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M11 5L6 9H3v6h3l5 4V5z" />' +
  '<path d="M15.54 8.46a5 5 0 010 7.07" />' +
  '<path d="M17.66 6.34a8 8 0 010 11.32" />' +
  "</svg>" +
  "</span>";

/**
 * Extra horizontal width (in em of chip font size) when the volume icon is visible.
 * Must match index.html: `.chip__label-optiona { margin-left: 0.1em }` +
 * `.chip__volume-icon-a { width: 0.72em }` → 0.1 + 0.72 = 0.82em.
 * Used by app.js Pretext chip packing (text-only measure + this).
 */
export const LISTENING_CHIP_LAYOUT_EXTRA_EM = 0.82;

let userMuted = false;

function syncListeningChip(playing) {
  const label = document.querySelector('.chip[data-key="listening"] .chip__label');
  if (!label) return;
  if (playing) {
    label.innerHTML = userMuted ? LISTENING_CHIP_PLAYING_HTML_MUTED : LISTENING_CHIP_PLAYING_HTML;
  } else {
    label.textContent = "Listening";
  }
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new CustomEvent("store1-chips-layout"));
  });
}

/**
 * @typedef {{ playing: boolean; loading: boolean; reconnecting: boolean }} WelcomeAudioState
 */

function emit() {
  const state = {
    playing: welcomeAudioInternal.isPlaying,
    loading: welcomeAudioInternal.isLoading,
    reconnecting: welcomeAudioInternal.isReconnecting,
  };
  syncListeningChip(state.playing);
  subscribers.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  });
}

const welcomeAudioInternal = {
  isPlaying: false,
  isLoading: false,
  isReconnecting: false,
};

let audio = null;
let shouldPlay = false;
let lastTimeUpdate = 0;
let timeUpdateTimer = null;
let reconnectAttempts = 0;
let reconnectTimeoutId = null;
let audioGeneration = 0;
let connectedAt = 0;
let hasReceivedTimeupdate = false;

function clearReconnectTimeout() {
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
}

function destroyAudioElement() {
  if (audio) {
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    try {
      audio.remove();
    } catch {
      /* ignore */
    }
    audio = null;
  }
}

function startTimeUpdateMonitoring() {
  lastTimeUpdate = Date.now();
  if (timeUpdateTimer) clearInterval(timeUpdateTimer);

  timeUpdateTimer = setInterval(() => {
    if (!shouldPlay) return;
    if (welcomeAudioInternal.isReconnecting) return;

    const now = Date.now();
    if (!hasReceivedTimeupdate && connectedAt && now - connectedAt < 15000) {
      return;
    }
    if (now - lastTimeUpdate > 10000) {
      scheduleReconnect();
    }
  }, 500);
}

function stopTimeUpdateMonitoring() {
  if (timeUpdateTimer) {
    clearInterval(timeUpdateTimer);
    timeUpdateTimer = null;
  }
}

function scheduleReconnect() {
  if (!shouldPlay) return;
  if (welcomeAudioInternal.isReconnecting) return;

  welcomeAudioInternal.isReconnecting = true;
  reconnectAttempts++;
  stopTimeUpdateMonitoring();
  destroyAudioElement();
  welcomeAudioInternal.isPlaying = false;
  welcomeAudioInternal.isLoading = true;
  emit();

  clearReconnectTimeout();
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    if (!shouldPlay) return;
    welcomeAudioInternal.isReconnecting = false;
    startAudioInternal();
  }, 2000);
}

function setupAudioListeners(audioElement, generation) {
  audioElement.addEventListener("loadstart", () => {
    if (audioElement !== audio) return;
    if (generation !== audioGeneration) return;
    if (!shouldPlay) return;
    if (!welcomeAudioInternal.isLoading) {
      welcomeAudioInternal.isLoading = true;
      emit();
    }
  });

  audioElement.addEventListener("canplay", function () {
    if (audioElement !== audio) return;
    if (generation !== audioGeneration) return;
    if (!shouldPlay) return;
    if (welcomeAudioInternal.isPlaying) return;
    if (welcomeAudioInternal.isPlaying === false && welcomeAudioInternal.isLoading === false) {
      return;
    }
    welcomeAudioInternal.isLoading = false;
    welcomeAudioInternal.isPlaying = true;
    welcomeAudioInternal.isReconnecting = false;
    reconnectAttempts = 0;

    lastTimeUpdate = Date.now();
    connectedAt = Date.now();
    hasReceivedTimeupdate = false;
    startTimeUpdateMonitoring();

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    emit();
  });

  audioElement.addEventListener("timeupdate", function () {
    if (audioElement !== audio) return;
    if (generation !== audioGeneration) return;
    hasReceivedTimeupdate = true;
    lastTimeUpdate = Date.now();
  });

  audioElement.addEventListener("stalled", function () {
    if (audioElement !== audio) return;
    if (generation !== audioGeneration) return;
    if (!shouldPlay) return;
    if (welcomeAudioInternal.isPlaying && !welcomeAudioInternal.isReconnecting) {
      const now = Date.now();
      if (!hasReceivedTimeupdate && connectedAt && now - connectedAt < 8000) {
        return;
      }
      scheduleReconnect();
    }
  });

  audioElement.addEventListener("error", function () {
    if (audioElement !== audio) return;
    if (generation !== audioGeneration) return;
    if (!shouldPlay) return;
    if (welcomeAudioInternal.isPlaying && !welcomeAudioInternal.isReconnecting) {
      scheduleReconnect();
    } else {
      welcomeAudioInternal.isLoading = false;
      welcomeAudioInternal.isReconnecting = false;
      emit();
    }
  });
}

function startAudioInternal() {
  if (!shouldPlay) return;
  clearReconnectTimeout();
  welcomeAudioInternal.isLoading = true;
  welcomeAudioInternal.isPlaying = false;
  emit();
  connectedAt = 0;
  hasReceivedTimeupdate = false;
  audioGeneration++;
  const generation = audioGeneration;
  audio = new Audio();
  audio.preload = "none";
  audio.muted = userMuted;
  audio.src = STREAM_BASE + "?" + Date.now();
  setupAudioListeners(audio, generation);
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function stopAudioInternal() {
  clearReconnectTimeout();
  welcomeAudioInternal.isReconnecting = false;
  destroyAudioElement();
  welcomeAudioInternal.isPlaying = false;
  welcomeAudioInternal.isLoading = false;
  stopTimeUpdateMonitoring();
  reconnectAttempts = 0;
  connectedAt = 0;
  hasReceivedTimeupdate = false;
  /* Next session starts unmuted — don’t carry mute across stop */
  userMuted = false;

  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "paused";
  }
  emit();
}

if ("mediaSession" in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "Welcome Audio",
    artist: "Live Stream",
    artwork: [{ src: "welcome.audio01.png", sizes: "512x512", type: "image/png" }],
  });

  navigator.mediaSession.setActionHandler("play", () => {
    setWelcomeAudioPlaying(true);
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    setWelcomeAudioPlaying(false);
  });
}

/**
 * @param {(state: WelcomeAudioState) => void} fn
 * @returns {() => void}
 */
export function subscribeWelcomeAudio(fn) {
  subscribers.add(fn);
  syncListeningChip(welcomeAudioInternal.isPlaying);
  fn({
    playing: welcomeAudioInternal.isPlaying,
    loading: welcomeAudioInternal.isLoading,
    reconnecting: welcomeAudioInternal.isReconnecting,
  });
  return () => subscribers.delete(fn);
}

/** True while the stream is intended to be on (including loading / reconnecting). */
export function isWelcomeAudioActive() {
  return shouldPlay;
}

/** True once audio is actually playing (not buffering). */
export function isWelcomeAudioPlaying() {
  return welcomeAudioInternal.isPlaying;
}

/** Toggle mute for the live stream (chip volume control). Does not stop playback intent. */
export function toggleWelcomeAudioMute() {
  userMuted = !userMuted;
  if (audio) {
    audio.muted = userMuted;
  }
  emit();
}

export function isWelcomeAudioMuted() {
  return userMuted;
}

/**
 * Start or stop the welcome.audio stream.
 * @param {boolean} want - User wants playback on or off.
 */
export function setWelcomeAudioPlaying(want) {
  shouldPlay = want;
  if (want) {
    if (!welcomeAudioInternal.isPlaying && !welcomeAudioInternal.isLoading && !welcomeAudioInternal.isReconnecting) {
      startAudioInternal();
    }
  } else {
    stopAudioInternal();
  }
}
