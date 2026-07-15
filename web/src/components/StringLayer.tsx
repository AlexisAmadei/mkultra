import { useBoard } from "../store/boardStore";
import { pinAnchor, yarnPath } from "../lib/geometry";
import type { Vec2 } from "../types";

const OFFSET = 50000; // big canvas so far-flung cards still render

export function StringLayer({ pending }: { pending: { from: Vec2; to: Vec2 } | null }) {
  const cards = useBoard((s) => s.cards);
  const connections = useBoard((s) => s.connections);
  const mode = useBoard((s) => s.mode);

  return (
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
            {/* wide invisible hit area for click-to-delete in edit mode */}
            {mode === "edit" && (
              <path
                d={d}
                stroke="transparent"
                strokeWidth={16}
                fill="none"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={() => void useBoard.getState().removeConnection(conn.id)}
              >
                <title>Click to cut this string</title>
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
  );
}
