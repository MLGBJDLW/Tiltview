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
    // Auto-fit is on by default: without it, any non-zero rotation lets the
    // picture overflow the player and the user cannot see the whole frame.
    autoFit: true,
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
 * Scale factor that keeps a rotated `media` entirely visible inside `stage`.
 *
 * The reported bug
 * ----------------
 * Rotating a landscape picture 90° makes its bounding box portrait (978x550 →
 * 550x978). With no correction it no longer fits the player: measured on
 * Bilibili, `getBoundingClientRect()` reported `bottom: 932` against a player
 * bottom of `718`, i.e. 214px of the picture was outside the box and the user
 * saw a cropped fragment — "旋转之后的画面没有办法适配整个框…根本看不到全貌".
 *
 * What the factor must be
 * -----------------------
 * The whole picture has to remain visible, so this is a *contain* fit: the
 * tighter axis decides.
 *
 *     contain = min(stageW / rotatedW, stageH / rotatedH)
 *
 * For 978x550 rotated to 550x978 that is `min(1.778, 0.562)` = 0.562, which
 * brings the rotated box back to 309x550 — fully inside the player, letterboxed
 * on the sides, exactly like an unrotated letterboxed video.
 *
 * A *cover* fit (`max`) is deliberately NOT used: it would scale to 1.778 and
 * blow the picture up to 978x1739, worse than the bug it is meant to fix. It
 * was tried and measured; see the commit that introduced this note.
 *
 * `stage` and `media` must both be in the element's *untransformed* display
 * space (see `displayedMediaSize` and the offsetWidth note in the controller).
 * Mixing intrinsic pixels with a CSS box is the other way this overshoots.
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

  // Bounding box of the media after rotation.
  const rotatedWidth = swapsAxes(rotation) ? mh : mw;
  const rotatedHeight = swapsAxes(rotation) ? mw : mh;

  // Contain: the tighter axis decides, so nothing is pushed out of the player.
  const fit = Math.min(sw / rotatedWidth, sh / rotatedHeight);
  return Number.isFinite(fit) && fit > 0 ? fit : 1;
}

/**
 * The size a <video> actually paints inside its element box, i.e. what the
 * user sees before we transform anything.
 *
 * `object-fit: contain` (the default on every player we support) letterboxes
 * the intrinsic frame into the element box, so the visible picture is the
 * largest `intrinsic`-aspect rectangle that fits. Returning the element box
 * verbatim would be wrong for a non-matching aspect ratio; returning intrinsic
 * pixels would be wrong whenever the element is scaled (which is the bug
 * described above). This reconciles the two.
 */
export function displayedMediaSize(
  elementBox: StageSize | null | undefined,
  intrinsic: MediaSize | null | undefined,
): MediaSize | null {
  if (intrinsic && intrinsic.width > 0 && intrinsic.height > 0) {
    if (!elementBox || elementBox.width <= 0 || elementBox.height <= 0) {
      return { width: intrinsic.width, height: intrinsic.height };
    }
    const scale = Math.min(
      elementBox.width / intrinsic.width,
      elementBox.height / intrinsic.height,
    );
    return {
      width: intrinsic.width * scale,
      height: intrinsic.height * scale,
    };
  }
  if (elementBox && elementBox.width > 0 && elementBox.height > 0) {
    return { width: elementBox.width, height: elementBox.height };
  }
  return null;
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
