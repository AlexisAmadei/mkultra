import { useEffect } from "react";
import { useBoard } from "../store/boardStore";

/**
 * Binds Ctrl/Cmd+Z to undo. Redo is intentionally *not* bound to a key (it's
 * UI-button only). While a text field is focused we defer to the browser's
 * native field-level undo instead of hijacking the shortcut.
 */
export function useUndoRedo() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "z") return;
      if (e.shiftKey) return; // Ctrl+Shift+Z (redo) is not bound

      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return; // let the field's own undo handle it
      }

      e.preventDefault();
      void useBoard.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
