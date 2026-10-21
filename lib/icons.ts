/**
 * SVG icons built with DOM APIs instead of `innerHTML`.
 *
 * Why this exists:
 *   YouTube enforces a Trusted Types CSP policy. Assigning a plain string to
 *   `element.innerHTML` throws:
 *
 *     TypeError: Failed to set the 'innerHTML' property on 'Element':
 *     This document requires 'TrustedHTML' assignment.
 *
 *   Both UI surfaces used to inject their icon markup with `innerHTML` while
 *   constructing, so on YouTube the content script crashed during
 *   initialisation — before the floating panel or the control-bar button were
 *   ever attached. That is why the in-player button appeared to do nothing at
 *   all and why no panel could be opened.
 *
 *   `document.createElementNS` with SVG's namespace is a plain DOM mutation and
 *   is unaffected by Trusted Types, so it works under the strictest policy.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an SVG path element from its `d` attribute. */
function path(d: string): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  return el;
}

function rect(x: number, y: number, width: number, height: number, radius: number): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  if (radius > 0) el.setAttribute('rx', String(radius));
  return el;
}

/**
 * The Tiltview mark: an arrow pointing out of a tilted frame.
 * Shared by the floating panel tab and the control-bar button so the two stay
 * visually identical.
 */
export function createTiltviewIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.append(
    path('M14.5 6.5h4v4'),
    path('M18.5 6.5 14 11'),
    path('M12.5 9.5H5.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4'),
  );
  return svg;
}

/** Unused elsewhere today, kept tiny and explicit for future icons. */
export function createRectIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.appendChild(rect(3.5, 9.5, 9, 9, 2));
  return svg;
}
