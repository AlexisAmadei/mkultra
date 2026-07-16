import { useEffect } from "react";
import { useBoard } from "../store/boardStore";
import { focusRect } from "./usePanZoom";
import type { Card } from "../types";

/** Cards with an assigned order (1..X), sorted into presentation sequence. */
export function orderedCards(cards: Record<string, Card>): Card[] {
  return Object.values(cards)
    .filter((c) => c.order > 0)
    .sort((a, b) => a.order - b.order);
}

/**
 * Present mode: steps through the ordered cards, animating the viewport to
 * focus each one. Arrow keys / Space / PageUp-Down advance; Escape exits to
 * view mode. Only active while `mode === "present"`.
 */
export function usePresentation(viewportRef: React.RefObject<HTMLDivElement | null>) {
  const mode = useBoard((s) => s.mode);
  const presentStep = useBoard((s) => s.presentStep);

  // Focus the current card whenever the step changes (or on entering present).
  useEffect(() => {
    if (mode !== "present") return;
    const seq = orderedCards(useBoard.getState().cards);
    const card = seq[presentStep];
    if (card) focusRect(viewportRef.current, card);
  }, [mode, presentStep, viewportRef]);

  useEffect(() => {
    if (mode !== "present") return;
    const onKey = (e: KeyboardEvent) => {
      const seq = orderedCards(useBoard.getState().cards);
      const step = useBoard.getState().presentStep;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown": {
          e.preventDefault();
          useBoard.getState().setPresentStep(Math.min(seq.length - 1, step + 1));
          break;
        }
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp": {
          e.preventDefault();
          useBoard.getState().setPresentStep(Math.max(0, step - 1));
          break;
        }
        case "Escape": {
          e.preventDefault();
          useBoard.getState().setMode("view");
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);
}
