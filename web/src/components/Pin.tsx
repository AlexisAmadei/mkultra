import { useBoard } from "../store/boardStore";
import { useBoardContext } from "./BoardContext";

/** The push-pin at a card's top-center; also the handle to draw a string. */
export function Pin({ cardId }: { cardId: string }) {
  const mode = useBoard((s) => s.mode);
  const { startConnection } = useBoardContext();

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "edit") return;
    e.stopPropagation();
    e.preventDefault();
    startConnection(cardId, e.clientX, e.clientY);
  };

  return (
    <div className="pin" onPointerDown={onPointerDown} title={mode === "edit" ? "Drag to connect" : undefined}>
      <div className="head" />
      <div className="glint" />
    </div>
  );
}
