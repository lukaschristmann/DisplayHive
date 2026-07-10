/**
 * Server-synchronised clock for screen devices.
 *
 * On first upd_content the server includes a server_time (UTC ISO string).
 * The player calls applyServerTime() to store the offset between server and
 * local clock.  Every second tickNow() updates all [data-dh-clock] elements
 * using the corrected time and the format string / timezone stored in their
 * data attributes.  Every 30 minutes the player emits get_server_time so the
 * server can push a fresh timestamp and the offset is recalculated.
 */

const RESYNC_MS = 30 * 60 * 1000;

let _offset = 0; // corrected_now = Date.now() + _offset
let _tickInterval: ReturnType<typeof setInterval> | null = null;
let _resyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _emit: ((event: string, payload?: unknown) => void) | null = null;

export function setClockEmitter(emitter: (event: string, payload?: unknown) => void): void {
  _emit = emitter;
}

export function applyServerTime(serverTimeIso: string): void {
  const ts = new Date(serverTimeIso).getTime();
  if (isNaN(ts)) return;
  _offset = ts - Date.now();
  _scheduleResync();
  tickNow();
}

function _scheduleResync(): void {
  if (_resyncTimeout) clearTimeout(_resyncTimeout);
  _resyncTimeout = setTimeout(() => {
    if (_emit) _emit('displayhive:screen:cts:get_server_time', {});
  }, RESYNC_MS);
}

function _now(): Date {
  return new Date(Date.now() + _offset);
}

export function getNow(): Date {
  return _now();
}

function _format(d: Date, fmt: string, timezone: string): string {
  try {
    const tz = timezone || 'UTC';
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'long',
    }).formatToParts(d);
    const p12 = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', hour12: true,
    }).formatToParts(d);
    const wdShort = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
    }).format(d);

    const get = (type: string) => p.find(x => x.type === type)?.value ?? '';
    const get12 = (type: string) => p12.find(x => x.type === type)?.value ?? '';

    const year   = get('year');
    const month  = get('month');
    const day    = get('day');
    const h24    = parseInt(get('hour'), 10) % 24;
    const minute = get('minute');
    const second = get('second');
    const wdFull = get('weekday');
    const h12raw = parseInt(get12('hour'), 10);
    const h12    = h12raw === 0 ? 12 : h12raw;
    const period = (get12('dayPeriod') || (h24 < 12 ? 'AM' : 'PM')).toUpperCase();

    return fmt.replace(/YYYY|YY|dddd|ddd|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|A|a/g, token => {
      switch (token) {
        case 'YYYY': return year;
        case 'YY':   return year.slice(-2);
        case 'dddd': return wdFull;
        case 'ddd':  return wdShort;
        case 'MM':   return month;
        case 'M':    return String(parseInt(month, 10));
        case 'DD':   return day;
        case 'D':    return String(parseInt(day, 10));
        case 'HH':   return String(h24).padStart(2, '0');
        case 'H':    return String(h24);
        case 'hh':   return String(h12).padStart(2, '0');
        case 'h':    return String(h12);
        case 'mm':   return minute;
        case 'm':    return String(parseInt(minute, 10));
        case 'ss':   return second;
        case 's':    return String(parseInt(second, 10));
        case 'A':    return period;
        case 'a':    return period.toLowerCase();
        default:     return token;
      }
    });
  } catch {
    return fmt;
  }
}

export function tickNow(): void {
  const now = _now();
  document.querySelectorAll<HTMLElement>('[data-dh-clock]').forEach(el => {
    const fmt = el.getAttribute('data-dh-clock') || 'HH:mm:ss';
    const tz  = el.getAttribute('data-dh-timezone') || 'UTC';
    el.textContent = _format(now, fmt, tz);
  });
}

export function startClockTicker(): void {
  if (_tickInterval) return;
  tickNow();
  _tickInterval = setInterval(tickNow, 1000);
}
