import type { Auth, DeviceConfig } from "./types";

declare const __GIT_COMMIT__: string;

declare global {
  interface Window {
    auth?: Auth;
    socket?: SocketIOClient.Socket | any;
    initializeSocketConnection?: () => void;
    initializeAuthentication?: () => void;
    deviceKey?: string | null;
    adoptionToken?: string | null;
    assignedScreen?: string;
    io?: any;
    _lastDeviceConfig?: DeviceConfig | null;
    __impersonate?: boolean;
    __displayhive_ping_interval?: ReturnType<typeof setInterval> | null;
    debugPanel?: {
      push: (
        section: string,
        group: string,
        key: string,
        value: string,
      ) => void;
      markUpdContent?: () => void;
    };
  }

  // QRCode.js global (loaded via CDN in templates)
  declare const QRCode: {
    CorrectLevel: {
      L: number;
      M: number;
      Q: number;
      H: number;
    };
    new (el: HTMLElement | null, opts: any): any;
  };
}

export {};
