import { describe, expect, it } from "vitest";
import {
  clampScale,
  frameRect,
  MAX_SCALE,
  MIN_SCALE,
  screenToWorld,
  worldToScreen,
  zoomToCursor,
} from "./panzoom-math";
import type { Transform } from "../types";

const T: Transform = { tx: 120, ty: -40, scale: 1.5 };

describe("screenToWorld / worldToScreen", () => {
  it("round-trips a point", () => {
    const screen = { x: 300, y: 220 };
    const world = screenToWorld(screen, T);
    const back = worldToScreen(world, T);
    expect(back.x).toBeCloseTo(screen.x, 6);
    expect(back.y).toBeCloseTo(screen.y, 6);
  });

  it("maps the origin through the transform", () => {
    expect(worldToScreen({ x: 0, y: 0 }, T)).toEqual({ x: 120, y: -40 });
  });
});

describe("zoomToCursor", () => {
  it("keeps the world point under the cursor fixed", () => {
    const cursor = { x: 400, y: 260 };
    const before = screenToWorld(cursor, T);
    const next = zoomToCursor(T, cursor, 1.7);
    const after = screenToWorld(cursor, next);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.scale).toBeCloseTo(1.5 * 1.7, 6);
  });

  it("respects scale clamps", () => {
    expect(zoomToCursor(T, { x: 0, y: 0 }, 100).scale).toBe(MAX_SCALE);
    expect(zoomToCursor(T, { x: 0, y: 0 }, 0.0001).scale).toBe(MIN_SCALE);
  });
});

describe("clampScale", () => {
  it("bounds the scale", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(1)).toBe(1);
  });
});

describe("frameRect", () => {
  it("centers a rect in the viewport", () => {
    const t = frameRect(
      { x: 100, y: 100, width: 200, height: 100 },
      { width: 800, height: 600 },
      1,
    );
    const center = worldToScreen({ x: 200, y: 150 }, t);
    expect(center.x).toBeCloseTo(400, 6);
    expect(center.y).toBeCloseTo(300, 6);
  });
});
