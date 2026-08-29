import { ColdflameVisualizer } from "./visualizer.js?v=20260828-2";

const elements = {
  audio: document.querySelector("#audio"),
  stage: document.querySelector("#visual-stage"),
  canvas: document.querySelector("#visualizer-canvas"),
  artWash: document.querySelector("#art-wash"),
  stageCover: document.querySelector("#stage-cover"),
  releaseYear: document.querySelector("#release-year"),
  releaseName: document.querySelector("#release-name"),
  trackList: document.querySelector("#track-list"),
  trackTitle: document.querySelector("#track-title"),
  nowRelease: document.querySelector("#now-release"),
  playbackStatus: document.querySelector("#playback-status"),
  trackPosition: document.querySelector("#track-position"),
  releaseCount: document.querySelector("#release-count"),
  releaseLink: document.querySelector("#release-link"),
  paletteSwatches: document.querySelector("#palette-swatches"),
  playButton: document.querySelector("#play-button"),
  previousButton: document.querySelector("#previous-button"),
  nextButton: document.querySelector("#next-button"),
  seek: document.querySelector("#seek"),
  elapsed: document.querySelector("#elapsed"),
  duration: document.querySelector("#duration"),
  muteButton: document.querySelector("#mute-button"),
  volume: document.querySelector("#volume"),
  volumeValue: document.querySelector("#volume-value"),
  shareButton: document.querySelector("#share-button"),
  queueButton: document.querySelector("#queue-button"),
  queueClose: document.querySelector("#queue-close"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  toast: document.querySelector("#toast"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  bassMeter: document.querySelector("#bass-meter"),
  midMeter: document.querySelector("#mid-meter"),
  trebleMeter: document.querySelector("#treble-meter")
};

const state = {
  catalog: null,
  releases: new Map(),
  currentIndex: 0,
  isSeeking: false,
  wasPlayingBeforeSeek: false,
  lastVolume: 0.82,
  toastTimer: null
};

const visualizer = new ColdflameVisualizer({
  canvas: elements.canvas,
  audio: elements.audio,
  stage: elements.stage,
  meters: {
    bass: elements.bassMeter,
    mids: elements.midMeter,
    treble: elements.trebleMeter
  }
});

function formatTime(seconds, precision = false) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  if (precision && remaining % 1 !== 0) return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
  return `${minutes}:${Math.floor(remaining).toString().padStart(2, "0")}`;
}

function releaseDisplayName(release) {
  return release.displayTitle.replace(" - Single", " — Single");
}

function artworkPath(release) {
  return release.artwork.webPath || release.artwork.visualizerPath;
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

function setStatus(message) {
  elements.playbackStatus.textContent = message;
}

function applyPalette(release) {
  const root = document.documentElement;
  const palette = release.palette;
  root.style.setProperty("--bg", palette.background);
  root.style.setProperty("--surface", palette.surface);
  root.style.setProperty("--primary", palette.primary);
  root.style.setProperty("--secondary", palette.secondary);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--highlight", palette.highlight);
  root.style.setProperty("--artwork-image", `url("${artworkPath(release)}")`);
  elements.themeColor.setAttribute("content", palette.background);
  visualizer.setPalette(palette);

  elements.paletteSwatches.replaceChildren(...palette.colors.map((color) => {
    const swatch = document.createElement("span");
    swatch.className = "palette-swatch";
    swatch.dataset.color = color;
    swatch.style.backgroundColor = color;
    swatch.setAttribute("title", color);
    return swatch;
  }));
}

function updateMediaSession(track, release) {
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: release.displayTitle,
    artwork: [
      {
        src: new URL(artworkPath(release), window.location.href).href,
        sizes: release.artwork.webPath ? "1200x1200" : `${release.artwork.width}x${release.artwork.height}`,
        type: "image/jpeg"
      }
    ]
  });
}

function updateTrackButtons() {
  elements.trackList.querySelectorAll(".track-select").forEach((button, index) => {
    button.setAttribute("aria-current", String(index === state.currentIndex));
  });
}

function updateUrl(track) {
  const url = new URL(window.location.href);
  url.searchParams.set("track", track.id);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function transitionCover(release, track) {
  elements.stageCover.classList.add("is-changing");
  const image = new Image();
  image.onload = () => {
    elements.stageCover.src = artworkPath(release);
    elements.stageCover.alt = `${release.title} cover art`;
    requestAnimationFrame(() => elements.stageCover.classList.remove("is-changing"));
  };
  image.onerror = () => elements.stageCover.classList.remove("is-changing");
  image.src = artworkPath(release);
  elements.stageCover.dataset.track = track.id;
}

async function selectTrack(index, { autoplay = false, updateHistory = true } = {}) {
  const tracks = state.catalog.tracks;
  const boundedIndex = (index + tracks.length) % tracks.length;
  const track = tracks[boundedIndex];
  const release = state.releases.get(track.releaseId);
  const releaseIndex = state.catalog.releases.findIndex((candidate) => candidate.id === release.id);
  const changedTrack = boundedIndex !== state.currentIndex || !elements.audio.src;

  state.currentIndex = boundedIndex;
  visualizer.setTrack(boundedIndex, tracks.length);
  applyPalette(release);
  updateTrackButtons();
  transitionCover(release, track);

  elements.trackTitle.textContent = track.title;
  elements.nowRelease.textContent = releaseDisplayName(release);
  elements.releaseYear.textContent = release.releaseDate.slice(0, 4);
  elements.releaseName.textContent = releaseDisplayName(release);
  elements.trackPosition.textContent = `${String(boundedIndex + 1).padStart(2, "0")} / ${String(tracks.length).padStart(2, "0")}`;
  elements.releaseCount.textContent = `Release ${String(releaseIndex + 1).padStart(2, "0")} / ${String(state.catalog.releases.length).padStart(2, "0")}`;
  elements.releaseLink.href = release.appleMusicUrl;
  elements.duration.textContent = formatTime(track.durationMs / 1000, track.durationMs % 1000 !== 0);
  elements.duration.dateTime = track.durationIso;
  elements.playButton.setAttribute("aria-label", `Play ${track.title}`);
  document.title = `${track.title} — Coldflame Archive`;
  updateMediaSession(track, release);
  if (updateHistory) updateUrl(track);

  if (changedTrack) {
    elements.seek.value = "0";
    elements.seek.style.setProperty("--range-fill", "0%");
    elements.elapsed.textContent = "0:00";
    elements.audio.src = track.audio.visualizerPath;
    elements.audio.load();
    setStatus("Loading archive audio");
  }

  if (window.innerWidth <= 900) document.body.dataset.queueOpen = "false";

  if (autoplay) {
    try {
      await startPlayback();
    } catch (error) {
      reportPlaybackError(error);
    }
  }
}

function buildTrackList() {
  const items = state.catalog.tracks.map((track, index) => {
    const release = state.releases.get(track.releaseId);
    const item = document.createElement("li");
    item.className = "track-item";

    const button = document.createElement("button");
    button.className = "track-select";
    button.type = "button";
    button.dataset.trackId = track.id;
    button.setAttribute("aria-current", String(index === state.currentIndex));
    button.setAttribute("aria-label", `Play ${track.title}`);
    button.innerHTML = `
      <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="track-copy">
        <strong>${track.title}</strong>
        <small>${release.releaseDate.slice(0, 4)} · ${release.title}</small>
      </span>
      <span class="track-duration">${formatTime(track.durationMs / 1000)}</span>
    `;
    button.addEventListener("click", () => selectTrack(index, { autoplay: true }));
    item.append(button);
    return item;
  });
  elements.trackList.replaceChildren(...items);
}

function reportPlaybackError(error) {
  const mediaError = elements.audio.error;
  if (error?.name === "NotAllowedError") setStatus("Tap play once more");
  else if (error?.name === "NotSupportedError" || mediaError?.code === 4) setStatus("This audio file could not play");
  else setStatus("Playback failed — retry");
  console.error("Coldflame playback failed.", { error, mediaError });
}

async function startPlayback() {
  // Keep audio.play() in the original tap stack. Mobile Safari can discard the
  // user activation if Web Audio setup is awaited before native playback.
  const playbackAttempt = elements.audio.play();
  const analysisAttempt = visualizer.connect().catch((error) => {
    console.warn("Playback started without audio analysis.", error);
    return false;
  });

  await playbackAttempt;
  await analysisAttempt;
}

async function togglePlayback() {
  if (elements.audio.paused) {
    try {
      await startPlayback();
    } catch (error) {
      reportPlaybackError(error);
    }
  } else {
    elements.audio.pause();
  }
}

function seekFromControl() {
  if (!Number.isFinite(elements.audio.duration)) return;
  elements.audio.currentTime = (Number(elements.seek.value) / 1000) * elements.audio.duration;
}

function updateTimeline() {
  if (!state.isSeeking && Number.isFinite(elements.audio.duration) && elements.audio.duration > 0) {
    const progress = elements.audio.currentTime / elements.audio.duration;
    elements.seek.value = String(Math.round(progress * 1000));
    elements.seek.style.setProperty("--range-fill", `${progress * 100}%`);
  }
  elements.elapsed.textContent = formatTime(elements.audio.currentTime);
  elements.elapsed.dateTime = `PT${Math.max(0, elements.audio.currentTime).toFixed(3)}S`;
}

function setVolume(value) {
  const normalized = Math.max(0, Math.min(1, Number(value)));
  elements.audio.volume = normalized;
  elements.audio.muted = normalized === 0;
  if (normalized > 0) state.lastVolume = normalized;
  elements.volume.value = String(normalized);
  elements.volume.style.setProperty("--range-fill", `${normalized * 100}%`);
  elements.volumeValue.textContent = String(Math.round(normalized * 100));
  elements.muteButton.setAttribute("aria-label", normalized === 0 ? "Restore volume" : "Mute");
}

function toggleMute() {
  if (elements.audio.muted || elements.audio.volume === 0) setVolume(state.lastVolume || 0.82);
  else setVolume(0);
}

async function shareCurrentTrack() {
  const track = state.catalog.tracks[state.currentIndex];
  const release = state.releases.get(track.releaseId);
  const url = new URL(window.location.href);
  url.searchParams.set("track", track.id);
  const shareData = {
    title: `${track.title} — Coldflame`,
    text: `${track.title} by Coldflame · ${releaseDisplayName(release)} · complete release archive`,
    url: url.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
    showToast("Track link copied");
  } catch (error) {
    if (error?.name !== "AbortError") showToast("Share was not available");
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await elements.stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    showToast("Full view is not available here");
  }
}

function bindMediaActions() {
  if (!("mediaSession" in navigator)) return;
  const actions = {
    play: () => startPlayback().catch(reportPlaybackError),
    pause: () => elements.audio.pause(),
    previoustrack: () => selectTrack(state.currentIndex - 1, { autoplay: true }),
    nexttrack: () => selectTrack(state.currentIndex + 1, { autoplay: true }),
    seekto: ({ seekTime }) => {
      if (Number.isFinite(seekTime)) elements.audio.currentTime = seekTime;
    }
  };
  Object.entries(actions).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Unsupported Media Session actions are optional.
    }
  });
}

function bindEvents() {
  elements.playButton.addEventListener("click", togglePlayback);
  elements.previousButton.addEventListener("click", () => selectTrack(state.currentIndex - 1, { autoplay: !elements.audio.paused }));
  elements.nextButton.addEventListener("click", () => selectTrack(state.currentIndex + 1, { autoplay: !elements.audio.paused }));
  elements.shareButton.addEventListener("click", shareCurrentTrack);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  elements.muteButton.addEventListener("click", toggleMute);
  elements.queueButton.addEventListener("click", () => { document.body.dataset.queueOpen = "true"; });
  elements.queueClose.addEventListener("click", () => { document.body.dataset.queueOpen = "false"; });
  elements.seek.addEventListener("pointerdown", () => {
    state.isSeeking = true;
    state.wasPlayingBeforeSeek = !elements.audio.paused;
  });
  elements.seek.addEventListener("input", () => {
    const progress = Number(elements.seek.value) / 1000;
    elements.seek.style.setProperty("--range-fill", `${progress * 100}%`);
    if (Number.isFinite(elements.audio.duration)) elements.elapsed.textContent = formatTime(progress * elements.audio.duration);
  });
  elements.seek.addEventListener("change", () => {
    seekFromControl();
    state.isSeeking = false;
  });
  elements.seek.addEventListener("pointerup", () => {
    seekFromControl();
    state.isSeeking = false;
  });

  elements.volume.addEventListener("input", () => setVolume(elements.volume.value));

  elements.audio.addEventListener("loadstart", () => setStatus("Loading archive audio"));
  elements.audio.addEventListener("canplay", () => {
    if (elements.audio.paused) setStatus("Ready to play");
  });
  elements.audio.addEventListener("playing", () => {
    document.body.dataset.playing = "true";
    setStatus("Audio reactive");
    elements.playButton.setAttribute("aria-label", "Pause");
  });
  elements.audio.addEventListener("pause", () => {
    document.body.dataset.playing = "false";
    if (!elements.audio.ended) setStatus("Paused");
    const track = state.catalog.tracks[state.currentIndex];
    elements.playButton.setAttribute("aria-label", `Play ${track.title}`);
  });
  elements.audio.addEventListener("timeupdate", updateTimeline);
  elements.audio.addEventListener("durationchange", () => {
    if (Number.isFinite(elements.audio.duration)) {
      elements.duration.textContent = formatTime(elements.audio.duration, elements.audio.duration % 1 !== 0);
    }
  });
  elements.audio.addEventListener("ended", () => selectTrack(state.currentIndex + 1, { autoplay: true }));
  elements.audio.addEventListener("error", () => {
    document.body.dataset.playing = "false";
    setStatus("Audio unavailable");
  });

  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === elements.stage;
    elements.fullscreenButton.setAttribute("aria-label", active ? "Leave full visualizer view" : "Enter full visualizer view");
    requestAnimationFrame(() => visualizer.resize());
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement;
    if (event.code === "Space" && !isTyping) {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === "ArrowLeft" && !isTyping) {
      selectTrack(state.currentIndex - 1, { autoplay: !elements.audio.paused });
    } else if (event.key === "ArrowRight" && !isTyping) {
      selectTrack(state.currentIndex + 1, { autoplay: !elements.audio.paused });
    } else if (event.key.toLowerCase() === "m" && !isTyping) {
      toggleMute();
    } else if (event.key.toLowerCase() === "f" && !isTyping) {
      toggleFullscreen();
    }
  });
}

async function initialize() {
  try {
    const response = await fetch("data/coldflame.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
    state.catalog = await response.json();
    state.releases = new Map(state.catalog.releases.map((release) => [release.id, release]));

    const requestedTrackId = new URL(window.location.href).searchParams.get("track");
    const requestedIndex = state.catalog.tracks.findIndex((track) => track.id === requestedTrackId);
    state.currentIndex = requestedIndex >= 0 ? requestedIndex : 0;

    buildTrackList();
    bindEvents();
    bindMediaActions();
    setVolume(0.82);
    await selectTrack(state.currentIndex, { autoplay: false, updateHistory: requestedIndex >= 0 });

    document.documentElement.dataset.ready = "true";
  } catch (error) {
    console.error(error);
    setStatus("Archive catalog unavailable");
    document.documentElement.dataset.ready = "true";
    showToast("The catalog could not be loaded");
  }
}

initialize();
