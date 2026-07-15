import { useEffect } from "react";
import { useBoard } from "../store/boardStore";
import { cardsApi, connectionsApi, recordToCard, recordToConnection } from "../lib/pocketbase";

/**
 * Loads the board once and subscribes to PocketBase realtime so other tabs /
 * the admin UI stay in sync. Local optimistic updates already reflect our own
 * edits; realtime just folds in external changes.
 */
export function useSync() {
  useEffect(() => {
    void useBoard.getState().load();

    const unsubCards = cardsApi.subscribe("*", (e) => {
      useBoard.getState().applyRemote(
        "card",
        e.action as "create" | "update" | "delete",
        recordToCard(e.record),
      );
    });
    const unsubConns = connectionsApi.subscribe("*", (e) => {
      useBoard.getState().applyRemote(
        "connection",
        e.action as "create" | "update" | "delete",
        recordToConnection(e.record),
      );
    });

    return () => {
      void unsubCards.then((u) => u());
      void unsubConns.then((u) => u());
    };
  }, []);
}
