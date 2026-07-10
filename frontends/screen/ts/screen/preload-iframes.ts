/**
 * Iframe preloader: when content HTML containing <iframe src="..."> elements
 * is added to the playlist cache, create hidden iframes for those URLs so the
 * browser fetches and caches the content before the slide is displayed.
 */

const _preloadedSrcs = new Set<string>();
let _preloadContainer: HTMLDivElement | null = null;

function getPreloadContainer(): HTMLDivElement {
  if (!_preloadContainer) {
    const div = document.createElement("div");
    div.id = "dh-iframe-preloader";
    div.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;";
    document.body.appendChild(div);
    _preloadContainer = div;
  }
  return _preloadContainer;
}

function extractIframeSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<iframe[^>]+\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1].trim();
    if (src) srcs.push(src);
  }
  return srcs;
}

/**
 * Scan `html` for <iframe src="..."> tags and create a hidden preload iframe
 * for each unique src that has not been preloaded yet.
 */
export function preloadIframesInHtml(html: string): void {
  if (!html) return;
  const srcs = extractIframeSrcs(html);
  for (const src of srcs) {
    if (_preloadedSrcs.has(src)) continue;
    _preloadedSrcs.add(src);
    try {
      const container = getPreloadContainer();
      const iframe = document.createElement("iframe");
      iframe.src = src;
      container.appendChild(iframe);
    } catch {
      // Ignore — worst case the iframe loads cold when the slide is shown
    }
  }
}
