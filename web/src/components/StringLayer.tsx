import { useEffect, useState } from "react";
import { useBoard } from "../store/boardStore";
import { pinAnchor, yarnPath } from "../lib/geometry";
import type { Vec2 } from "../types";

const OFFSET = 50000; // big canvas so far-flung cards still render

/** Colors offered in the right-click recolor menu. */
const STRING_COLORS: { name: string; value: string }[] = [
  { name: "Red", value: "#b81d13" },
  { name: "Blue", value: "#1d4ed8" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#16a34a" },
  { name: "White", value: "#f8fafc" },
];

type Menu = { connId: string; x: number; y: number };

export function StringLayer({ pending }: { pending: { from: Vec2; to: Vec2 } | null }) {
  const cards = useBoard((s) => s.cards);
  const connections = useBoard((s) => s.connections);
  const mode = useBoard((s) => s.mode);
  const [menu, setMenu] = useState<Menu | null>(null);

  // Dismiss the menu on any outside interaction or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <>
      <svg
        className="string-layer"
        width={OFFSET * 2}
        height={OFFSET * 2}
        viewBox={`${-OFFSET} ${-OFFSET} ${OFFSET * 2} ${OFFSET * 2}`}
        style={{ left: -OFFSET, top: -OFFSET }}
      >
        <defs>
          <filter id="yarn-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#460804" floodOpacity="0.45" />
          </filter>
        </defs>
        {Object.values(connections).map((conn) => {
          const a = cards[conn.fromCard];
          const b = cards[conn.toCard];
          if (!a || !b) return null;
          const d = yarnPath(pinAnchor(a), pinAnchor(b));
          return (
            <g key={conn.id} filter="url(#yarn-shadow)">
              {/* wide invisible hit area: click to cut, right-click to recolor (edit mode) */}
              {mode === "edit" && (
                <path
                  d={d}
                  stroke="transparent"
                  strokeWidth={16}
                  fill="none"
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onClick={() => void useBoard.getState().removeConnection(conn.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ connId: conn.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <title>Click to cut · right-click to recolor</title>
                </path>
              )}
              <path d={d} stroke={conn.color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
            </g>
          );
        })}
        {pending && (
          <path
            d={yarnPath(pending.from, pending.to)}
            stroke="#b81d13"
            strokeWidth={2.4}
            strokeDasharray="6 5"
            fill="none"
            strokeLinecap="round"
            opacity={0.85}
          />
        )}
      </svg>

      {menu && (
        <div
          className="string-color-menu"
          style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 1000 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {STRING_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="string-color-menu__item"
              onPointerDown={(e) => {
                e.stopPropagation();
                void useBoard.getState().setConnectionColor(menu.connId, c.value);
                setMenu(null);
              }}
            >
              <span
                className="string-color-menu__swatch"
                style={{ background: c.value }}
                aria-hidden
              />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
