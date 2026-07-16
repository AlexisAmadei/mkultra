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

/** Size presets sticky notes can be created or resized to. */
export const STICKY_SIZES = {
  small: { width: 90, height: 90 },
  default: { width: 180, height: 180 },
} as const;
export type StickySizeKey = keyof typeof STICKY_SIZES;

/** Cap on how many actions the undo/redo history retains. */
const HISTORY_LIMIT = 100;

/** Card fields an inline edit can change (undo/redo tracks these individually). */
const EDIT_FIELDS = ["title", "body", "url", "color"] as const satisfies readonly (keyof Card)[];

/**
 * Generate a PocketBase-compatible record id client-side so that a create can
 * be undone (delete) and redone (re-create) with a *stable* id. Stable ids keep
 * connection references valid and the undo stack consistent across replays.
 */
function newId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 15; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

/** Scalar payload for persisting a card (files are handled separately). */
function cardPayload(c: Card) {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    body: c.body,
    url: c.url,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    rotation: c.rotation,
    color: c.color,
    z: c.z,
  };
}

function defaultsFor(
  type: CardType,
  at: Vec2,
  sizeOverride?: { width: number; height: number },
): Omit<Card, "id"> {
  const size = sizeOverride ?? DEFAULT_SIZE[type];
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

/** A reversible action on the board. `undo`/`redo` perform the real mutations. */
interface Command {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface BoardState {
  cards: Record<string, Card>;
  connections: Record<string, Connection>;
  transform: Transform;
  mode: Mode;
  selectedId: string | null;
  loaded: boolean;
  error: string | null;

  /** Undo history: performed actions (oldest first). */
  past: Command[];
  /** Redo history: undone actions available to replay (oldest first). */
  future: Command[];
  /** True while an undo/redo is replaying, so mutations don't re-record. */
  isReplaying: boolean;

  setTransform: (t: Transform) => void;
  setMode: (m: Mode) => void;
  select: (id: string | null) => void;

  load: () => Promise<void>;

  addCard: (
    type: CardType,
    at: Vec2,
    sizeOverride?: { width: number; height: number },
  ) => Promise<string | null>;
  /** Optimistic local update without persisting (use during drags). */
  updateCardLocal: (id: string, patch: Partial<Card>) => void;
  /** Persist the current local state of a card to PocketBase. */
  commitCard: (id: string) => Promise<void>;
  /** Persist a completed drag/resize and record it for undo (`before` = pre-drag snapshot). */
  commitCardMove: (id: string, before: Card) => Promise<void>;
  /** Persist an inline edit and record it for undo (`before` = snapshot at edit start). */
  commitEdit: (id: string, before: Card) => Promise<void>;
  /** Optimistic update + immediate persist (not recorded; use commitEdit for undoable edits). */
  patchCard: (id: string, patch: Partial<Card>) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  uploadFile: (id: string, field: "image" | "attachment", file: File) => Promise<void>;

  addConnection: (fromCard: string, toCard: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  /** Change a string's color and persist it (undoable). */
  setConnectionColor: (id: string, color: string) => Promise<void>;

  undo: () => Promise<void>;
  redo: () => Promise<void>;

  applyRemote: (
    kind: "card" | "connection",
    action: "create" | "update" | "delete",
    record: Card | Connection,
  ) => void;
}

export const useBoard = create<BoardState>()(
  subscribeWithSelector((set, get) => {
    /** Push a command onto the undo stack (unless we're mid-replay). */
    const record = (cmd: Command) => {
      if (get().isReplaying) return;
      set((s) => ({ past: [...s.past, cmd].slice(-HISTORY_LIMIT), future: [] }));
    };

    // --- Raw primitives: mutate local state + persist, without recording. ---
    // These are the building blocks the undo/redo commands are composed from.

    const insertCardRaw = async (card: Card) => {
      set((s) => ({ cards: { ...s.cards, [card.id]: card } }));
      try {
        await cardsApi.create(cardPayload(card));
      } catch (e) {
        set({ error: (e as Error).message });
      }
    };

    const deleteCardRaw = async (id: string) => {
      // Server cascade-deletes connections; mirror that locally.
      set((s) => {
        const cards = { ...s.cards };
        delete cards[id];
        const connections: Record<string, Connection> = {};
        for (const [cid, c] of Object.entries(s.connections)) {
          if (c.fromCard !== id && c.toCard !== id) connections[cid] = c;
        }
        return { cards, connections, selectedId: s.selectedId === id ? null : s.selectedId };
      });
      try {
        await cardsApi.delete(id);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    };

    const insertConnectionRaw = async (conn: Connection) => {
      set((s) => ({ connections: { ...s.connections, [conn.id]: conn } }));
      try {
        await connectionsApi.create({
          id: conn.id,
          fromCard: conn.fromCard,
          toCard: conn.toCard,
          color: conn.color,
          label: conn.label,
        });
      } catch (e) {
        set({ error: (e as Error).message });
      }
    };

    const deleteConnectionRaw = async (id: string) => {
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
    };

    const setConnectionColorRaw = async (id: string, color: string) => {
      set((s) => {
        const conn = s.connections[id];
        if (!conn) return s;
        return { connections: { ...s.connections, [id]: { ...conn, color } } };
      });
      try {
        await connectionsApi.update(id, { color });
      } catch (e) {
        set({ error: (e as Error).message });
      }
    };

    /** Local update + persist a subset of card fields (used by edit/move replays). */
    const applyCardFields = async (id: string, fields: Partial<Card>) => {
      get().updateCardLocal(id, fields);
      try {
        await cardsApi.update(id, fields);
      } catch (e) {
        set({ error: (e as Error).message });
      }
    };

    return {
      cards: {},
      connections: {},
      transform: { tx: 0, ty: 0, scale: 1 },
      mode: "view",
      selectedId: null,
      loaded: false,
      error: null,
      past: [],
      future: [],
      isReplaying: false,

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

      addCard: async (type, at, sizeOverride) => {
        // Cascade new cards so successive adds at the same point don't fully overlap.
        const step = (Object.keys(get().cards).length % 6) * 26;
        const card: Card = {
          id: newId(),
          ...defaultsFor(type, { x: at.x + step, y: at.y + step }, sizeOverride),
        };
        set((s) => ({ cards: { ...s.cards, [card.id]: card }, selectedId: card.id }));
        try {
          await cardsApi.create(cardPayload(card));
        } catch (e) {
          set({ error: (e as Error).message });
          return null;
        }
        record({
          label: "add card",
          undo: () => deleteCardRaw(card.id),
          redo: () => insertCardRaw(card),
        });
        return card.id;
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

      commitCardMove: async (id, before) => {
        const after = get().cards[id];
        if (!after) return;
        await get().commitCard(id);
        // A plain click only bumps z (bring-to-front); don't clutter history with it.
        const moved =
          before.x !== after.x ||
          before.y !== after.y ||
          before.width !== after.width ||
          before.height !== after.height ||
          before.rotation !== after.rotation;
        if (!moved) return;
        const geo = (c: Card): Partial<Card> => ({
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
          rotation: c.rotation,
        });
        const beforeGeo = geo(before);
        const afterGeo = geo(after);
        record({
          label: "move card",
          undo: () => applyCardFields(id, beforeGeo),
          redo: () => applyCardFields(id, afterGeo),
        });
      },

      commitEdit: async (id, before) => {
        const after = get().cards[id];
        if (!after) return;
        const changed = EDIT_FIELDS.filter((k) => before[k] !== after[k]);
        if (changed.length === 0) return; // blur without a real change
        const pick = (c: Card): Partial<Card> =>
          Object.fromEntries(changed.map((k) => [k, c[k]]));
        const beforeVals = pick(before);
        const afterVals = pick(after);
        try {
          await cardsApi.update(id, afterVals);
        } catch (e) {
          set({ error: (e as Error).message });
        }
        record({
          label: "edit card",
          undo: () => applyCardFields(id, beforeVals),
          redo: () => applyCardFields(id, afterVals),
        });
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
        const card = get().cards[id];
        if (!card) return;
        // Capture connections the server cascade will delete, so undo can restore them.
        const conns = Object.values(get().connections)
          .filter((c) => c.fromCard === id || c.toCard === id)
          .map((c) => ({ ...c }));
        await deleteCardRaw(id);
        record({
          label: "delete card",
          undo: async () => {
            await insertCardRaw(card);
            for (const c of conns) await insertConnectionRaw(c);
          },
          redo: () => deleteCardRaw(id),
        });
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
        const conn: Connection = {
          id: newId(),
          fromCard,
          toCard,
          color: "#b81d13",
          label: "",
        };
        await insertConnectionRaw(conn);
        record({
          label: "connect",
          undo: () => deleteConnectionRaw(conn.id),
          redo: () => insertConnectionRaw(conn),
        });
      },

      removeConnection: async (id) => {
        const conn = get().connections[id];
        if (!conn) return;
        const snap = { ...conn };
        await deleteConnectionRaw(id);
        record({
          label: "disconnect",
          undo: () => insertConnectionRaw(snap),
          redo: () => deleteConnectionRaw(id),
        });
      },

      setConnectionColor: async (id, color) => {
        const conn = get().connections[id];
        if (!conn || conn.color === color) return;
        const before = conn.color;
        await setConnectionColorRaw(id, color);
        record({
          label: "recolor string",
          undo: () => setConnectionColorRaw(id, before),
          redo: () => setConnectionColorRaw(id, color),
        });
      },

      undo: async () => {
        const { past, isReplaying } = get();
        if (isReplaying || past.length === 0) return;
        const cmd = past[past.length - 1];
        set({ isReplaying: true });
        try {
          await cmd.undo();
        } finally {
          set((s) => ({
            past: s.past.slice(0, -1),
            future: [...s.future, cmd],
            isReplaying: false,
          }));
        }
      },

      redo: async () => {
        const { future, isReplaying } = get();
        if (isReplaying || future.length === 0) return;
        const cmd = future[future.length - 1];
        set({ isReplaying: true });
        try {
          await cmd.redo();
        } finally {
          set((s) => ({
            future: s.future.slice(0, -1),
            past: [...s.past, cmd],
            isReplaying: false,
          }));
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
    };
  }),
);
