/**
 * Type definitions for the screen client
 */

export interface ContentItem {
  id: number;
  title?: string;
  duration: number;
  /** When true, the client should request a fresh re-render after showing this item. */
  update_after_show?: boolean;
  /** ISO 8601 datetime string — item must not be shown before this time. */
  start_time?: string;
  /** ISO 8601 datetime string — item must not be shown after this time. */
  end_time?: string;
}

export interface Container {
  currentId: number | null;
  playlist: ContentItem[];
  htmlCache: Record<number, string>;
  cssCache: Record<number, string>;
  pendingPlaylist: ContentItem[];
  timer: ReturnType<typeof setTimeout> | null;
  lastDisplayedId: number | null;
  startTime: number | null;
  stopped?: boolean;
}

/**
 * Generic socket command payload sent from server to screen clients.
 *
 * Required fields:
 * - `CMD`: short command name (e.g. "RELOAD").
 *
 * Additional command-specific fields may be present and are typed as unknown
 * so callers must validate/parse before use.
 */
export interface SocketCommand {
  CMD: string;
  [key: string]: unknown;
}

/** Device configuration pushed from server to a device client */
export interface DeviceConfig {
  // `devicekey` is sent by the server; keep `key` for compatibility if present.
  devicekey?: string | null;
  key?: string | null;
  name: string | null;
  screenname: string | null;
  devicedebugstate: "yes" | "no";
  glow: "yes" | "no";
}

export interface UpdDeviceConfigMessage {
  deviceconfig: DeviceConfig;
}

export type LogSeverity = "debug" | "info" | "warn" | "error";

export interface Auth {
  generateQRCode(text: string): void;
  showAdoptionOverlay(): void;
  hideAdoptionOverlay(): void;
  startAdoptionFlow(): void;
  initializeAuthentication(): void;
  getDeviceKey(): string | null;
}

