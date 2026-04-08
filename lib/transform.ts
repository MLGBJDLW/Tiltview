import type { TransformState } from './types';

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

export function isVerticalRotation(rotation: number): boolean {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270;
}

export function buildTransformCSS(
  state: TransformState,
  containerDims?: { width: number; height: number },
): string {
  const parts: string[] = [];

  if (state.translateX !== 0 || state.translateY !== 0) {
    parts.push(`translate(${state.translateX}px, ${state.translateY}px)`);
  }

  let effectiveScale = state.scale;
  if (state.autoFit && containerDims && isVerticalRotation(state.rotation)) {
    const fitScale = containerDims.height / containerDims.width;
    effectiveScale = state.scale * fitScale;
  }

  if (effectiveScale !== 1) {
    parts.push(`scale(${effectiveScale})`);
  }

  if (state.rotation !== 0) {
    parts.push(`rotate(${state.rotation}deg)`);
  }

  if (state.flipH || state.flipV) {
    const sx = state.flipH ? -1 : 1;
    const sy = state.flipV ? -1 : 1;
    parts.push(`scale(${sx}, ${sy})`);
  }

  return parts.join(' ');
}

const savedOverflows = new WeakMap<HTMLElement, Map<HTMLElement, string>>();

export function applyTransform(
  element: HTMLElement,
  state: TransformState,
  containerDims?: { width: number; height: number },
): void {
  element.style.transform = buildTransformCSS(state, containerDims);
  element.style.transformOrigin = 'center center';

  // Set overflow on immediate parent based on autoFit
  const parent = element.parentElement;
  if (parent) {
    const savedMap = new Map<HTMLElement, string>();
    if (state.autoFit && isVerticalRotation(state.rotation)) {
      savedMap.set(parent, parent.style.overflow);
      parent.style.overflow = 'hidden';
    } else {
      // For non-autoFit, walk ancestors and set overflow visible so rotated content shows
      let ancestor: HTMLElement | null = parent;
      let depth = 0;
      while (ancestor && depth < 5) {
        const computed = getComputedStyle(ancestor);
        if (computed.overflow !== 'visible') {
          savedMap.set(ancestor, ancestor.style.overflow);
          ancestor.style.overflow = 'visible';
        }
        ancestor = ancestor.parentElement;
        depth++;
      }
    }
    savedOverflows.set(element, savedMap);
  }
}

export function resetTransform(element: HTMLElement): void {
  element.style.transform = '';
  element.style.transformOrigin = '';

  const overflowMap = savedOverflows.get(element);
  if (overflowMap) {
    for (const [el, original] of overflowMap) {
      el.style.overflow = original;
    }
    savedOverflows.delete(element);
  }
}
