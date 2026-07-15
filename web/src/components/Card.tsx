import { useRef } from "react";
import { STICKY_COLORS, useBoard } from "../store/boardStore";
import { fileUrl } from "../lib/pocketbase";
import type { Card as CardT } from "../types";
import { Pin } from "./Pin";
import { useBoardContext } from "./BoardContext";
import { focusRect } from "../hooks/usePanZoom";

const INTERACTIVE = new Set(["INPUT", "TEXTAREA", "BUTTON", "A"]);

function isInteractiveTarget(target: HTMLElement): boolean {
  return INTERACTIVE.has(target.tagName) || target.closest(".photo-frame") !== null;
}

export function Card({ card }: { card: CardT }) {
  const mode = useBoard((s) => s.mode);
  const selected = useBoard((s) => s.selectedId === card.id);
  const editable = mode === "edit";
  const { viewportRef } = useBoardContext();
  const drag = useRef<{ startX: number; startY: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isInteractiveTarget(e.target as HTMLElement)) return;
    // Bring to front + select regardless of mode; only drag in edit mode.
    useBoard.getState().select(card.id);
    if (!editable) return;
    e.stopPropagation();
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
    void useBoard.getState().commitCard(card.id);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (isInteractiveTarget(e.target as HTMLElement)) return;
    focusRect(viewportRef.current, card);
  };

  return (
    <div
      className={`card card-${card.type}${editable ? " editable" : ""}${selected ? " selected" : ""}`}
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
  const patch = (p: Partial<CardT>) => useBoard.getState().updateCardLocal(card.id, p);
  const commit = (p: Partial<CardT>) => void useBoard.getState().patchCard(card.id, p);

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
            onChange={(e) => patch({ title: e.target.value })}
            onBlur={(e) => commit({ title: e.target.value })}
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
            onChange={(e) => patch({ url: e.target.value })}
            onBlur={(e) => commit({ url: e.target.value })}
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
          <input
            className="card-title"
            value={card.title}
            placeholder="Title"
            onChange={(e) => patch({ title: e.target.value })}
            onBlur={(e) => commit({ title: e.target.value })}
          />
          <textarea
            className="card-body"
            value={card.body}
            placeholder="Write a note…"
            onChange={(e) => patch({ body: e.target.value })}
            onBlur={(e) => commit({ body: e.target.value })}
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
  const patch = (p: Partial<CardT>) => useBoard.getState().updateCardLocal(card.id, p);
  const commit = (p: Partial<CardT>) => void useBoard.getState().patchCard(card.id, p);

  return (
    <>
      {editable ? (
        <textarea
          className="card-body sticky-memo"
          value={card.body}
          placeholder="Write a memo…"
          onChange={(e) => patch({ body: e.target.value })}
          onBlur={(e) => commit({ body: e.target.value })}
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
                commit({ color: c });
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PhotoBody({ card, editable }: { card: CardT; editable: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
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
          onChange={(e) => useBoard.getState().updateCardLocal(card.id, { title: e.target.value })}
          onBlur={(e) => useBoard.getState().patchCard(card.id, { title: e.target.value })}
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
