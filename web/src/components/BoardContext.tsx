import { createContext, useContext, type RefObject } from "react";

export interface BoardContextValue {
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Begin dragging a red string out of the given card's pin (edit mode). */
  startConnection: (fromCardId: string, clientX: number, clientY: number) => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("BoardContext missing");
  return ctx;
}
