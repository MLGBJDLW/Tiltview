/**
 * Pure transform math for Tiltview.
 *
 * Everything here is DOM-free so it can be unit tested in Node.
 *
 * Geometry model
 * --------------
 * The video is drawn inside a "stage" (the player container). A transform is
 * a similarity matrix in stage coordinates:
 *
 *     M = T(tx, ty) · R(θ) · S(sx, sy)
 *
 * where `sx = scale * (flipH ? -1 : 1)` and `sy = scale * (flipV ? -1 : 1)`.
 *
 * Order matters and is the reason v0.1.0 felt broken: translation must be
 * applied *after* rotation so that panning always moves the picture in the
 * direction the user drags on screen, independent of rotation. CSS
 * `transform` lists are applied right-to-left, so the equivalent CSS string is
 * `translate(...) rotate(...) scale(...)`.
 */

export interface TransformState {
  /** Rotation in degrees, clockwise, normalized to [0, 360). */
  rotation: number;
  /** Uniform zoom factor. */
  scale: number;
  /** Horizontal pan in stage pixels (screen space, not rotated). */
  translateX: number;
  /** Vertical pan in stage pixels (screen space, not rotated). */
  translateY: number;
  /** Mirror horizontally. */
  flipH: boolean;
  /** Mirror vertically. */
  flipV: boolean;
  /** Scale up so the rotated video fills the stage. */
  autoFit: boolean;
}

export interface StageSize {
  width: number;
  height: number;
}

export interface MediaSize {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;

const ROTATION_STEP = 90;

export function getDefaultState(): TransformState {
  return {
    rotation: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    flipH: false,
    flipV: false,
    autoFit: false,
  };
}

/** Normalize any angle into [0, 360). */
export function normalizeAngle(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  const normalized = ((rotation % 360) + 360) % 360;
  // Avoid returning 360 for tiny negative values.
  return normalized >= 360 ? 0 : normalized;
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** True when the rotation swaps width and height (90°, 270°, ...). */
export function swapsAxes(rotation: number): boolean {
  const normalized = normalizeAngle(rotation);
  return Math.abs(Math.sin((normalized * Math.PI) / 180)) > 1e-9;
}

/**
 * Scale factor that makes a rotated `media` completely contain `stage`
 * ("cover"), so no letterbox or pillarbox bars remain inside the player.
 *
 * Returns 1 when the geometry is unknown or already fills the stage.
 */
export function computeAutoFitScale(
  stage: StageSize | null | undefined,
  media: MediaSize | null | undefined,
  rotation: number,
): number {
  if (!stage || !media) return 1;
  const { width: sw, height: sh } = stage;
  const { width: mw, height: mh } = media;
  if (sw <= 0 || sh <= 0 || mw <= 0 || mh <= 0) return 1;

  // Size of the media bounding box after rotation.
  const rotatedWidth = swapsAxes(rotation) ? mh : mw;
  const rotatedHeight = swapsAxes(rotation) ? mw : mh;

  // "Cover": the smaller of the two axes dominates.
  const fit = Math.max(sw / rotatedWidth, sh / rotatedHeight);
  return Number.isFinite(fit) && fit > 0 ? fit : 1;
}

/** Total scale applied to the element, including auto-fit. */
export function effectiveScale(
  state: TransformState,
  stage?: StageSize | null,
  media?: MediaSize | null,
): number {
  const base = clampScale(state.scale);
  if (!state.autoFit) return base;
  return base * computeAutoFitScale(stage, media, state.rotation);
}

/**
 * Build the CSS `transform` value.
 *
 * `matrix3d` is emitted so that every engine applies exactly the same matrix
 * regardless of how it orders individual functions, and so that the hit area
 * (painted box) matches what the user sees.
 */
export function buildTransformCSS(
  state: TransformState,
  stage?: StageSize | null,
  media?: MediaSize | null,
): string {
  const scale = effectiveScale(state, stage, media);
  const sx = state.flipH ? -scale : scale;
  const sy = state.flipV ? -scale : scale;
  const angle = (normalizeAngle(state.rotation) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Rotation·Scale composed into a 2x2, then translation appended.
  // matrix3d() takes column-major order.
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const tx = state.translateX;
  const ty = state.translateY;

  return `matrix3d(${round(a)}, ${round(b)}, 0, 0, ${round(c)}, ${round(
    d,
  )}, 0, 0, 0, 0, 1, 0, ${round(tx)}, ${round(ty)}, 0, 1)`;
}

/** Round to 5 decimals to keep generated CSS short and stable. */
function round(value: number): number {
  const rounded = Math.round(value * 1e5) / 1e5;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function statesEqual(a: TransformState, b: TransformState): boolean {
  return (
    a.rotation === b.rotation &&
    a.scale === b.scale &&
    a.translateX === b.translateX &&
    a.translateY === b.translateY &&
    a.flipH === b.flipH &&
    a.flipV === b.flipV &&
    a.autoFit === b.autoFit
  );
}

export function isDefaultState(state: TransformState): boolean {
  return statesEqual(state, getDefaultState());
}

// ---------------------------------------------------------------------------
// Reducers used by every UI surface (popup, floating panel, keyboard, gestures)
// so behaviour can never drift between them.
// ---------------------------------------------------------------------------

export function rotateBy(state: TransformState, delta: number): TransformState {
  return { ...state, rotation: normalizeAngle(state.rotation + delta) };
}

export function rotateTo(state: TransformState, degrees: number): TransformState {
  return { ...state, rotation: normalizeAngle(degrees) };
}

export function zoomBy(
  state: TransformState,
  factor: number,
  anchor?: { x: number; y: number },
): TransformState {
  const nextScale = clampScale(state.scale * factor);
  const ratio = nextScale / (state.scale || 1);

  if (!anchor || ratio === 1) {
    return { ...state, scale: nextScale };
  }

  // Keep the point under the cursor fixed: scale the pan offset by the same
  // ratio, measured from the anchor.
  return {
    ...state,
    scale: nextScale,
    translateX: anchor.x - (anchor.x - state.translateX) * ratio,
    translateY: anchor.y - (anchor.y - state.translateY) * ratio,
  };
}

export function panBy(
  state: TransformState,
  dx: number,
  dy: number,
): TransformState {
  return {
    ...state,
    translateX: state.translateX + dx,
    translateY: state.translateY + dy,
  };
}

export function resetPan(state: TransformState): TransformState {
  return { ...state, translateX: 0, translateY: 0 };
}

export function toggleAutoFit(state: TransformState): TransformState {
  return { ...state, autoFit: !state.autoFit };
}

/** Reset rotation, zoom and pan but keep the user's mirror preference. */
export function resetView(state: TransformState): TransformState {
  return {
    ...getDefaultState(),
    flipH: state.flipH,
    flipV: state.flipV,
  };
}
