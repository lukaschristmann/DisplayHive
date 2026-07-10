/**
 * Shared Socket.IO connection logic.
 */

import { setupSocketHandlers } from "./socket-handlers";
import { log } from "./logger";
import { getDeviceKey, getAdoptionToken } from "./storage";
import type { Auth } from "./types";

/** Minimal subset of the Socket-like object used by the app. */
export interface SocketLike {
  /** Disconnect the socket. */
  disconnect?: () => void;
  /** Register an event handler. */
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  /** Emit an event to the server. */
  emit?: (event: string, ...args: unknown[]) => void;
  [key: string]: unknown;
}

/** Options passed to the socket/io initializer. */
export interface SocketOptions {
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
  query?: Record<string, string>;
  auth?: Record<string, string>;
  transportOptions?: {
    polling?: {
      extraHeaders?: Record<string, string>;
    };
  };
  [key: string]: unknown;
}

/** Extension to the global window object used by this module. */
export interface WindowWithSocket extends Window {
  io?: (opts?: SocketOptions) => SocketLike;
  socket?: SocketLike | null;
  auth?: Auth;
  deviceKey?: string | null;
}

/**
 * Resolve the connection keys from window globals and localStorage.
 * Returns the first deviceKey found and (if no deviceKey) an adoptionKey.
 */
function resolveConnectionKeys(wnd: WindowWithSocket): {
  deviceKey: string | null;
  adoptionKey: string | null;
} {
  let deviceKey: string | null = null;
  if (typeof wnd.deviceKey !== "undefined")
    deviceKey = String(wnd.deviceKey || "") || null;
  if (!deviceKey && typeof (wnd as any).devicekey !== "undefined")
    deviceKey = String((wnd as any).devicekey || "") || null;
  if (!deviceKey) deviceKey = getDeviceKey();

  let adoptionKey: string | null = null;
  if (!deviceKey) {
    if (typeof (wnd as any).adoptionToken !== "undefined")
      adoptionKey = String((wnd as any).adoptionToken || "") || null;
    if (!adoptionKey) adoptionKey = getAdoptionToken();
  }

  return { deviceKey, adoptionKey };
}

/**
 * Detect whether this session is a transient URL-param impersonation.
 */
function detectImpersonation(wnd: WindowWithSocket): boolean {
  try {
    return !!(
      (wnd as any).__impersonate === true ||
      String((wnd as any).__impersonate) === "true"
    );
  } catch {
    return false;
  }
}

/**
 * Build Socket.IO connection options for the given key type.
 * Returns null when no key is available (caller should abort).
 */
function buildSocketOptions(
  deviceKey: string | null,
  adoptionKey: string | null,
  isImpersonation: boolean,
): SocketOptions | null {
  const base: SocketOptions = {
    reconnection: false,
    timeout: 20000,
  };

  if (deviceKey) {
    base.query = { devicekey: deviceKey };
    base.auth = { devicekey: deviceKey };
    base.transportOptions = {
      polling: { extraHeaders: { devicekey: deviceKey } },
    };
    if (isImpersonation) {
      (base.query as any).impersonate = "true";
      (base.auth as any).impersonate = "true";
      (base.transportOptions!.polling!.extraHeaders as any).impersonate = "true";
    }
    // Merge any URL query params so the server sees them in request.args
    try {
      const search = window.location.search || "";
      if (search.length > 1) {
        const usp = new URLSearchParams(search);
        const q = base.query as Record<string, string>;
        usp.forEach((value, key) => {
          if (typeof q[key] === "undefined") q[key] = value;
        });
      }
    } catch {
      /* ignore URL parsing errors */
    }
    return base;
  }

  if (adoptionKey) {
    base.query = { adoptionkey: adoptionKey };
    base.auth = { adoptionkey: adoptionKey };
    base.transportOptions = {
      polling: { extraHeaders: { adoptionkey: adoptionKey } },
    };
    return base;
  }

  return null;
}

/**
 * Initialize Socket.IO connection with authentication and shared handlers.
 */
export function initializeSocketConnection(): void {
  log("debug", "initializeSocketConnection", "called");

  const wnd = window as unknown as WindowWithSocket;

  const { deviceKey, adoptionKey } = resolveConnectionKeys(wnd);
  const isImpersonation = detectImpersonation(wnd);

  if (isImpersonation) {
    log("info", "initializeSocketConnection", "Impersonation detected; client will include impersonate flag in handshake");
  }

  const socketOptionsOrNull = buildSocketOptions(deviceKey, adoptionKey, isImpersonation);

  if (!socketOptionsOrNull) {
    console.error(
      "[socket-connection] Cannot initialize socket: no deviceKey or adoptionKey found",
    );
    log(
      "error",
      "initializeSocketConnection",
      "Socket initialization blocked: no keys available",
      { hasDeviceKey: false, hasAdoptionKey: false },
    );
    return;
  }

  const socketOptions: SocketOptions = socketOptionsOrNull;

  // Log a masked key preview before connecting
  if (deviceKey) {
    const masked = deviceKey.length > 4 ? `***${deviceKey.slice(-4)}` : "***";
    log("debug", "initializeSocketConnection", "Attaching deviceKey to connection options", {
      hasDeviceKey: true,
      maskedDeviceKey: masked,
    });
  } else if (adoptionKey) {
    const masked = adoptionKey.length > 4 ? `***${adoptionKey.slice(-4)}` : "***";
    log("debug", "initializeSocketConnection", "Attaching adoptionKey to connection options", {
      hasAdoptionKey: true,
      maskedAdoptionKey: masked,
    });
  }

  if (wnd.socket && typeof wnd.socket.disconnect === "function") {
    try {
      log(
        "debug",
        "initializeSocketConnection",
        "Cleaning up existing disconnected socket",
      );
      wnd.socket.disconnect();
    } catch (err) {
      log(
        "warn",
        "initializeSocketConnection",
        "Error while disconnecting previous socket",
        err,
      );
    }
    wnd.socket = null;
  }

  // Create the socket immediately if `io` is available. Otherwise attempt
  // to load the Socket.IO client script dynamically and create the socket
  // once it becomes available. This avoids the "Socket.IO not available"
  // error on pages that don't include the `<script src="...socket.io...">`
  // tag.
  function createSocketAndSetup() {
    const created: SocketLike | null = wnd.io ? wnd.io(socketOptions) : null;
    if (!created) {
      log(
        "error",
        "initializeSocketConnection",
        "Socket.IO not available after loading client",
      );
      return;
    }
    wnd.socket = created;
    log(
      "info",
      "initializeSocketConnection",
      "Socket created, setting up handlers",
    );
    setupSocketHandlers(created);

    // Global debug hook: log every incoming socket event and dispatch DOM events
    try {
      const s: any = created as any;
      if (s && typeof s.onAny === "function") {
        s.onAny((event: string, ...args: any[]) => {
          try {
            window.dispatchEvent(
              new CustomEvent("socket:any", { detail: { event, args } }),
            );
            try {
              window.dispatchEvent(
                new CustomEvent(`socket:${event}`, { detail: args }),
              );
            } catch (e) {}
          } catch (e) {
            // ignore
          }
        });
      } else if (s) {
        // Fallback for older socket.io clients: monkey-patch `onevent`
        if (!s.__patched_onevent) {
          const originalOnevent = s.onevent;
          s.onevent = function (packet: any) {
            try {
              originalOnevent && originalOnevent.call(this, packet);
            } catch (e) {}
            try {
              const args = packet && packet.data ? packet.data : [];
              const evName = args && args.length ? args[0] : "(unknown)";
              const evArgs = args && args.length ? args.slice(1) : [];
              window.dispatchEvent(
                new CustomEvent("socket:any", {
                  detail: { event: evName, args: evArgs },
                }),
              );
              try {
                window.dispatchEvent(
                  new CustomEvent(`socket:${evName}`, { detail: evArgs }),
                );
              } catch (e) {}
            } catch (e) {}
          };
          s.__patched_onevent = true;
        }
      }
    } catch (e) {
      // Ensure instrumentation never prevents normal socket setup
      log(
        "warn",
        "initializeSocketConnection",
        "Failed to attach global socket debug hook",
        e as Error,
      );
    }
  }

  if (wnd.io) {
    // io is already available; create socket synchronously
    createSocketAndSetup();
    return;
  }

  // The Socket.IO client is expected to already be loaded via the pinned,
  // integrity-checked <script> tag in templates/index.html. There is no
  // CDN fallback here — loading an unpinned copy at runtime would be an
  // unverified script-injection vector.
  log(
    "error",
    "initializeSocketConnection",
    "Socket.IO client (window.io) is not available; check that the script tag in index.html loaded successfully",
  );
}
