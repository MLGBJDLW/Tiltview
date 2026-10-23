// Tiltview brand mark: a screen tilted 12 degrees with an upright portrait
// video inside it (rotate a vertical video on a landscape player).
// Keep geometry identical to public/icon/logo.svg so the popup header and the
// toolbar icon read as the same object.
export function TiltLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="tilt-backplate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2333" />
          <stop offset="1" stopColor="#0a1018" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#tilt-backplate)" />
      <g transform="translate(64 64) rotate(-12)">
        <rect
          x="-37"
          y="-27"
          width="74"
          height="54"
          rx="10"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="6.5"
        />
        <g transform="rotate(12)">
          <rect x="-9" y="-15" width="18" height="30" rx="4.5" fill="#f8fafc" />
        </g>
      </g>
    </svg>
  );
}
