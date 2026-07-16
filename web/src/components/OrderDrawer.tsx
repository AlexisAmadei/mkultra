import { useState } from "react";
import { useBoard } from "../store/boardStore";
import { orderedCards } from "../hooks/usePresentation";
import { useBoardContext } from "./BoardContext";
import { focusRect } from "../hooks/usePanZoom";
import type { Card } from "../types";

/** Short human label for a card row in the order list. */
function cardLabel(c: Card): string {
  const text = (c.title || c.body || "").trim().replace(/\s+/g, " ");
  if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return `${c.type} card`;
}

/**
 * Right-side pop-in drawer, shown while the Order sub-mode is active. Lists the
 * ordered cards and lets you drag-and-drop to renumber them (persisted, undoable).
 */
export function OrderDrawer() {
  const mode = useBoard((s) => s.mode);
  const ordering = useBoard((s) => s.ordering);
  const cards = useBoard((s) => s.cards);
  const { viewportRef } = useBoardContext();

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const open = mode === "edit" && ordering;
  const seq = orderedCards(cards);

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ids = seq.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    void useBoard.getState().reorderCards(ids);
    setDragId(null);
    setOverId(null);
  };

  return (
    <aside className={`order-drawer${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="order-drawer__header">
        <span className="order-drawer__title">Presentation order</span>
        <button
          className="order-drawer__close"
          title="Exit order mode"
          onClick={() => useBoard.getState().setOrdering(false)}
        >
          ×
        </button>
      </div>

      {seq.length === 0 ? (
        <p className="order-drawer__empty">
          Click cards on the board to add them to the presentation sequence.
        </p>
      ) : (
        <ol className="order-drawer__list">
          {seq.map((c) => (
            <li
              key={c.id}
              className={`order-row${dragId === c.id ? " dragging" : ""}${overId === c.id ? " over" : ""}`}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overId !== c.id) setOverId(c.id);
              }}
              onDrop={() => onDrop(c.id)}
              onClick={() => focusRect(viewportRef.current, c)}
              title="Drag to reorder · click to focus on board"
            >
              <span className="order-row__grip" aria-hidden>
                ⋮⋮
              </span>
              <span className="order-row__num">{c.order}</span>
              <span className="order-row__label">{cardLabel(c)}</span>
              <button
                className="order-row__remove"
                title="Remove from order"
                onClick={(e) => {
                  e.stopPropagation();
                  void useBoard.getState().toggleCardOrder(c.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
