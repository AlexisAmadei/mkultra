import PocketBase, { type RecordModel } from "pocketbase";
import type { Card, Connection } from "../types";

/**
 * PocketBase client singleton. In dev, Vite proxies `/api` -> :8090 (see
 * vite.config.ts), so a relative base URL works from any host.
 */
export const pb = new PocketBase(import.meta.env.VITE_PB_URL ?? "/");

// Local tool: keep long-lived, unauthenticated access simple.
pb.autoCancellation(false);

const CARD_FIELDS = [
  "id",
  "type",
  "title",
  "body",
  "url",
  "image",
  "attachment",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "color",
  "z",
  "order",
] as const;

export function recordToCard(r: RecordModel): Card {
  return {
    id: r.id,
    type: r.type ?? "text",
    title: r.title ?? "",
    body: r.body ?? "",
    url: r.url ?? "",
    image: r.image ?? "",
    attachment: r.attachment ?? "",
    x: Number(r.x ?? 0),
    y: Number(r.y ?? 0),
    width: Number(r.width ?? 220),
    height: Number(r.height ?? 160),
    rotation: Number(r.rotation ?? 0),
    color: r.color ?? "",
    z: Number(r.z ?? 0),
    order: Number(r.order ?? 0),
  };
}

export function recordToConnection(r: RecordModel): Connection {
  return {
    id: r.id,
    fromCard: r.fromCard ?? "",
    toCard: r.toCard ?? "",
    color: r.color ?? "#b81d13",
    label: r.label ?? "",
  };
}

/** Absolute URL for a file stored on a `cards` record, or "" if none. */
export function fileUrl(cardId: string, filename: string): string {
  if (!filename) return "";
  return pb.files.getURL(
    { id: cardId, collectionName: "cards" } as RecordModel,
    filename,
  );
}

export const cardsApi = pb.collection("cards");
export const connectionsApi = pb.collection("connections");
export { CARD_FIELDS };
