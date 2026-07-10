import { initializeSocketConnection } from "./socket-connection";
import { initializeAuthentication } from "./auth_helper";
import {
  generateQRCode,
  showAdoptionOverlay,
  startAdoptionFlow,
} from "./adopt";
import { getAdoptionToken } from "./storage";
import { initDebugPanel } from "./debug-panel";
import { startSlideshow, stopSlideshow, armScheduleWatcher, jumpToContent } from "./content-display";
import { registerSlideshowCallbacks } from "./container-manager";

/**
 * Initialize the screen bundle.
 *
 * This runs common initialization, attempts to initialize the shared
 * Socket.IO connection, and performs lightweight startup logging.
 */
export function screenInit(): void {
  // Wire slideshow callbacks so container-manager can call content-display
  // without a circular static import.
  registerSlideshowCallbacks(startSlideshow, armScheduleWatcher);

  // Initialize debug panel first
  try {
    initDebugPanel();
  } catch (e) {
    console.warn("initDebugPanel failed:", e);
  }

  // Expose slideshow controls so debug-panel buttons can call them
  try {
    (window as any).debugPanel = (window as any).debugPanel || {};
    (window as any).debugPanel.jumpToContent = jumpToContent;
    (window as any).debugPanel.startSlideshow = startSlideshow;
    (window as any).debugPanel.stopSlideshow = stopSlideshow;
  } catch (e) { /* intentional */ }

  // Expose functions on window BEFORE calling initializeAuthentication
  if (typeof window !== "undefined") {
    (window as any).initializeSocketConnection =
      (window as any).initializeSocketConnection || initializeSocketConnection;
    (window as any).startAdoptionFlow = startAdoptionFlow;
  }

  // NOW initialize authentication - it can safely call window.initializeSocketConnection
  try {
    console.log("[Screen] Initializing authentication with adoption callbacks");
    initializeAuthentication({
      getAdoptionToken,
      generateQRCode,
      showAdoptionOverlay,
      startAdoptionFlow,
    });
  } catch (e) {
    console.warn("initializeAuthentication failed:", e);
  }

  // Note: Do NOT call initializeSocketConnection() here anymore
  // It will be called by initializeAuthentication() if devicekey exists
  // or after adoption completes

  // Placeholder screen logic
  console.log("ts/screen loaded");
}

