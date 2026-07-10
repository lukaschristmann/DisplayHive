/**
 * Content display and slideshow logic
 */

import type { ContentItem, Container } from "./types.js";
import {
  getContainer,
  getCurrentSlide,
  getSocketEmitter,
} from "./container-manager.js";
import { tickNow } from "./clock.js";
import { log } from "./logger.js";

/**
 * Returns true when a content item is within its scheduled window.
 * Items without start_time / end_time are always considered active.
 */
function isContentActive(item: ContentItem): boolean {
  const now = Date.now();
  if (item.start_time) {
    const start = new Date(item.start_time).getTime();
    if (!isNaN(start) && now < start) {
      log('debug', 'isContentActive', `id ${item.id} skipped — not yet started`);
      return false;
    }
  }
  if (item.end_time) {
    const end = new Date(item.end_time).getTime();
    if (!isNaN(end) && now >= end) {
      log('debug', 'isContentActive', `id ${item.id} skipped — already ended`);
      return false;
    }
  }
  return true;
}

/**
 * Display content in a container
 */
export function displayContentInContainer(
  containerName: string,
  contentId: number,
): void {
  const container = getContainer(containerName);
  if (!container) {
    log(
      "error",
      "displayContentInContainer",
      "Container not found: " + containerName,
    );
    return;
  }

  const html = container.htmlCache[contentId];
  if (!html) {
    log(
      "warn",
      "displayContentInContainer",
      "No HTML cached for ID " + contentId,
    );
    return;
  }

  log(
    "info",
    "displayContentInContainer",
    "Displaying content " + contentId + " in " + containerName,
  );

  // Find the container element by data-container attribute
  const containerElement = document.querySelector(
    `[data-container="${containerName}"]`,
  );
  if (!containerElement) {
    log(
      "error",
      "displayContentInContainer",
      "Container element not found: " + containerName,
    );
    return;
  }

  // Update the HTML content
  containerElement.innerHTML = html;
  tickNow(); // immediately fill any dh-clock elements in the new HTML

  // Inject contenttype CSS scoped to this container
  const cssStyleId = `content-type-css-${containerName}`;
  let cssEl = document.getElementById(cssStyleId) as HTMLStyleElement | null;
  if (!cssEl) {
    cssEl = document.createElement("style");
    cssEl.id = cssStyleId;
    document.head.appendChild(cssEl);
  }
  cssEl.textContent = container.cssCache[contentId] || "";

  // Update container state
  container.currentId = contentId;
  container.lastDisplayedId = contentId;
  container.startTime = Date.now();

  // Refresh debug panel playlist to highlight the new current item
  try {
    (window as any).debugPanel?.pushPlaylist?.(containerName, container.playlist, contentId, container.startTime, container.stopped);
  } catch (e) {}

  // If this item is flagged for a background refresh (e.g. random image),
  // ask the server to re-render it. The response patches htmlCache only,
  // so the next display cycle shows the fresh version without reloading the playlist.
  const playlistItem = container.playlist.find((item) => item.id === contentId);
  if (playlistItem?.update_after_show) {
    const emitter = getSocketEmitter();
    if (emitter) {
      emitter("displayhive:screen:cts:refresh_content", { id: contentId });
      log(
        "debug",
        "displayContentInContainer",
        `Requested refresh for id ${contentId}`,
      );
    }
  }

  // Log to console
  const slide = getCurrentSlide(containerName);
  if (slide) {
    log(
      "debug",
      "displayContentInContainer",
      `Displayed slide ${contentId} in ${containerName} (duration: ${slide.duration}s)`,
    );
  }
}

/**
 * Find the next active content ID after `currentId` by rotating through the
 * playlist. Returns `null` when no items are currently within their scheduled window.
 */
function findNextActiveId(playlist: ContentItem[], currentId: number | null): number | null {
  const total = playlist.length;
  const start = playlist.findIndex((item) => item.id === currentId);
  for (let offset = 1; offset <= total; offset++) {
    const candidate = playlist[(start + offset) % total];
    if (isContentActive(candidate)) return candidate.id;
  }
  return null;
}

/** Clear the running slideshow timer on a container, if any. */
function clearContainerTimer(container: Container): void {
  if (container.timer) {
    clearTimeout(container.timer);
    container.timer = null;
  }
}

/**
 * Immediately jump to a specific content item in a container and continue the
 * slideshow from there (resets the slide timer).
 */
export function jumpToContent(containerName: string, contentId: number): void {
  const container = getContainer(containerName);
  if (!container) return;
  clearContainerTimer(container);
  container.stopped = false;
  displayContentInContainer(containerName, contentId);
  scheduleAdvance(container, containerName);
}

/** Schedule the next `advanceSlide` call based on the current slide's duration. */
function scheduleAdvance(container: Container, containerName: string): void {
  const slide = getCurrentSlide(containerName);
  if (slide && slide.duration > 0) {
    container.timer = setTimeout(() => advanceSlide(containerName), slide.duration * 1000);
  }
}

/**
 * Advance to the next slide in a container.
 * Skips items that are outside their scheduled window. If all items are
 * inactive, retries after 60 s.
 */
export function advanceSlide(containerName: string): void {
  const container = getContainer(containerName);
  if (!container || container.playlist.length === 0) {
    log("warn", "advanceSlide", "No content to advance in " + containerName);
    return;
  }

  clearContainerTimer(container);

  const nextId = findNextActiveId(container.playlist, container.currentId);
  if (nextId === null) {
    log("warn", "advanceSlide", `All items in '${containerName}' are outside their scheduled window — retrying in 60 s`);
    container.timer = setTimeout(() => advanceSlide(containerName), 60_000);
    return;
  }

  // If the next slide is the same content that is already displayed (e.g. a
  // single-item playlist or a wrap-around to identical content), skip the
  // re-render to avoid an unnecessary flicker.
  if (nextId === container.currentId) {
    log("debug", "advanceSlide", `Next item (${nextId}) is already displayed in '${containerName}' — skipping re-render`);
    scheduleAdvance(container, containerName);
    return;
  }

  displayContentInContainer(containerName, nextId);
  scheduleAdvance(container, containerName);
}

/** Stop the slideshow for a container by clearing the advance timer. */
export function stopSlideshow(containerName: string): void {
  const container = getContainer(containerName);
  if (!container) return;
  clearContainerTimer(container);
  container.stopped = true;
  log('info', 'stopSlideshow', 'Stopped slideshow for ' + containerName);
  try {
    (window as any).debugPanel?.pushPlaylist?.(containerName, container.playlist, container.currentId, container.startTime, true);
  } catch (e) {}
}

/**
 * Start the slideshow for a container from the first currently-active item.
 * If all items are inactive, retries after 60 s.
 */
export function startSlideshow(containerName: string): void {
  const container = getContainer(containerName);
  if (!container || container.playlist.length === 0) {
    log("warn", "startSlideshow", "No content to show in " + containerName);
    return;
  }

  log("info", "startSlideshow", "Starting slideshow for " + containerName);
  clearContainerTimer(container);
  container.stopped = false;

  const firstItem = container.playlist.find(isContentActive);
  if (!firstItem) {
    log("warn", "startSlideshow", `All items in '${containerName}' are outside their scheduled window — retrying in 60 s`);
    container.timer = setTimeout(() => startSlideshow(containerName), 60_000);
    return;
  }

  // Record active set so the schedule watcher can detect changes.
  _lastActiveIds[containerName] = JSON.stringify(
    container.playlist.filter(isContentActive).map((i) => i.id).sort((a, b) => a - b)
  );

  displayContentInContainer(containerName, firstItem.id);
  scheduleAdvance(container, containerName);
}

// ---------------------------------------------------------------------------
// Schedule watcher
// ---------------------------------------------------------------------------
// Keeps a per-container timeout that fires at the next start_time / end_time
// boundary.  When it fires it compares the current active set against the
// previously known active set; if they differ it calls startSlideshow so the
// screen picks up newly active items or drops expired ones without waiting
// for a server push.

const _scheduleTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const _lastActiveIds: Record<string, string> = {}; // containerName → JSON-serialised sorted id list

/**
 * (Re-)arm the schedule watcher for a single container.
 * Called after rebuildContainerCache via registerSlideshowCallbacks in index.ts.
 */
export function armScheduleWatcher(containerName: string): void {
  console.log('[ContentDisplay] armScheduleWatcher', containerName);

  // Cancel any outstanding timer for this container.
  if (_scheduleTimers[containerName]) {
    clearTimeout(_scheduleTimers[containerName]);
    delete _scheduleTimers[containerName];
  }

  const container = getContainer(containerName);
  if (!container || container.playlist.length === 0) return;

  const now = Date.now();

  // Collect all future boundary timestamps from start_time / end_time fields.
  const boundaries: number[] = [];
  for (const item of container.playlist) {
    if (item.start_time) {
      const t = new Date(item.start_time).getTime();
      if (!isNaN(t) && t > now) boundaries.push(t);
    }
    if (item.end_time) {
      const t = new Date(item.end_time).getTime();
      if (!isNaN(t) && t > now) boundaries.push(t);
    }
  }

  if (boundaries.length === 0) return; // no scheduled items — nothing to watch

  const nextBoundary = Math.min(...boundaries);
  const delay = nextBoundary - now + 500; // +500 ms so we fire just after the boundary

  log('debug', 'armScheduleWatcher', `Next boundary for '${containerName}' in ${Math.round(delay / 1000)} s`);

  _scheduleTimers[containerName] = setTimeout(() => {
    console.log('[ContentDisplay] scheduleWatcher fired for', containerName);

    const c = getContainer(containerName);
    if (!c || c.playlist.length === 0) return;

    // Compute the current active id set.
    const activeIds = JSON.stringify(
      c.playlist.filter(isContentActive).map((i) => i.id).sort((a, b) => a - b)
    );

    if (activeIds !== _lastActiveIds[containerName]) {
      log('info', 'scheduleWatcher', `Active set changed for '${containerName}', restarting slideshow`);
      _lastActiveIds[containerName] = activeIds;
      startSlideshow(containerName);
    }

    // Re-arm for the next boundary.
    armScheduleWatcher(containerName);
  }, delay);
}
