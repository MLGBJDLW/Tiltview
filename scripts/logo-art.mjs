/**
 * Tiltview artwork.
 *
 * One geometry definition feeds both outputs, so the SVG (the source of truth,
 * `public/icon/logo.svg`) and the PNG rasteriser cannot drift apart.
 *
 * The mark is a landscape video frame tilted 12° with an upright portrait frame
 * inside it: a vertical video being straightened inside a horizontal player.
 * Drawn on a 128×128 grid for every output size.
 *
 * Loaded as a classic script by `scripts/render-icons.mjs`, which is why this
 * file assigns to `window` instead of exporting: the drawing has to happen in a
 * real browser, because that is where the rasteriser runs.
 */
(() => {
  // Radius matches Chrome's own toolbar tile.
  const BACKPLATE_RADIUS = 28;
  const GRADIENT = { from: '#1b2333', to: '#0a1018' };
  const ACCENT = '#38bdf8';
  const ACCENT_DEEP = '#0ea5e9';
  const PAPER = '#f8fafc';

  // Large sizes: the real proportions, thin stroke, inset screen tint.
  const SCREEN = { cx: 64, cy: 64, w: 74, h: 54, r: 10, angle: -12 };
  const PORTRAIT = { cx: 64, cy: 64, w: 18, h: 30, r: 4.5 };

  // 16px/32px: at 16px the real proportions shrink to a ~9px frame whose 6.5-unit
  // stroke leaves a ~5px cut-out, and the upright frame inside collapses into a
  // blob (measured on the first render). Small sizes therefore use a wider,
  // flatter frame and a larger portrait so the two nested shapes keep a visible
  // gap on a Chrome toolbar tile that has roughly 12 usable pixels.
  const SCREEN_SMALL = { cx: 64, cy: 64, w: 88, h: 62, r: 12, angle: -12 };
  const PORTRAIT_SMALL = { cx: 64, cy: 64, w: 22, h: 34, r: 6 };

  const strokeFor = (size) => (isSmall(size) ? 10 : 6.5);
  const isSmall = (size) => size <= 32;
  const screenFor = (size) => (isSmall(size) ? SCREEN_SMALL : SCREEN);
  const portraitFor = (size) => (isSmall(size) ? PORTRAIT_SMALL : PORTRAIT);

  /** Screen tint is dropped below 48px, where it would only muddy the portrait. */
  const wantsDetail = (size) => size >= 48;

  const roundRectPath = (w, h, r) => {
    const x = -w / 2;
    const y = -h / 2;
    return [
      `M ${x + r} ${y}`,
      `H ${x + w - r}`, `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
      `V ${y + h - r}`, `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
      `H ${x + r}`, `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
      `V ${y + r}`, `A ${r} ${r} 0 0 1 ${x + r} ${y}`, 'Z',
    ].join(' ');
  };

  const gradientDefs = (id) => `<defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRADIENT.from}"/>
      <stop offset="1" stop-color="${GRADIENT.to}"/>
    </linearGradient>
  </defs>`;

  function markSvg(size = 128) {
    const s = screenFor(size);
    const p = portraitFor(size);
    return `
    <rect x="0" y="0" width="128" height="128" rx="${BACKPLATE_RADIUS}" fill="url(#backplate)"/>
    <g transform="translate(${s.cx} ${s.cy}) rotate(${s.angle})">
      <path d="${roundRectPath(s.w, s.h, s.r)}" fill="none" stroke="${ACCENT}" stroke-width="${strokeFor(size)}" stroke-linejoin="round"/>
      <g transform="rotate(${-s.angle})">
        <rect x="${-p.w / 2}" y="${-p.h / 2}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="${PAPER}"/>
        ${wantsDetail(size) ? `<rect x="${-p.w / 2 + 3.2}" y="${-p.h / 2 + 3.2}" width="${p.w - 6.4}" height="${p.h - 6.4}" rx="${p.r - 1.6}" fill="${ACCENT_DEEP}" opacity="0.55"/>` : ''}
      </g>
    </g>`;
  }

  /** `public/icon/logo.svg`. */
  function fullSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
${gradientDefs('backplate')}
${markSvg(128)}
</svg>
`;
  }

  /**
   * Draws one raster size into a canvas. Web sizes come from Chrome's icon spec:
   * 16 toolbar, 32 Windows taskbar, 48 extensions page, 128 store listing.
   */
  function markCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    g.scale(size / 128, size / 128);
    if (size >= 94) g.imageSmoothingQuality = 'high';

    const s = screenFor(size);
    const p = portraitFor(size);

    const backplate = g.createLinearGradient(0, 0, 128, 128);
    backplate.addColorStop(0, GRADIENT.from);
    backplate.addColorStop(1, GRADIENT.to);
    g.fillStyle = backplate;
    g.beginPath();
    g.roundRect(0, 0, 128, 128, BACKPLATE_RADIUS);
    g.fill();

    g.save();
    g.translate(s.cx, s.cy);
    g.rotate((s.angle * Math.PI) / 180);
    g.strokeStyle = ACCENT;
    g.lineWidth = strokeFor(size);
    g.lineJoin = 'round';
    g.beginPath();
    g.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.r);
    g.stroke();

    g.rotate((-s.angle * Math.PI) / 180);
    g.fillStyle = PAPER;
    g.beginPath();
    g.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, p.r);
    g.fill();
    if (wantsDetail(size)) {
      g.fillStyle = 'rgba(14,165,233,0.55)';
      g.beginPath();
      g.roundRect(-p.w / 2 + 3.2, -p.h / 2 + 3.2, p.w - 6.4, p.h - 6.4, p.r - 1.6);
      g.fill();
    }
    g.restore();
    return canvas;
  }

  /** Same mark as inline SVG, for the review sheet's vector-vs-raster row. */
  function svgForSize(size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
${gradientDefs('backplate')}${markSvg(size)}</svg>`;
  }

  window.logoArt = { fullSvg, markCanvas, svgForSize };
})();
