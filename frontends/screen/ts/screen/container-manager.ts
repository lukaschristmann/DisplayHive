/**
 * Container management - handles content containers and their state
 */

import type { Container, ContentItem } from "./types.js";
import { log } from "./logger.js";

// Module-level state: each container has its own cache, timer, and content list.
const containers: Record<string, Container> = {};

// Optional emitter injected by socket setup so this module does not
// directly depend on `window.socket`. Call `setSocketEmitter` with
// a function `(event, payload) => void` (for example `socket.emit`).
let socketEmitter: ((event: string, payload?: any) => void) | null = null;

// Slideshow callbacks registered by index.ts to avoid a circular import
// between container-manager ↔ content-display.
let _startSlideshow: ((containerName: string) => void) | null = null;
let _armScheduleWatcher: ((containerName: string) => void) | null = null;

/**
 * Register the slideshow entry points from content-display.ts.
 * Must be called from the bundle entry (index.ts) after both modules are loaded.
 */
export function registerSlideshowCallbacks(
  startFn: (containerName: string) => void,
  armFn?: (containerName: string) => void,
): void {
  _startSlideshow = startFn;
  _armScheduleWatcher = armFn || null;
}

export function setSocketEmitter(
  emitter: (event: string, payload?: any) => void,
): void {
  socketEmitter = emitter;
}

export function getSocketEmitter():
  | ((event: string, payload?: any) => void)
  | null {
  return socketEmitter;
}
export function getContainers(): Record<string, Container> {
  return containers;
}

export function getContainer(containerName: string): Container | undefined {
  return containers[containerName];
}

/**
 * Initialize a container
 */
export function initContainer(containerName: string): void {
  if (!containers[containerName]) {
    containers[containerName] = {
      currentId: null,
      playlist: [],
      htmlCache: {},
      cssCache: {},
      pendingPlaylist: [],
      timer: null,
      lastDisplayedId: null,
      startTime: null,
    };
    log("info", "initContainer", "Initialized container: " + containerName);
  }
}

/**
 * Get current slide by ID for a container
 */
export function getCurrentSlide(containerName: string): ContentItem | null {
  const container = containers[containerName];
  if (!container || !container.currentId || container.playlist.length === 0)
    return null;
  return (
    container.playlist.find((item) => item.id === container.currentId) || null
  );
}


/**
 * Rebuild container cache from content list and HTML cache
 */
export function rebuildContainerCache(containerName: string): void {
  const container = containers[containerName];
  if (
    !container ||
    !container.pendingPlaylist ||
    container.pendingPlaylist.length === 0
  ) {
    if (container) {
      container.playlist = [];
      container.currentId = null;
      // Clear any existing timer
      if (container.timer) {
        clearTimeout(container.timer);
        container.timer = null;
      }
      // Clear the DOM so deactivated content stops showing
      try {
        const el = document.querySelector(
          `[data-container="${containerName}"]`,
        );
        if (el) (el as HTMLElement).innerHTML = "";
      } catch (e) {}
    }
    return;
  }

  // Build content list only if all HTML is available
  let allHtmlAvailable = true;
  for (let i = 0; i < container.pendingPlaylist.length; i++) {
    const item = container.pendingPlaylist[i];
    if (!container.htmlCache[item.id]) {
      allHtmlAvailable = false;
      log(
        "debug",
        "rebuildContainerCache",
        "Still missing HTML for ID " + item.id + " in " + containerName,
      );
      break;
    }
  }

  if (!allHtmlAvailable) {
    log(
      "debug",
      "rebuildContainerCache",
      "Not all HTML available yet for " + containerName + ", skipping rebuild",
    );
    return;
  }

  log(
    "info",
    "rebuildContainerCache",
    "All HTML available for " + containerName + ", rebuilding content list",
  );

  container.playlist = container.pendingPlaylist.map((item) => ({
    id: item.id,
    title: item.title,
    duration: item.duration,
    update_after_show: item.update_after_show,
    start_time: item.start_time,
    end_time: item.end_time,
  }));

  // Push playlist to debug panel (no current item yet — will be set on first display)
  try {
    (window as any).debugPanel?.pushPlaylist?.(containerName, container.playlist, container.currentId);
  } catch (e) {}

  log(
    "info",
    "rebuildContainerCache",
    "Container " +
      containerName +
      " now has " +
      container.playlist.length +
      " items",
  );

  // Start slideshow if we have content
  if (container.playlist.length > 0) {
    if (typeof _startSlideshow === "function") {
      try {
        _startSlideshow(containerName);
      } catch (e) {
        log(
          "error",
          "rebuildContainerCache",
          "startSlideshow threw an error:",
          String(e),
        );
      }
    } else {
      log(
        "warn",
        "rebuildContainerCache",
        "startSlideshow not registered; call registerSlideshowCallbacks() from the entry module",
      );
    }
    if (typeof _armScheduleWatcher === "function") {
      try {
        _armScheduleWatcher(containerName);
      } catch (e) {
        log("error", "rebuildContainerCache", "armScheduleWatcher threw:", String(e));
      }
    }
  }
}
