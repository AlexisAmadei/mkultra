import { useEffect, useRef } from "react";
import { useBoard } from "../store/boardStore";
import {
  frameRect,
  lerpTransform,
  screenToWorld,
  wheelToScaleFactor,
  zoomToCursor,
} from "./panzoom-math";
import type { Transform, Vec2 } from "../types";

/** Cursor position relative to the given element's top-left. */
function localPoint(el: HTMLElement, clientX: number, clientY: number): Vec2 {
  const rect = el.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function useViewportPoint() {
  const ref = useRef<HTMLElement | null>(null);
  return {
    ref,
    toWorld: (clientX: number, clientY: number): Vec2 => {
      const el = ref.current;
      const t = useBoard.getState().transform;
      if (!el) return screenToWorld({ x: clientX, y: clientY }, t);
      return screenToWorld(localPoint(el, clientX, clientY), t);
    },
  };
}

/**
 * Attaches wheel-zoom (anchored at cursor) and drag-to-pan to `el`. Panning
 * only starts when the pointer goes down on the element itself (empty board),
 * not on a card — cards call `stopPropagation`.
 */
export function usePanZoom(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = useBoard.getState().transform;
      const cursor = localPoint(el, e.clientX, e.clientY);
      useBoard.getState().setTransform(zoomToCursor(t, cursor, wheelToScaleFactor(e.deltaY)));
    };

    let panning = false;
    let last: Vec2 | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      // Only pan from the empty board — never when starting on a card or pin.
      // (React's stopPropagation can't stop this native listener, so check here.)
      if ((e.target as Element | null)?.closest?.(".card")) return;
      panning = true;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!panning || !last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      const t = useBoard.getState().transform;
      useBoard.getState().setTransform({ ...t, tx: t.tx + dx, ty: t.ty + dy });
    };
    const endPan = (e: PointerEvent) => {
      if (!panning) return;
      panning = false;
      last = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = "";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endPan);
    el.addEventListener("pointercancel", endPan);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPan);
      el.removeEventListener("pointercancel", endPan);
    };
  }, [el]);
}

/** Smoothly animate the store transform to a target over ~350ms. */
export function animateTransform(to: Transform) {
  const from = useBoard.getState().transform;
  const start = performance.now();
  const dur = 350;
  const tick = (now: number) => {
    const u = Math.min(1, (now - start) / dur);
    // easeInOutCubic
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    useBoard.getState().setTransform(lerpTransform(from, to, e));
    if (u < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Frame a world rect (e.g. a card) in the given viewport element and animate to it. */
export function focusRect(
  el: HTMLElement | null,
  rect: { x: number; y: number; width: number; height: number },
  targetScale = 1.4,
) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  animateTransform(frameRect(rect, { width: r.width, height: r.height }, targetScale));
}
