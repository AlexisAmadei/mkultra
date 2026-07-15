import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Card, CardType, Connection, Mode, Transform, Vec2 } from "../types";
import {
  cardsApi,
  connectionsApi,
  recordToCard,
  recordToConnection,
} from "../lib/pocketbase";

const DEFAULT_SIZE: Record<CardType, { width: number; height: number }> = {
  text: { width: 240, height: 170 },
  photo: { width: 220, height: 250 },
  document: { width: 240, height: 180 },
  sticky: { width: 180, height: 180 },
};

const DEFAULT_COLOR: Record<CardType, string> = {
  text: "#fef3c7", // sticky yellow
  photo: "#ffffff",
  document: "#e7ddc7", // aged paper
  sticky: "#fef3c7",
};

/** Pastel swatches sticky notes can be assigned, cycled at creation time. */
export const STICKY_COLORS = ["#fef3c7", "#ffd6e8", "#d6f0ff", "#d9f7d6", "#e6d9ff", "#ffe3c2"];

function defaultsFor(type: CardType, at: Vec2): Omit<Card, "id"> {
  const size = DEFAULT_SIZE[type];
  return {
    type,
    title: type === "text" ? "" : type === "photo" ? "" : "Document",
    body: "",
    url: "",
    image: "",
    attachment: "",
    x: Math.round(at.x - size.width / 2),
    y: Math.round(at.y - size.height / 2),
    width: size.width,
    height: size.height,
    rotation: Math.round((Math.random() - 0.5) * 6), // subtle tilt
    color: type === "sticky" ? STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)] : DEFAULT_COLOR[type],
    z: Date.now(),
  };
}

interface BoardState {
  cards: Record<string, Card>;
  connections: Record<string, Connection>;
  transform: Transform;
  mode: Mode;
  selectedId: string | null;
  loaded: boolean;
  error: string | null;

  setTransform: (t: Transform) => void;
  setMode: (m: Mode) => void;
  select: (id: string | null) => void;

  load: () => Promise<void>;

  addCard: (type: CardType, at: Vec2) => Promise<string | null>;
  /** Optimistic local update without persisting (use during drags). */
  updateCardLocal: (id: string, patch: Partial<Card>) => void;
  /** Persist the current local state of a card to PocketBase. */
  commitCard: (id: string) => Promise<void>;
  /** Optimistic update + immediate persist (text edits, color, etc.). */
  patchCard: (id: string, patch: Partial<Card>) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  uploadFile: (id: string, field: "image" | "attachment", file: File) => Promise<void>;

  addConnection: (fromCard: string, toCard: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;

  applyRemote: (
    kind: "card" | "connection",
    action: "create" | "update" | "delete",
    record: Card | Connection,
  ) => void;
}

export const useBoard = create<BoardState>()(
  subscribeWithSelector((set, get) => ({
  cards: {},
  connections: {},
  transform: { tx: 0, ty: 0, scale: 1 },
  mode: "view",
  selectedId: null,
  loaded: false,
  error: null,

  setTransform: (t) => set({ transform: t }),
  setMode: (mode) => set({ mode, selectedId: mode === "view" ? null : get().selectedId }),
  select: (id) => set({ selectedId: id }),

  load: async () => {
    try {
      const [cardRecords, connRecords] = await Promise.all([
        cardsApi.getFullList({ sort: "z" }),
        connectionsApi.getFullList(),
      ]);
      const cards: Record<string, Card> = {};
      for (const r of cardRecords) cards[r.id] = recordToCard(r);
      const connections: Record<string, Connection> = {};
      for (const r of connRecords) connections[r.id] = recordToConnection(r);
      set({ cards, connections, loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    }
  },

  addCard: async (type, at) => {
    try {
      // Cascade new cards so successive adds at the same point don't fully overlap.
      const step = (Object.keys(get().cards).length % 6) * 26;
      const record = await cardsApi.create(
        defaultsFor(type, { x: at.x + step, y: at.y + step }),
      );
      const card = recordToCard(record);
      set((s) => ({ cards: { ...s.cards, [card.id]: card }, selectedId: card.id }));
      return card.id;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  updateCardLocal: (id, patch) =>
    set((s) => {
      const card = s.cards[id];
      if (!card) return s;
      return { cards: { ...s.cards, [id]: { ...card, ...patch } } };
    }),

  commitCard: async (id) => {
    const card = get().cards[id];
    if (!card) return;
    try {
      await cardsApi.update(id, {
        title: card.title,
        body: card.body,
        url: card.url,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        rotation: card.rotation,
        color: card.color,
        z: card.z,
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  patchCard: async (id, patch) => {
    get().updateCardLocal(id, patch);
    try {
      await cardsApi.update(id, patch);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  removeCard: async (id) => {
    // Drop the card and any connections touching it.
    set((s) => {
      const cards = { ...s.cards };
      delete cards[id];
      const connections: Record<string, Connection> = {};
      for (const [cid, c] of Object.entries(s.connections)) {
        if (c.fromCard !== id && c.toCard !== id) connections[cid] = c;
      }
      return {
        cards,
        connections,
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    });
    try {
      await cardsApi.delete(id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  uploadFile: async (id, field, file) => {
    try {
      const form = new FormData();
      form.append(field, file);
      const record = await cardsApi.update(id, form);
      set((s) => ({ cards: { ...s.cards, [id]: recordToCard(record) } }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  addConnection: async (fromCard, toCard) => {
    if (fromCard === toCard) return;
    // Avoid duplicate strings between the same pair (either direction).
    const exists = Object.values(get().connections).some(
      (c) =>
        (c.fromCard === fromCard && c.toCard === toCard) ||
        (c.fromCard === toCard && c.toCard === fromCard),
    );
    if (exists) return;
    try {
      const record = await connectionsApi.create({
        fromCard,
        toCard,
        color: "#b81d13",
        label: "",
      });
      const conn = recordToConnection(record);
      set((s) => ({ connections: { ...s.connections, [conn.id]: conn } }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  removeConnection: async (id) => {
    set((s) => {
      const connections = { ...s.connections };
      delete connections[id];
      return { connections };
    });
    try {
      await connectionsApi.delete(id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  applyRemote: (kind, action, record) => {
    set((s) => {
      if (kind === "card") {
        const cards = { ...s.cards };
        if (action === "delete") delete cards[record.id];
        else cards[record.id] = record as Card;
        return { cards };
      }
      const connections = { ...s.connections };
      if (action === "delete") delete connections[record.id];
      else connections[record.id] = record as Connection;
      return { connections };
    });
  },
  })),
);
