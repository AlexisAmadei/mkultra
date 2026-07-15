import type { Transform, Vec2 } from "../types";

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Screen point (relative to the viewport element) -> world coordinate. */
export function screenToWorld(p: Vec2, t: Transform): Vec2 {
  return { x: (p.x - t.tx) / t.scale, y: (p.y - t.ty) / t.scale };
}

/** World coordinate -> screen point (relative to the viewport element). */
export function worldToScreen(w: Vec2, t: Transform): Vec2 {
  return { x: w.x * t.scale + t.tx, y: w.y * t.scale + t.ty };
}

/**
 * Zoom around a screen anchor (usually the cursor) so the world point beneath
 * the anchor stays fixed. `deltaScale` multiplies the current scale.
 */
export function zoomToCursor(
  t: Transform,
  cursor: Vec2,
  deltaScale: number,
): Transform {
  const nextScale = clampScale(t.scale * deltaScale);
  const world = screenToWorld(cursor, t);
  return {
    scale: nextScale,
    tx: cursor.x - world.x * nextScale,
    ty: cursor.y - world.y * nextScale,
  };
}

/** Convert a wheel deltaY into a smooth multiplicative zoom factor. */
export function wheelToScaleFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}

/**
 * Transform that frames a world-space rectangle centered in a viewport of the
 * given pixel size, at `targetScale` (clamped).
 */
export function frameRect(
  rect: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  targetScale: number,
): Transform {
  const scale = clampScale(targetScale);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return {
    scale,
    tx: viewport.width / 2 - cx * scale,
    ty: viewport.height / 2 - cy * scale,
  };
}

export function lerpTransform(a: Transform, b: Transform, u: number): Transform {
  return {
    tx: a.tx + (b.tx - a.tx) * u,
    ty: a.ty + (b.ty - a.ty) * u,
    scale: a.scale + (b.scale - a.scale) * u,
  };
}
