import { STICKY_SIZES, useBoard } from "../store/boardStore";
import { useBoardContext } from "./BoardContext";
import { animateTransform } from "../hooks/usePanZoom";
import { frameRect, screenToWorld, zoomToCursor } from "../hooks/panzoom-math";
import type { CardType } from "../types";

export function Toolbar() {
  const mode = useBoard((s) => s.mode);
  const canUndo = useBoard((s) => s.past.length > 0);
  const canRedo = useBoard((s) => s.future.length > 0);
  const { viewportRef } = useBoardContext();

  const viewportRect = () => viewportRef.current?.getBoundingClientRect();

  const addCard = (type: CardType, sizeOverride?: { width: number; height: number }) => {
    const r = viewportRect();
    const t = useBoard.getState().transform;
    const center = r
      ? screenToWorld({ x: r.width / 2, y: r.height / 2 }, t)
      : { x: 0, y: 0 };
    void useBoard.getState().addCard(type, center, sizeOverride);
  };

  const zoom = (factor: number) => {
    const r = viewportRect();
    const t = useBoard.getState().transform;
    const anchor = r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 };
    animateTransform(zoomToCursor(t, anchor, factor));
  };

  const fitAll = () => {
    const r = viewportRect();
    const cards = Object.values(useBoard.getState().cards);
    if (!r) return;
    if (cards.length === 0) {
      animateTransform({ tx: 0, ty: 0, scale: 1 });
      return;
    }
    const pad = 120;
    const minX = Math.min(...cards.map((c) => c.x)) - pad;
    const minY = Math.min(...cards.map((c) => c.y)) - pad;
    const maxX = Math.max(...cards.map((c) => c.x + c.width)) + pad;
    const maxY = Math.max(...cards.map((c) => c.y + c.height)) + pad;
    const box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const scale = Math.min(r.width / box.width, r.height / box.height, 1.4);
    animateTransform(frameRect(box, { width: r.width, height: r.height }, scale));
  };

  return (
    <div className="toolbar">
      <span className="brand">PROJET MK-ULTRA</span>
      <div className="mode-toggle">
        <button
          className={mode === "view" ? "active" : ""}
          onClick={() => useBoard.getState().setMode("view")}
        >
          View
        </button>
        <button
          className={mode === "edit" ? "active" : ""}
          onClick={() => useBoard.getState().setMode("edit")}
        >
          Edit
        </button>
      </div>

      {mode === "edit" && (
        <>
          <span className="sep" />
          <button onClick={() => addCard("text")} title="Add index card">＋ Note</button>
          <button onClick={() => addCard("sticky")} title="Add sticky note">＋ Sticky</button>
          <button onClick={() => addCard("photo")} title="Add photo">＋ Photo</button>
          <button onClick={() => addCard("document")} title="Add document">＋ Doc</button>
        </>
      )}

      {mode === "edit" && (
        <>
          <span className="sep" />
          <button
            onClick={() => void useBoard.getState().undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={() => void useBoard.getState().redo()}
            disabled={!canRedo}
            title="Redo"
          >
            ↷ Redo
          </button>
        </>
      )}

      <span className="sep" />
      <button onClick={() => zoom(1.25)} title="Zoom in">＋</button>
      <button onClick={() => zoom(0.8)} title="Zoom out">－</button>
      <button onClick={fitAll} title="Fit board to view">Fit</button>
    </div>
  );
}
