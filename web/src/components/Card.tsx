import { useRef } from "react";
import { STICKY_COLORS, STICKY_SIZES, useBoard } from "../store/boardStore";
import { fileUrl } from "../lib/pocketbase";
import type { Card as CardT } from "../types";
import { Pin } from "./Pin";
import { useBoardContext } from "./BoardContext";
import { focusRect } from "../hooks/usePanZoom";

const INTERACTIVE = new Set(["INPUT", "TEXTAREA", "BUTTON", "A"]);

function isInteractiveTarget(target: HTMLElement): boolean {
  return INTERACTIVE.has(target.tagName) || target.closest(".photo-frame") !== null;
}

// Grow a textarea to fit its content so wrapped title lines stay visible.
function fitToContent(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function Card({ card }: { card: CardT }) {
  const mode = useBoard((s) => s.mode);
  const ordering = useBoard((s) => s.ordering);
  const selected = useBoard((s) => s.selectedId === card.id);
  const editable = mode === "edit";
  const { viewportRef } = useBoardContext();
  const drag = useRef<{ startX: number; startY: number } | null>(null);
  // Snapshot of the card when a drag begins, so the move can be recorded for undo.
  const dragBefore = useRef<CardT | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isInteractiveTarget(e.target as HTMLElement)) return;
    // Order sub-mode: a click assigns/unassigns the card's sequence number.
    if (editable && ordering) {
      e.stopPropagation();
      void useBoard.getState().toggleCardOrder(card.id);
      return;
    }
    // Bring to front + select regardless of mode; only drag in edit mode.
    useBoard.getState().select(card.id);
    if (!editable) return;
    e.stopPropagation();
    dragBefore.current = { ...useBoard.getState().cards[card.id] };
    useBoard.getState().updateCardLocal(card.id, { z: Date.now() });
    drag.current = { startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).classList.add("dragging");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const scale = useBoard.getState().transform.scale;
    const dx = (e.clientX - drag.current.startX) / scale;
    const dy = (e.clientY - drag.current.startY) / scale;
    drag.current = { startX: e.clientX, startY: e.clientY };
    const c = useBoard.getState().cards[card.id];
    if (c) useBoard.getState().updateCardLocal(card.id, { x: c.x + dx, y: c.y + dy });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    const before = dragBefore.current;
    dragBefore.current = null;
    if (before) void useBoard.getState().commitCardMove(card.id, before);
    else void useBoard.getState().commitCard(card.id);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (INTERACTIVE.has((e.target as HTMLElement).tagName)) return;
    focusRect(viewportRef.current, card);
  };

  return (
    <div
      className={`card card-${card.type}${card.type === "sticky" && card.width <= STICKY_SIZES.small.width ? " card-sticky-small" : ""}${editable ? " editable" : ""}${editable && ordering ? " ordering" : ""}${selected ? " selected" : ""}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        transform: `rotate(${card.rotation}deg)`,
        // @ts-expect-error custom property
        "--card-color": card.color,
        zIndex: Math.floor(card.z / 1000) % 1000,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    >
      <Pin cardId={card.id} />
      {card.order > 0 && mode !== "view" && (
        <div className="card-order-badge" title={`Order ${card.order}`}>
          {card.order}
        </div>
      )}
      {editable && (
        <button
          className="card-delete"
          title="Delete card"
          onClick={(e) => {
            e.stopPropagation();
            void useBoard.getState().removeCard(card.id);
          }}
        >
          ×
        </button>
      )}
      <CardBody card={card} editable={editable} />
    </div>
  );
}

function CardBody({ card, editable }: { card: CardT; editable: boolean }) {
  const editStart = useRef<CardT | null>(null);
  const patch = (p: Partial<CardT>) => useBoard.getState().updateCardLocal(card.id, p);
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (el) fitToContent(el);
  };
  const beginEdit = () => (editStart.current = { ...card });
  const saveEdit = () => {
    if (editStart.current) void useBoard.getState().commitEdit(card.id, editStart.current);
  };

  if (card.type === "photo") return <PhotoBody card={card} editable={editable} />;

  if (card.type === "sticky") return <StickyBody card={card} editable={editable} />;

  if (card.type === "document") {
    return (
      <>
        {editable ? (
          <input
            className="card-title"
            value={card.title}
            placeholder="Document title"
            onFocus={beginEdit}
            onChange={(e) => patch({ title: e.target.value })}
            onBlur={saveEdit}
          />
        ) : (
          <div className="card-title">{card.title || "Document"}</div>
        )}
        <div className="redaction" />
        <div className="redaction short" />
        {editable ? (
          <input
            className="card-input"
            value={card.url}
            placeholder="https://…"
            onFocus={beginEdit}
            onChange={(e) => patch({ url: e.target.value })}
            onBlur={saveEdit}
          />
        ) : card.url ? (
          <a className="card-url" href={card.url} target="_blank" rel="noreferrer">
            {card.url}
          </a>
        ) : null}
        <DocAttachment card={card} editable={editable} />
      </>
    );
  }

  // text / index card
  return (
    <>
      {editable ? (
        <>
          <textarea
            className="card-title"
            rows={1}
            ref={autoGrow}
            value={card.title}
            placeholder="Title"
            onFocus={beginEdit}
            onChange={(e) => {
              fitToContent(e.currentTarget);
              patch({ title: e.target.value });
            }}
            onBlur={saveEdit}
          />
          <textarea
            className="card-body"
            value={card.body}
            placeholder="Write a note…"
            onFocus={beginEdit}
            onChange={(e) => patch({ body: e.target.value })}
            onBlur={saveEdit}
          />
        </>
      ) : (
        <>
          {card.title && <div className="card-title">{card.title}</div>}
          <div className="card-body" style={{ whiteSpace: "pre-wrap" }}>
            {card.body}
          </div>
        </>
      )}
    </>
  );
}

function StickyBody({ card, editable }: { card: CardT; editable: boolean }) {
  const editStart = useRef<CardT | null>(null);
  const patch = (p: Partial<CardT>) => useBoard.getState().updateCardLocal(card.id, p);

  return (
    <>
      {editable ? (
        <textarea
          className="card-body sticky-memo"
          value={card.body}
          placeholder="Write a memo…"
          onFocus={() => (editStart.current = { ...card })}
          onChange={(e) => patch({ body: e.target.value })}
          onBlur={() => {
            if (editStart.current) void useBoard.getState().commitEdit(card.id, editStart.current);
          }}
        />
      ) : (
        <div className="card-body sticky-memo" style={{ whiteSpace: "pre-wrap" }}>
          {card.body}
        </div>
      )}
      {editable && (
        <div className="sticky-swatches">
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              className={`sticky-swatch${card.color === c ? " active" : ""}`}
              style={{ background: c }}
              title="Change color"
              onClick={(e) => {
                e.stopPropagation();
                const before = { ...card };
                useBoard.getState().updateCardLocal(card.id, { color: c });
                void useBoard.getState().commitEdit(card.id, before);
              }}
            />
          ))}
        </div>
      )}
      {editable && (
        <div className="sticky-sizes">
          {Object.entries(STICKY_SIZES).map(([key, size]) => (
            <button
              key={key}
              className={`sticky-size-btn${card.width === size.width && card.height === size.height ? " active" : ""}`}
              title={key === "small" ? "Small size" : "Default size"}
              onClick={(e) => {
                e.stopPropagation();
                const before = { ...card };
                // Resize around the card's current center so it doesn't jump.
                const cx = card.x + card.width / 2;
                const cy = card.y + card.height / 2;
                useBoard.getState().updateCardLocal(card.id, {
                  width: size.width,
                  height: size.height,
                  x: Math.round(cx - size.width / 2),
                  y: Math.round(cy - size.height / 2),
                });
                void useBoard.getState().commitCardMove(card.id, before);
              }}
            >
              {key === "small" ? "S" : "M"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function PhotoBody({ card, editable }: { card: CardT; editable: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const editStart = useRef<CardT | null>(null);
  const src = fileUrl(card.id, card.image);
  return (
    <>
      <div
        className="photo-frame"
        style={src ? { backgroundImage: `url(${src})` } : undefined}
        onClick={() => editable && inputRef.current?.click()}
        title={editable ? "Click to upload a photo" : undefined}
      >
        {!src && (editable ? "Click to add photo" : "No photo")}
      </div>
      {editable ? (
        <input
          className="caption"
          style={{ border: "none", background: "transparent", textAlign: "center" }}
          value={card.title}
          placeholder="caption…"
          onFocus={() => (editStart.current = { ...card })}
          onChange={(e) => useBoard.getState().updateCardLocal(card.id, { title: e.target.value })}
          onBlur={() => {
            if (editStart.current) void useBoard.getState().commitEdit(card.id, editStart.current);
          }}
        />
      ) : (
        <div className="caption">{card.title}</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void useBoard.getState().uploadFile(card.id, "image", f);
        }}
      />
    </>
  );
}

function DocAttachment({ card, editable }: { card: CardT; editable: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const href = fileUrl(card.id, card.attachment);
  return (
    <>
      {href ? (
        <a className="card-url" href={href} target="_blank" rel="noreferrer">
          📎 {card.attachment}
        </a>
      ) : null}
      {editable && (
        <>
          <button
            className="card-input"
            style={{ cursor: "pointer" }}
            onClick={() => inputRef.current?.click()}
          >
            {href ? "Replace file…" : "Attach file…"}
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void useBoard.getState().uploadFile(card.id, "attachment", f);
            }}
          />
        </>
      )}
    </>
  );
}
