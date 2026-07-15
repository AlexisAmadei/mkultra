import { useCallback, useEffect, useRef, useState } from "react";
import { useBoard } from "../store/boardStore";
import { usePanZoom } from "../hooks/usePanZoom";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { screenToWorld } from "../hooks/panzoom-math";
import { pinAnchor } from "../lib/geometry";
import { BoardContext } from "./BoardContext";
import { CardLayer } from "./CardLayer";
import { StringLayer } from "./StringLayer";
import { Toolbar } from "./Toolbar";
import type { Transform, Vec2 } from "../types";

const CORK_TILE_PX = 500;

/** Applies the store transform to the world div imperatively (no card re-render on pan). */
function WorldLayer({
  children,
  viewportRef,
}: {
  children: React.ReactNode;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = (t: Transform) => {
      if (ref.current) ref.current.style.transform = `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`;
      if (viewportRef.current) {
        viewportRef.current.style.backgroundSize = `${CORK_TILE_PX * t.scale}px auto`;
        viewportRef.current.style.backgroundPosition = `${t.tx}px ${t.ty}px`;
      }
    };
    apply(useBoard.getState().transform);
    return useBoard.subscribe((s) => s.transform, apply);
  }, [viewportRef]);
  return (
    <div className="world" ref={ref}>
      {children}
    </div>
  );
}

export function Board() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const mode = useBoard((s) => s.mode);
  const error = useBoard((s) => s.error);

  usePanZoom(el);
  useUndoRedo();

  // Pending connection drag (edit mode: pin -> another card).
  const [pending, setPending] = useState<{ from: Vec2; to: Vec2 } | null>(null);
  const pendingFrom = useRef<string | null>(null);

  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    const r = viewportRef.current?.getBoundingClientRect();
    const t = useBoard.getState().transform;
    const local = r ? { x: clientX - r.left, y: clientY - r.top } : { x: clientX, y: clientY };
    return screenToWorld(local, t);
  }, []);

  const startConnection = useCallback(
    (fromCardId: string, clientX: number, clientY: number) => {
      const card = useBoard.getState().cards[fromCardId];
      if (!card) return;
      pendingFrom.current = fromCardId;
      setPending({ from: pinAnchor(card), to: toWorld(clientX, clientY) });

      const onMove = (e: PointerEvent) => {
        const card2 = useBoard.getState().cards[fromCardId];
        if (!card2) return;
        setPending({ from: pinAnchor(card2), to: toWorld(e.clientX, e.clientY) });
      };
      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const drop = toWorld(e.clientX, e.clientY);
        const target = Object.values(useBoard.getState().cards).find(
          (c) =>
            c.id !== fromCardId &&
            drop.x >= c.x &&
            drop.x <= c.x + c.width &&
            drop.y >= c.y &&
            drop.y <= c.y + c.height,
        );
        if (target) void useBoard.getState().addConnection(fromCardId, target.id);
        pendingFrom.current = null;
        setPending(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toWorld],
  );

  return (
    <BoardContext.Provider value={{ viewportRef, startConnection }}>
      <div
        className={`viewport mode-${mode}`}
        ref={(node) => {
          viewportRef.current = node;
          setEl(node);
        }}
      >
        <WorldLayer viewportRef={viewportRef}>
          <StringLayer pending={pending} />
          <CardLayer />
        </WorldLayer>
      </div>
      <div className="vignette" />
      <Toolbar />
      {error && <div className="error-banner">Sync error: {error}</div>}
      <div className="hint">
        {mode === "edit"
          ? "Drag cards to move · drag a pin to another card to connect · double-click to focus · scroll to zoom"
          : "Drag to pan · scroll to zoom · double-click a card to focus"}
      </div>
    </BoardContext.Provider>
  );
}
