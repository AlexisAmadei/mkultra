import type { Card, Vec2 } from "../types";

/** The pin sits at the top-center of a card — where the string is anchored. */
export function pinAnchor(card: Card): Vec2 {
  return { x: card.x + card.width / 2, y: card.y + 14 };
}

export function cardCenter(card: Card): Vec2 {
  return { x: card.x + card.width / 2, y: card.y + card.height / 2 };
}

/**
 * SVG cubic-bezier path between two pins with a downward "sag" so the string
 * droops like yarn under gravity. Sag grows with horizontal span.
 */
export function yarnPath(a: Vec2, b: Vec2): string {
  const dx = b.x - a.x;
  const dist = Math.hypot(dx, b.y - a.y);
  const sag = Math.min(120, dist * 0.22);
  const c1 = { x: a.x + dx * 0.3, y: a.y + sag };
  const c2 = { x: a.x + dx * 0.7, y: b.y + sag };
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}
